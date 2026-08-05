import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const rawDir = path.join(root, "bakeoff-out", "raw");
const baselineDir = path.join(root, "bakeoff-out", "chatgpt-baseline");
const resultsPath = path.join(root, "bakeoff-out", "results.json");

function loadJson(p) {
  let t = fs.readFileSync(p, "utf8");
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return JSON.parse(t);
}

function extractJson(raw) {
  let text = String(raw || "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const o = text.indexOf("{");
  const a = text.indexOf("[");
  let start = -1;
  if (o >= 0 && a >= 0) start = Math.min(o, a);
  else start = Math.max(o, a);
  if (start < 0) throw new Error("No JSON");
  return JSON.parse(text.slice(start));
}

function deepScore(kind, parsed) {
  const issues = [];
  const notes = [];
  if (!parsed || typeof parsed !== "object") {
    return { score: 1, issues: ["not_object"], notes };
  }
  if (kind === "jd_parse") {
    const req = [
      "company",
      "role",
      "seniority",
      "must_have_keywords",
      "nice_to_have_keywords",
      "responsibilities",
      "requirements",
      "tech_stack",
      "location",
      "remote_policy",
    ];
    let filled = 0;
    for (const k of req) {
      const v = parsed[k];
      const ok =
        (typeof v === "string" && v.trim().length > 0) ||
        (Array.isArray(v) && v.length > 0);
      if (ok) filled++;
      else if (k !== "remote_policy") issues.push(`empty_${k}`);
    }
    if ((parsed.must_have_keywords || []).length >= 5) notes.push("rich_must_haves");
    if ((parsed.responsibilities || []).length >= 4) notes.push("rich_responsibilities");
    const score = Math.max(1, Math.min(5, 1 + Math.round((filled / req.length) * 4)));
    return { score, issues, notes, filled_fields: filled };
  }
  if (kind === "resume") {
    if (!parsed.summary && !parsed.headline) issues.push("missing_summary_or_headline");
    if (!Array.isArray(parsed.experience) || parsed.experience.length < 1)
      issues.push("missing_experience");
    if (!Array.isArray(parsed.skills) || parsed.skills.length < 1)
      issues.push("missing_skills");
    const bullets = (parsed.experience || []).flatMap((e) => e.bullets || []);
    notes.push(`experience_roles=${(parsed.experience || []).length}`);
    notes.push(`bullets=${bullets.length}`);
    notes.push(`skills=${(parsed.skills || []).length}`);
    if ((parsed.projects || []).length) notes.push(`projects=${parsed.projects.length}`);
    let score = 3;
    if (issues.length) score = 2;
    if ((parsed.experience || []).length >= 2 && bullets.length >= 6) score = 4;
    if (issues.length === 0 && bullets.length >= 10 && (parsed.skills || []).length >= 8)
      score = 5;
    if (!parsed.experience && !parsed.skills) score = 1;
    return { score, issues, notes, bullet_count: bullets.length };
  }
  if (kind === "cover_letter") {
    const fields = [
      "opening_hook",
      "why_this_role",
      "evidence_points",
      "why_this_company",
      "cta",
      "body",
    ];
    let filled = 0;
    for (const k of fields) {
      const v = parsed[k];
      const ok =
        (typeof v === "string" && v.trim().length > 0) ||
        (Array.isArray(v) && v.length > 0);
      if (ok) filled++;
      else issues.push(`missing_${k}`);
    }
    const bodyLen = String(parsed.body || parsed.cover_letter || "").length;
    notes.push(`body_chars=${bodyLen}`);
    if (Array.isArray(parsed.evidence_points))
      notes.push(`evidence_points=${parsed.evidence_points.length}`);
    let score = filled >= 5 ? 4 : filled >= 3 ? 3 : 2;
    if (bodyLen > 1200) score = Math.min(5, score + 1);
    if (filled === 0) score = 1;
    return { score, issues, notes, filled_fields: filled };
  }
  if (kind === "cold_email") {
    const emails = parsed.emails || parsed.items || [];
    if (!Array.isArray(emails) || emails.length < 1) {
      return { score: 1, issues: ["missing_emails"], notes };
    }
    let good = 0;
    for (const e of emails) {
      if (e.contact_id && e.subject && e.body_md) good++;
      else issues.push("incomplete_email_item");
    }
    const openers = emails.map((e) => String(e.body_md || "").split("\n")[0]);
    const uniqueOpeners = new Set(openers).size;
    notes.push(`emails=${emails.length}`, `unique_openers=${uniqueOpeners}`);
    let score = good === emails.length ? 4 : 2;
    if (uniqueOpeners === emails.length && emails.length >= 2) score = 5;
    return { score, issues, notes, email_count: emails.length };
  }
  return { score: 2, issues: ["unknown_kind"], notes };
}

const results = loadJson(resultsPath);
const report = {
  generated_at: new Date().toISOString(),
  models: {},
  chatgpt_baseline: [],
  pairwise_notes: [],
};

for (const row of results) {
  const key = row.model_label || row.model_id;
  if (!report.models[key]) {
    report.models[key] = {
      model_id: row.model_id,
      rows: [],
      success: 0,
      total: 0,
      avg_latency_ms: 0,
      avg_quality: 0,
    };
  }
  const tag = `${row.app}__${row.kind}__${String(row.model_id).replace("/", "_")}`;
  let deep = null;
  const jsonPath = path.join(rawDir, `${tag}.json`);
  const txtPath = path.join(rawDir, `${tag}.txt`);
  if (fs.existsSync(jsonPath)) {
    try {
      deep = deepScore(row.kind, loadJson(jsonPath));
    } catch (e) {
      deep = { score: 1, issues: ["json_load_failed:" + e.message], notes: [] };
    }
  } else if (row.http_ok && fs.existsSync(txtPath)) {
    try {
      deep = deepScore(row.kind, extractJson(fs.readFileSync(txtPath, "utf8")));
    } catch (e) {
      deep = { score: 1, issues: ["extract_failed:" + e.message], notes: [] };
    }
  }
  const entry = {
    app: row.app,
    kind: row.kind,
    http_ok: row.http_ok,
    http_status: row.http_status,
    latency_ms: row.latency_ms,
    schema_ok: row.schema_ok,
    quality_heuristic: row.quality_heuristic,
    deep,
    usage: row.usage,
    error: row.error ? String(row.error).slice(0, 180) : null,
  };
  report.models[key].rows.push(entry);
  report.models[key].total += 1;
  if (row.http_ok) report.models[key].success += 1;
}

for (const m of Object.values(report.models)) {
  const ok = m.rows.filter((r) => r.http_ok);
  m.avg_latency_ms = ok.length
    ? Math.round(ok.reduce((s, r) => s + (r.latency_ms || 0), 0) / ok.length)
    : null;
  const qs = m.rows
    .map((r) => r.deep?.score ?? r.quality_heuristic)
    .filter((x) => x != null);
  m.avg_quality = qs.length
    ? Math.round((qs.reduce((a, b) => a + b, 0) / qs.length) * 10) / 10
    : null;
}

if (fs.existsSync(path.join(baselineDir, "manifest.json"))) {
  const baseMan = loadJson(path.join(baselineDir, "manifest.json"));
  for (const b of baseMan) {
    if (!b.found) {
      report.chatgpt_baseline.push({ ...b, deep: null });
      continue;
    }
    const text = fs.readFileSync(path.join(root, b.file), "utf8");
    let deep = null;
    try {
      deep = deepScore(b.kind, extractJson(text));
    } catch (e) {
      deep = { score: 1, issues: ["baseline_parse:" + e.message], notes: [] };
    }
    report.chatgpt_baseline.push({ ...b, deep, chars: text.length });
  }
}

const out = path.join(root, "bakeoff-out", "score-report.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log("Wrote", out);
for (const [name, m] of Object.entries(report.models)) {
  console.log(
    name,
    `success=${m.success}/${m.total}`,
    `avg_lat=${m.avg_latency_ms}`,
    `avg_q=${m.avg_quality}`,
  );
  for (const r of m.rows) {
    console.log(
      " ",
      r.app,
      r.kind,
      "http=" + r.http_ok,
      "deep=" + (r.deep?.score ?? "-"),
      "notes=" + (r.deep?.notes || []).join(","),
    );
  }
}
console.log("ChatGPT baselines:", report.chatgpt_baseline.length);
for (const b of report.chatgpt_baseline) {
  console.log(" ", b.app, b.kind, "found=" + b.found, "deep=" + (b.deep?.score ?? "-"));
}
