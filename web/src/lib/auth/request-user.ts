import { AsyncLocalStorage } from "async_hooks";

/**
 * Lets extension / cron paths act as a specific user without a browser session.
 * Prefer session cookies for normal app requests; use this only after verifying
 * bearer token or pipeline ownership.
 */
const store = new AsyncLocalStorage<string>();

export function runAsUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return store.run(userId, fn);
}

export function getRequestUserId(): string | undefined {
  return store.getStore();
}
