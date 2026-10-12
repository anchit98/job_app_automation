/**
 * Is email + password sign-in available?
 *
 * Turned off for now: the product signs people in with Google only, which is
 * also what keeps the account model simple — one verified identity, no
 * password to reset and no reset email to deliver (and no mail provider is
 * configured yet, so a reset link would go nowhere).
 *
 * This is a switch rather than deleted code because the credential path is
 * still wanted later, and because turning it back on must not mean
 * reconstructing it from a diff. Set `ENABLE_PASSWORD_AUTH=1` to restore it.
 *
 * Read on both sides of the wire: the form hides the fields, and the server
 * actions refuse outright. Hiding alone would not be a gate — the actions are
 * callable whether or not anything renders a form pointing at them.
 */
export const PASSWORD_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_PASSWORD_AUTH === "1" ||
  process.env.ENABLE_PASSWORD_AUTH === "1";

/** Shown wherever the credential path is refused. */
export const PASSWORD_AUTH_DISABLED_MESSAGE =
  "Email and password sign-in is turned off. Use “Continue with Google”.";
