import postgres from "postgres";

export const SINGLETON_ID = 1;

let sql: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Missing DATABASE_URL (Supabase Postgres connection string)");
    // Prefer the Supabase pooler URL (:6543) in .env — direct :5432 adds latency per query.
    sql = postgres(url, {
      prepare: false,
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 60 * 30,
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

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Normalize PG timestamptz / Date / string to ISO-ish string for existing mappers */
export function asText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
