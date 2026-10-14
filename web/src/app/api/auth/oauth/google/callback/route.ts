/**
 * Finish "Continue with Google": turn a verified Google identity into a
 * session, creating the account the first time.
 *
 * Three cases, in order of precedence:
 *
 *   1. **Known identity** — this Google account has signed in before. Use the
 *      user it is linked to. Nothing about the email matters here; the subject
 *      id is the key.
 *   2. **Known email** — someone signed up with a password and is now using
 *      Google for the first time. Link the identity to that account, so they
 *      get their applications rather than a hollow second account. Requires
 *      Google to say the address is verified.
 *   3. **Neither** — create the account, exactly as `signUp` does, including
 *      the first-user-is-admin rule and claiming legacy unscoped rows.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { writeAuditLog } from "@/lib/audit";
import { postAuthRedirectPath } from "@/app/actions/auth";
import { appCookieOptions } from "@/lib/auth/cookie-options";
import {
  SIGNIN_STATE_COOKIE,
  exchangeCodeForGoogleIdentity,
  verifySignInState,
} from "@/lib/auth/google-signin";
import { findUserIdByIdentity, linkIdentity } from "@/lib/auth/identities";
import { attachSessionCookie, createSession } from "@/lib/auth/session";
import {
  claimOrphanedData,
  countUsers,
  createUser,
  ensureUserProfile,
  getUserByEmail,
  getUserById,
} from "@/lib/auth/user";
import { env } from "@/lib/env";

/** Always land on the configured origin — never a preview or loopback host. */
function origin(): string {
  return env.canonicalAppUrl().replace(/\/$/, "");
}

function loginWithError(reason: string): NextResponse {
  const url = new URL("/login", `${origin()}/`);
  url.searchParams.set("oauth_error", reason);
  const response = NextResponse.redirect(url.toString());
  clearState(response);
  return response;
}

function clearState(response: NextResponse): void {
  response.cookies.set(SIGNIN_STATE_COOKIE, "", appCookieOptions({ maxAge: 0 }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const denied = searchParams.get("error");
  if (denied) return loginWithError(denied);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return loginWithError("missing_code");

  const checked = verifySignInState(state);
  if (!checked.ok) return loginWithError("invalid_state");

  // Soft same-tab check. The signature above is what actually protects the
  // flow — this cookie is routinely dropped on the apex↔www hop — so a
  // mismatch is only fatal when the cookie exists and disagrees.
  const saved = (await cookies()).get(SIGNIN_STATE_COOKIE)?.value;
  if (saved && saved !== state) return loginWithError("invalid_state");

  let identity;
  try {
    identity = await exchangeCodeForGoogleIdentity(code);
  } catch (error) {
    console.error("[google-signin] exchange failed:", error);
    return loginWithError("exchange_failed");
  }

  try {
    let userId = await findUserIdByIdentity("google", identity.sub);
    let created = false;

    if (!userId) {
      const existing = await getUserByEmail(identity.email);
      if (existing) {
        // Only a verified address may claim an existing account: an
        // unverified one is a claim, not a proof, and this branch hands over
        // everything that account owns.
        if (!identity.emailVerified) return loginWithError("email_unverified");
        userId = existing.id;
      } else {
        const isFirstUser = (await countUsers()) === 0;
        const user = await createUser({
          email: identity.email,
          // No password, and no placeholder standing in for one — see
          // db/migrations/054_social_login.sql.
          passwordHash: null,
          fullName: identity.name,
          isAdmin: isFirstUser,
        });
        userId = user.id;
        created = true;

        if (isFirstUser) await claimOrphanedData(user.id);
        else await ensureUserProfile(user.id, identity.name);
      }
    }

    await linkIdentity({
      userId,
      provider: "google",
      providerAccountId: identity.sub,
      email: identity.email,
    });

    const user = await getUserById(userId);
    if (!user) return loginWithError("account_missing");

    await createSession(user.id, {
      email: user.email,
      full_name: user.full_name,
      is_admin: user.is_admin,
      must_reset_password: user.must_reset_password,
      is_paid: Boolean(user.is_admin) || Boolean(user.is_paid),
    });

    await writeAuditLog(
      created ? "auth.google_signup" : "auth.google_signin",
      "users",
      user.id,
      { email: identity.email },
    );

    // `next` came out of the signed state, so it cannot be an attacker's URL;
    // the setup-aware redirect still wins when it has an opinion.
    const destination = await postAuthRedirectPath({
      id: user.id,
      is_admin: Boolean(user.is_admin),
      is_paid: Boolean(user.is_paid),
      must_reset_password: Boolean(user.must_reset_password),
    });
    const target =
      checked.next && checked.next !== "/dashboard" ? checked.next : destination;

    const response = NextResponse.redirect(
      new URL(target, `${origin()}/`).toString(),
    );
    clearState(response);
    // Re-set the session on this very response: the cookie written inside
    // createSession can be dropped on a redirect that also changes host.
    await attachSessionCookie(response);
    return response;
  } catch (error) {
    console.error("[google-signin] sign-in failed:", error);
    return loginWithError("signin_failed");
  }
}
