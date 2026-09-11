import postgres from "postgres";

export const SINGLETON_ID = 1;

let sql: ReturnType<typeof postgres> | null = null;

/**
 * Vercel Fluid compute serves many concurrent requests per isolate, so max:1
 * serialized every signed-in page behind a single connection (site-wide
 * "stuck loading"). DATABASE_URL targets Supabase's transaction pooler
 * (:6543), which multiplexes client connections, so a small pool is safe.
 */
function poolMax() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return 6;
  return 5;
}

export function getSql() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Missing DATABASE_URL (Supabase Postgres connection string)");
    // Prefer the Supabase pooler URL (:6543) in .env - direct :5432 adds latency per query.
    sql = postgres(url, {
      prepare: false,
      max: poolMax(),
      idle_timeout: 20,
      // Opening a pooler connection can take tens of seconds when Supabase is
      // cold or the region is slow, while queries on an established connection
      // still return in well under a second. A 10s budget failed every cold
      // start and rendered pages with empty data; the per-query timeout below
      // is what actually guards against slow SQL.
      connect_timeout: 45,
      max_lifetime: 60 * 5,
      keep_alive: 30,
      // Cancel slow queries server-side without destroying the pool. Kept just
      // above CLIENT_QUERY_TIMEOUT_MS so an abandoned query frees its pooled
      // connection soon after the HTTP request has already given up on it.
      connection: {
        statement_timeout: 10000,
      },
    });
  }
  return sql;
}

/** Convert SQLite-style ? placeholders to postgres $1,$2,... */
export function toPgParams(text: string): string {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

/** Fail the HTTP request fast if the pooler/network stalls — do not destroy the pool. */
const CLIENT_QUERY_TIMEOUT_MS = 8_000;

async function withClientTimeout<T>(
  promise: Promise<T>,
  text: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `Database query timed out after ${CLIENT_QUERY_TIMEOUT_MS}ms: ${text
                .replace(/\s+/g, " ")
                .slice(0, 120)}`,
            ),
          );
        }, CLIENT_QUERY_TIMEOUT_MS);
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
  const rows = await withClientTimeout(
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
  const rows = await withClientTimeout(
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
  const result = await withClientTimeout(
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
