import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Public readiness check (no secrets). Useful to diagnose Vercel misconfig.
 */
export async function GET() {
  const checks: Record<string, boolean | string> = {
    auth_secret: Boolean(process.env.AUTH_SECRET?.trim()),
    database_url: Boolean(process.env.DATABASE_URL?.trim()),
    google_oauth: Boolean(
      process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
        process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() &&
        process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim(),
    ),
  };

  let dbOk = false;
  let dbError: string | null = null;
  try {
    await getSql()`SELECT 1 AS ok`;
    dbOk = true;
  } catch (e) {
    dbError = e instanceof Error ? e.message : "db_error";
  }

  checks.database = dbOk;
  const ok = Boolean(checks.auth_secret && checks.database_url && dbOk);

  return NextResponse.json(
    {
      ok,
      checks,
      ...(dbError ? { database_error: dbError } : {}),
      hint: !checks.auth_secret
        ? "Add AUTH_SECRET in Vercel → Project → Settings → Environment Variables, then Redeploy."
        : undefined,
    },
    { status: ok ? 200 : 503 },
  );
}
