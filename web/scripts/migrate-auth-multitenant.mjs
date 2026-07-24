/**
 * Multi-tenant auth migration: users/sessions + user_id on tenant tables.
 * Run: node scripts/migrate-auth-multitenant.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

async function tableExists(name) {
  const rows = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${name}
  `;
  return rows.length > 0;
}

async function columnExists(table, column) {
  const rows = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
  `;
  return rows.length > 0;
}

console.log("Creating users + sessions…");
await sql`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
    updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
  )
`;
await sql`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`;
await sql`CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at)`;

async function migrateSingleton(table, columns) {
  const legacy = `${table}_legacy`;
  if (await tableExists(table) && !(await columnExists(table, "user_id"))) {
    console.log(`Converting ${table} → user_id PK…`);
    await sql.unsafe(`ALTER TABLE ${table} RENAME TO ${legacy}`);
    await sql.unsafe(`
      CREATE TABLE ${table} (
        user_id TEXT PRIMARY KEY,
        ${columns},
        created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
        updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
      )
    `);
    // Keep legacy rows for first-user claim (id = 1).
    console.log(`  Legacy data preserved in ${legacy}`);
  } else if (await tableExists(table) && (await columnExists(table, "user_id"))) {
    console.log(`${table} already has user_id — skip`);
  }
}

await migrateSingleton(
  "profiles",
  `full_name TEXT,
   headline TEXT,
   location TEXT,
   timezone TEXT NOT NULL DEFAULT 'UTC',
   drive_root_id TEXT,
   preferred_tone TEXT,
   phone TEXT,
   linkedin_url TEXT,
   github_url TEXT,
   portfolio_url TEXT`,
);

await migrateSingleton(
  "master_resume",
  `content TEXT NOT NULL DEFAULT '{}',
   rules TEXT NOT NULL DEFAULT '{"never_fabricate": true}',
   doc_id TEXT,
   doc_layout TEXT,
   doc_synced_at TEXT`,
);

await migrateSingleton(
  "master_cover_letter",
  `doc_id TEXT,
   doc_layout TEXT,
   doc_synced_at TEXT`,
);

await migrateSingleton(
  "google_tokens",
  `encrypted_access_token TEXT NOT NULL,
   encrypted_refresh_token TEXT NOT NULL,
   scope TEXT NOT NULL,
   expires_at TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked'))`,
);

// extension_tokens had no updated_at
if (
  (await tableExists("extension_tokens")) &&
  !(await columnExists("extension_tokens", "user_id"))
) {
  console.log("Converting extension_tokens → user_id PK…");
  await sql`ALTER TABLE extension_tokens RENAME TO extension_tokens_legacy`;
  await sql`
    CREATE TABLE extension_tokens (
      user_id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL,
      token_prefix TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
      revoked_at TEXT
    )
  `;
}

for (const table of ["applications", "prompt_runs", "pipeline_runs", "audit_log"]) {
  if (!(await columnExists(table, "user_id"))) {
    console.log(`Adding user_id to ${table}…`);
    await sql.unsafe(
      `ALTER TABLE ${table} ADD COLUMN user_id TEXT REFERENCES users (id)`,
    );
    await sql.unsafe(
      `CREATE INDEX IF NOT EXISTS ${table}_user_idx ON ${table} (user_id)`,
    );
  }
}

await sql`
  INSERT INTO schema_migrations (version) VALUES (44)
  ON CONFLICT (version) DO NOTHING
`;

console.log("Migration complete.");
await sql.end();
