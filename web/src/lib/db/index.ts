import postgres from "postgres";

export const SINGLETON_ID = 1;

let sql: ReturnType<typeof postgres> | null = null;

/** Vercel/serverless: one connection per isolate. Local: small pool. */
function poolMax() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return 1;
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
      connect_timeout: 10,
      max_lifetime: 60 * 5,
      keep_alive: 30,
      // Cancel slow queries server-side without destroying the pool (pool resets
      // were cascading 500s for every concurrent request on the same isolate).
      connection: {
        statement_timeout: 20000,
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

export async function dbGet<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  ...params: unknown[]
): Promise<T | undefined> {
  const rows = await getSql().unsafe(
    toPgParams(text),
    params as never[],
  );
  return rows[0] as unknown as T | undefined;
}

export async function dbAll<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  ...params: unknown[]
): Promise<T[]> {
  const rows = await getSql().unsafe(
    toPgParams(text),
    params as never[],
  );
  return rows as unknown as T[];
}

export async function dbRun(
  text: string,
  ...params: unknown[]
): Promise<{ changes: number }> {
  const result = await getSql().unsafe(
    toPgParams(text),
    params as never[],
  );
  const changes =
    typeof (result as { count?: number }).count === "number"
      ? (result as { count: number }).count
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
