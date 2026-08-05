import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parse(raw) {
  let t = String(raw).trim();
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (f) t = f[1].trim();
  const idxs = [t.indexOf("{"), t.indexOf("[")].filter((x) => x >= 0);
  const i = Math.min(...idxs);
  return JSON.parse(t.slice(i));
}

function summarize(kind, obj) {
  if (kind === "jd_parse")
    return {
      company: obj.company,
      role: obj.role,
      location: obj.location,
      must: (obj.must_have_keywords || []).slice(0, 6),
      tech: (obj.tech_stack || []).slice(0, 8),
      resp_n: (obj.responsibilities || []).length,
      req_n: (obj.requirements || []).length,
    };
  if (kind === "resume")
    return {
      headline: obj.headline || String(obj.summary || "").slice(0, 120),
      roles: (obj.experience || []).map((e) => `${e.company}:${e.title}`),
      bullets: (obj.experience || []).flatMap((e) => e.bullets || []).length,
      skills_n: (obj.skills || []).length,
      skills: (obj.skills || []).slice(0, 8),
      projects_n: (obj.projects || []).length,
    };
  if (kind === "cover_letter")
    return {
      hook: String(obj.opening_hook || "").slice(0, 160),
      evidence_n: (obj.evidence_points || []).length,
      body_chars: String(obj.body || "").length,
      cta: String(obj.cta || "").slice(0, 120),
    };
  if (kind === "cold_email") {
    const emails = obj.emails || [];
    return {
      n: emails.length,
      subjects: emails.map((e) => e.subject),
      opener0: String(emails[0]?.body_md || "")
        .split("\n")[0]
        .slice(0, 180),
      body_lens: emails.map((e) => String(e.body_md || "").length),
    };
  }
}

const pairs = [
  ["miq", "jd_parse"],
  ["miq", "resume"],
  ["miq", "cover_letter"],
  ["miq", "cold_email"],
  ["govpreneurs", "jd_parse"],
  ["govpreneurs", "resume"],
  ["govpreneurs", "cover_letter"],
  ["govpreneurs", "cold_email"],
];

for (const [app, kind] of pairs) {
  const g = parse(
    fs.readFileSync(
      path.join(root, `bakeoff-out/raw/${app}__${kind}__google_gemma-4-31b-it.json`),
      "utf8",
    ),
  );
  const c = parse(
    fs.readFileSync(
      path.join(root, `bakeoff-out/chatgpt-baseline/${app}__${kind}.txt`),
      "utf8",
    ),
  );
  console.log(`\n==== ${app} ${kind} ====`);
  console.log("GEMMA", JSON.stringify(summarize(kind, g)));
  console.log("CHATGPT", JSON.stringify(summarize(kind, c)));
}
