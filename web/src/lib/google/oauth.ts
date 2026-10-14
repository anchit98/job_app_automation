import { google } from "googleapis";
import { env } from "@/lib/env";

/**
 * Scopes every Connect Google user gets (Apply + onboarding).
 *
 * Drive and Docs only, and both are narrow: `drive.file` sees nothing but the
 * files the app itself creates or the user hands it through the Picker.
 *
 * `gmail.compose` used to be here, for creating outreach drafts through the
 * API. Google classifies it as *restricted* — a public launch on it requires
 * an annual paid security assessment — and it bought nothing that a compose
 * link does not: `lib/emails/manual-send` opens the user's own mail client
 * with the message filled in, and the app's own mail goes through Resend
 * (`lib/emails/transactional`). Nothing in this list is restricted now.
 */
export const GOOGLE_USER_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/documents",
] as const;

/** @deprecated Prefer GOOGLE_USER_SCOPES. */
export const GOOGLE_SCOPES = GOOGLE_USER_SCOPES;

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    env.googleClientId(),
    env.googleClientSecret(),
    env.googleRedirectUri(),
  );
}

export function getGoogleAuthUrl(state: string) {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...GOOGLE_USER_SCOPES],
    state,
    // false: do not re-attach previously granted scopes (gmail.readonly, etc.)
    include_granted_scopes: false,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(
      "Google did not return access and refresh tokens. Re-connect with prompt=consent.",
    );
  }
  return tokens;
}

export function oauthClientFromTokens(accessToken: string, refreshToken: string) {
  const client = createOAuth2Client();
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return client;
}
