/** True when a pipeline/export error means the user must reconnect Google OAuth. */
export function isGoogleReconnectError(message?: string | null): boolean {
  if (!message) return false;
  return /google|drive export|token revoked|not connected|reconnect google/i.test(
    message,
  );
}
