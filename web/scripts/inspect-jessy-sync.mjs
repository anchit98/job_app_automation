import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const users = await sql.unsafe(
  `SELECT id, email FROM auth.users WHERE email ILIKE $1`,
  ["%jessynelson%"],
);
console.log("USERS", JSON.stringify(users, null, 2));

if (!users[0]) {
  await sql.end({ timeout: 5 });
  process.exit(1);
}

const uid = users[0].id;
const mr = await sql.unsafe(
  `SELECT doc_id, doc_synced_at,
      content,
      doc_layout,
      jsonb_array_length(COALESCE(content->'experience','[]'::jsonb)) as exp_n,
      jsonb_array_length(COALESCE(content->'projects','[]'::jsonb)) as proj_n,
      jsonb_array_length(COALESCE(content->'skills','[]'::jsonb)) as skill_n,
      jsonb_array_length(COALESCE(doc_layout->'slots','[]'::jsonb)) as slots_n
    FROM master_resume WHERE user_id = $1`,
  [uid],
);

if (!mr[0]) {
  console.log("No master_resume row");
  await sql.end({ timeout: 5 });
  process.exit(1);
}

const row = mr[0];
const content = row.content;
const layout = row.doc_layout;
const slots = layout?.slots ?? [];

console.log({
  doc_id: row.doc_id,
  doc_synced_at: row.doc_synced_at,
  exp_n: row.exp_n,
  proj_n: row.proj_n,
  skill_n: row.skill_n,
  slots_n: row.slots_n,
});

console.log(
  "\nEXPERIENCE",
  JSON.stringify(
    (content.experience || []).map((e) => ({
      company: e.company,
      title: e.title,
      bullets: e.bullets?.length,
      start: e.start_date,
      end: e.end_date,
    })),
    null,
    2,
  ),
);

console.log(
  "\nPROJECTS",
  JSON.stringify(
    (content.projects || []).map((p) => ({
      name: p.name,
      subtitle: p.subtitle,
      bullets: p.bullets?.length,
    })),
    null,
    2,
  ),
);

console.log("\nSKILLS", JSON.stringify(content.skills || [], null, 2));
console.log("\nHEADLINE", content.headline);
console.log("\nEDUCATION", JSON.stringify(content.education || [], null, 2));

const bySection = {};
for (const s of slots) {
  bySection[s.section] = (bySection[s.section] || 0) + 1;
}
console.log("\nSLOTS_BY_SECTION", bySection);

console.log(
  "\nALL_SLOTS",
  slots.map((s) => ({
    key: s.key,
    section: s.section,
    ei: s.experience_index,
    pi: s.project_index,
    bi: s.bullet_index,
    orig: (s.original || "").slice(0, 100),
  })),
);

const audits = await sql
  .unsafe(
    `SELECT action, created_at, payload
     FROM audit_log
     WHERE user_id = $1 AND action ILIKE '%master_resume%'
     ORDER BY created_at DESC LIMIT 8`,
    [uid],
  )
  .catch((e) => [{ err: String(e) }]);
console.log("\nAUDITS", JSON.stringify(audits, null, 2));

await sql.end({ timeout: 5 });
