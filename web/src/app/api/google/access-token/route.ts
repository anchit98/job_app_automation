import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { env } from "@/lib/env";
import {
  getGoogleAuthClient,
  GoogleNotConnectedError,
  GoogleTokenRevokedError,
} from "@/lib/google/tokens";

/**
 * Fresh OAuth access token for Google Picker (client-side).
 * Requires an existing Connect Google session with drive.file.
 */
export async function GET() {
  try {
    await requireUser();
    const auth = await getGoogleAuthClient();
    const token = auth.credentials.access_token;
    if (!token) {
      return NextResponse.json(
        { error: "No Google access token. Reconnect Google and try again." },
        { status: 401 },
      );
    }
    return NextResponse.json({
      accessToken: token,
      expiresAt: auth.credentials.expiry_date ?? null,
      clientId: env.googleClientId(),
      apiKey: env.googlePickerApiKey() || null,
      appId: env.googlePickerAppId() || null,
    });
  } catch (e) {
    if (
      e instanceof GoogleNotConnectedError ||
      e instanceof GoogleTokenRevokedError
    ) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    const message = e instanceof Error ? e.message : "token_failed";
    if (/Sign in required|AuthRequired/i.test(message)) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    console.error("[google/access-token]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
