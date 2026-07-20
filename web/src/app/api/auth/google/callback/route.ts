import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { writeAuditLog } from "@/lib/audit";
import { env } from "@/lib/env";
import { exchangeCodeForTokens } from "@/lib/google/oauth";
import { saveGoogleTokens } from "@/lib/google/tokens";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    const desc = searchParams.get("error_description") ?? error;
    return NextResponse.redirect(
      `${env.appUrl()}/dashboard?google_error=${encodeURIComponent(desc)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${env.appUrl()}/dashboard?google_error=missing_code`,
    );
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get("google_oauth_state")?.value;
  cookieStore.delete("google_oauth_state");

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(
      `${env.appUrl()}/dashboard?google_error=invalid_state`,
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600_000);

    await saveGoogleTokens(
      tokens.access_token!,
      tokens.refresh_token!,
      tokens.scope ?? "",
      expiresAt,
    );

    await writeAuditLog("google.connected", "google_tokens", "local");

    return NextResponse.redirect(
      `${env.appUrl()}/dashboard?google_connected=1`,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "oauth_failed";
    return NextResponse.redirect(
      `${env.appUrl()}/dashboard?google_error=${encodeURIComponent(message)}`,
    );
  }
}
