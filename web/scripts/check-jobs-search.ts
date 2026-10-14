/**
 * Exercise the Jobs page search and sort against the real database.
 *
 * The search WHERE clause is assembled as a string with positional
 * placeholders, and a mistake there is a 500 on the page rather than a type
 * error. This runs each sort order and a few query shapes — including one that
 * only matches as a substring and one with a deliberate typo — and prints what
 * came back.
 *
 * Usage: npx tsx scripts/check-jobs-search.ts [search term]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  const { dbAll } = await import("../src/lib/db/index");
  const { searchApplications } = await import("../src/lib/tracker/queries");
  const { APPLICATION_SORTS } = await import("../src/lib/tracker/search");

  const users = (await dbAll(
    `SELECT u.id, u.email, COUNT(a.id)::int AS applications
       FROM users u
       LEFT JOIN applications a ON a.user_id = u.id
      GROUP BY u.id, u.email
      ORDER BY applications DESC
      LIMIT 1`,
  )) as Array<{ id: string; email: string; applications: number }>;

  const user = users[0];
  if (!user) {
    console.error("No users in this database.");
    process.exit(1);
  }
  console.log(`User ${user.email} — ${user.applications} application(s)\n`);

  const [trgm] = (await dbAll(
    `SELECT 1 AS ok FROM pg_extension WHERE extname = 'pg_trgm'`,
  )) as Array<{ ok: number }>;
  console.log(
    `pg_trgm: ${trgm ? "enabled (fuzzy on)" : "absent (substring only)"}\n`,
  );

  for (const sort of APPLICATION_SORTS) {
    const result = await searchApplications({ sort, pageSize: 3 }, user.id);
    const names = result.items
      .map((i) => `${i.company ?? "?"} / ${i.role ?? "?"}`)
      .join(" | ");
    console.log(`sort=${sort}: ${result.total} total — ${names || "(none)"}`);
  }

  console.log("");

  const seed = await searchApplications({ pageSize: 1 }, user.id);
  const sample = seed.items[0]?.company ?? "";
  const queries = [
    process.argv[2],
    sample,
    sample.toLowerCase(),
    sample.slice(1, Math.max(4, Math.floor(sample.length / 2))),
    sample ? sample.slice(0, -1) + "z" : "",
  ].filter((q): q is string => Boolean(q && q.trim()));

  for (const q of queries) {
    const result = await searchApplications({ q, pageSize: 5 }, user.id);
    console.log(`q=${JSON.stringify(q)} -> ${result.total} match(es)`);
  }

  process.exit(0);
}

void main();
