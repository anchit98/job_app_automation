import postgres from "postgres";

export const SINGLETON_ID = 1;

let sql: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Missing DATABASE_URL (Supabase Postgres connection string)");
    // Prefer the Supabase pooler URL (:6543) in .env - direct :5432 adds latency per query.
    sql = postgres(url, {
      prepare: false,
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      // Shorter lifetime + TCP keepalive: wedged sockets (server waiting on
      // ClientRead forever) starved the pool and froze every page load.
      max_lifetime: 60 * 5,
      keep_alive: 30,
    });
  }
  return sql;
}

/** Convert SQLite-style ? placeholders to postgres $1,$2,... */
export function toPgParams(text: string): string {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

/**
 * Watchdog for wedged sockets: the network can silently kill connections to
 * Supabase mid-query, leaving Postgres in ClientRead and the app frozen for
 * minutes. Cap each query and rebuild the pool so the next request recovers.
 */
const QUERY_TIMEOUT_MS = 15_000;

function resetPool(reason: string) {
  if (!sql) return;
  console.error(`[db] resetting connection pool: ${reason}`);
  const old = sql;
  sql = null;
  void old.end({ timeout: 1 }).catch(() => {});
}

async function guarded<T>(promise: Promise<T>, text: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // Swallow the late rejection when the destroyed pool aborts it.
          promise.catch(() => {});
          resetPool(`query exceeded ${QUERY_TIMEOUT_MS}ms`);
          reject(
            new Error(
              `Database query timed out after ${QUERY_TIMEOUT_MS}ms: ${text
                .replace(/\s+/g, " ")
                .slice(0, 120)}`,
            ),
          );
        }, QUERY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function dbGet<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  ...params: unknown[]
): Promise<T | undefined> {
  const rows = await guarded(
    getSql().unsafe(toPgParams(text), params as never[]) as unknown as Promise<
      unknown[]
    >,
    text,
  );
  return rows[0] as unknown as T | undefined;
}

export async function dbAll<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  ...params: unknown[]
): Promise<T[]> {
  const rows = await guarded(
    getSql().unsafe(toPgParams(text), params as never[]) as unknown as Promise<
      unknown[]
    >,
    text,
  );
  return rows as unknown as T[];
}

export async function dbRun(
  text: string,
  ...params: unknown[]
): Promise<{ changes: number }> {
  const result = await guarded(
    getSql().unsafe(toPgParams(text), params as never[]) as unknown as Promise<
      unknown[]
    >,
    text,
  );
  const changes =
    typeof (result as unknown as { count?: number }).count === "number"
      ? (result as unknown as { count: number }).count
      : Array.isArray(result)
        ? result.length
        : 0;
  return { changes };
}

export function parseJson<T>(
  text: string | null | undefined | object,
  fallback: T,
): T {
  if (text == null || text === "") return fallback;
  // postgres.js may already return jsonb as an object
  if (typeof text === "object") return text as T;
  // Object accidentally written via String(obj) / param coercion
  if (text === "[object Object]") return fallback;
  try {
    const parsed = JSON.parse(text) as unknown;
    // Some rows were double-encoded (jsonb string scalar containing JSON text)
    if (typeof parsed === "string") {
      try {
        return JSON.parse(parsed) as T;
      } catch {
        return parsed as T;
      }
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** Serialize objects for text columns (master_resume / master_cover_letter). */
export function toJsonText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    if (value === "[object Object]") return null;
    return value;
  }
  return JSON.stringify(value);
}

/** Normalize PG timestamptz / Date / string to ISO-ish string for existing mappers */
export function asText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
