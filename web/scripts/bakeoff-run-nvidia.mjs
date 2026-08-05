import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const outDir = path.join(root, "bakeoff-out");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv(path.join(root, ".env.testing.local"));

const API_KEY = process.env.NVIDIA_API_KEY;
if (!API_KEY) {
  console.error("NVIDIA_API_KEY missing");
  process.exit(1);
}

const MODELS = [
  { id: "google/gemma-4-31b-it", label: "Gemma 4 31B IT" },
  { id: "moonshotai/kimi-k2.6", label: "Kimi K2.6" },
  { id: "z-ai/glm-5.2", label: "GLM-5.2" },
];

const SLEEP_MS = 2000;
const MAX_TOKENS_BY_KIND = {
  jd_parse: 3072,
  resume: 8192,
  cover_letter: 4096,
  cold_email: 4096,
};
const CURL_MAX_TIME = 240;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractJsonFromText(raw) {
  let text = String(raw || "").trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) text = fenceMatch[1].trim();
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  let start = -1;
  if (objectStart === -1) start = arrayStart;
  else if (arrayStart === -1) start = objectStart;
  else start = Math.min(objectStart, arrayStart);
  if (start === -1) throw new Error("No JSON object or array found");
  const slice = text.slice(start);
  const balanced = takeBalancedJson(slice);
  if (balanced.length < slice.length - 2) throw new Error("JSON appears truncated");
  return balanced;
}

function takeBalancedJson(text) {
  const open = text[0];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  return text;
}

function scoreKind(kind, parsed) {
  const issues = [];
  if (kind === "jd_parse") {
    if (!parsed || typeof parsed !== "object") issues.push("not_object");
    else {
      if (!(parsed.company || parsed.Company)) issues.push("missing_company");
      if (!(parsed.role || parsed.title || parsed.job_title))
        issues.push("missing_role");
    }
  } else if (kind === "resume") {
    if (!parsed || typeof parsed !== "object") issues.push("not_object");
    else if (!parsed.experience && !parsed.bullets && !parsed.skills)
      issues.push("missing_experience_or_skills");
  } else if (kind === "cover_letter") {
    if (!parsed || typeof parsed !== "object") issues.push("not_object");
    else {
      const body =
        parsed.body ||
        parsed.cover_letter ||
        parsed.why_this_company ||
        parsed.opening;
      if (!body) issues.push("missing_body_fields");
    }
  } else if (kind === "cold_email") {
    if (!parsed || typeof parsed !== "object") issues.push("not_object");
    else {
      const emails = parsed.emails || parsed.items || parsed.results;
      if (!Array.isArray(emails) || emails.length === 0)
        issues.push("missing_emails_array");
    }
  }
  return issues;
}

function qualityHeuristic(kind, raw, parsed, extractOk, schemaIssues) {
  let score = 3;
  if (!extractOk) return 1;
  if (schemaIssues.length) score -= Math.min(2, schemaIssues.length);
  if (raw.length < 200) score -= 1;
  if (/^\s*here (is|are)|sure,|as an ai/i.test(raw.slice(0, 120))) score -= 0.5;
  if (kind === "resume" && parsed?.experience?.length >= 2) score += 0.5;
  if (kind === "cover_letter" && JSON.stringify(parsed).length > 800) score += 0.5;
  if (kind === "cold_email" && (parsed?.emails?.length || 0) >= 1) score += 0.5;
  return Math.max(1, Math.min(5, Math.round(score * 10) / 10));
}

function callNvidiaCurl(modelId, prompt, kind, tag) {
  const reqPath = path.join(outDir, "raw", `${tag}.req.json`);
  const resPath = path.join(outDir, "raw", `${tag}.api.json`);
  // Relative paths avoid curl.exe + spaces-in-OneDrive bugs on Windows.
  const reqRel = path.relative(root, reqPath).replace(/\\/g, "/");
  const resRel = path.relative(root, resPath).replace(/\\/g, "/");
  const body = {
    model: modelId,
    temperature: 0.2,
    top_p: 0.9,
    max_tokens: MAX_TOKENS_BY_KIND[kind] || 4096,
    stream: false,
    messages: [
      {
        role: "system",
        content:
          "You are a careful assistant for job-application automation. Return ONLY valid JSON matching the user's schema. No markdown fences, no preamble, no reasoning outside JSON.",
      },
      { role: "user", content: prompt },
    ],
  };
  fs.writeFileSync(reqPath, JSON.stringify(body), "utf8");

  const started = Date.now();
  const result = spawnSync(
    "curl.exe",
    [
      "-sS",
      "-m",
      String(CURL_MAX_TIME),
      "-w",
      "\n__CURL_HTTP__:%{http_code}",
      "https://integrate.api.nvidia.com/v1/chat/completions",
      "-H",
      `Authorization: Bearer ${API_KEY}`,
      "-H",
      "Content-Type: application/json",
      "--data-binary",
      `@${reqRel}`,
      "-o",
      resRel,
    ],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  const latencyMs = Date.now() - started;
  const httpMatch = (result.stdout || "").match(/__CURL_HTTP__:(\d+)/);
  const httpStatus = httpMatch ? Number(httpMatch[1]) : 0;

  if (result.error) {
    return {
      ok: false,
      status: 0,
      latencyMs,
      error: result.error.message,
      content: null,
      usage: null,
    };
  }
  if (result.status !== 0 && !fs.existsSync(resPath)) {
    return {
      ok: false,
      status: httpStatus || result.status,
      latencyMs,
      error: result.stderr || `curl exit ${result.status}`,
      content: null,
      usage: null,
    };
  }

  let api;
  try {
    api = JSON.parse(fs.readFileSync(resPath, "utf8"));
  } catch (e) {
    return {
      ok: false,
      status: httpStatus,
      latencyMs,
      error: `Invalid API JSON: ${e.message}`,
      content: null,
      usage: null,
    };
  }

  if (httpStatus !== 200) {
    return {
      ok: false,
      status: httpStatus,
      latencyMs,
      error:
        api?.error?.message ||
        api?.detail ||
        JSON.stringify(api).slice(0, 400),
      content: null,
      usage: api?.usage || null,
    };
  }

  const content = api?.choices?.[0]?.message?.content || "";
  return {
    ok: true,
    status: httpStatus,
    latencyMs,
    error: null,
    content: typeof content === "string" ? content : JSON.stringify(content),
    usage: api?.usage || null,
    finish_reason: api?.choices?.[0]?.finish_reason || null,
  };
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"),
);
const resultsPath = path.join(outDir, "results.json");
let results = [];
if (fs.existsSync(resultsPath)) {
  try {
    results = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
  } catch {
    results = [];
  }
}

function doneOk(modelId, app, kind) {
  return results.some(
    (r) =>
      r.model_id === modelId &&
      r.app === app &&
      r.kind === kind &&
      r.http_ok === true,
  );
}

fs.mkdirSync(path.join(outDir, "raw"), { recursive: true });
console.log(`Bakeoff via curl: ${MODELS.length} models × ${manifest.length} prompts`);

for (const model of MODELS) {
  for (const item of manifest) {
    if (doneOk(model.id, item.app, item.kind)) {
      console.log(`SKIP ${model.label} | ${item.app}/${item.kind}`);
      continue;
    }
    results = results.filter(
      (r) =>
        !(r.model_id === model.id && r.app === item.app && r.kind === item.kind),
    );

    const prompt = fs.readFileSync(path.join(root, item.file), "utf8");
    const tag = `${item.app}__${item.kind}__${model.id.replace(/\//g, "_")}`;
    console.log(
      `\n>>> ${model.label} | ${item.app}/${item.kind} (${prompt.length} chars)`,
    );

    let attempt = callNvidiaCurl(model.id, prompt, item.kind, tag);
    let retried = false;
    if (!attempt.ok && (attempt.status === 429 || attempt.status === 503)) {
      console.log(`  retry after 429/503…`);
      spawnSync("timeout", ["/t", "20", "/nobreak"], { shell: true });
      attempt = callNvidiaCurl(model.id, prompt, item.kind, tag);
      retried = true;
    }

    let extractOk = false;
    let parseOk = false;
    let schemaIssues = [];
    let parsed = null;
    let extractError = null;
    let jsonText = null;
    if (attempt.ok && attempt.content) {
      try {
        jsonText = extractJsonFromText(attempt.content);
        extractOk = true;
        parsed = JSON.parse(jsonText);
        parseOk = true;
        schemaIssues = scoreKind(item.kind, parsed);
      } catch (e) {
        extractError = e instanceof Error ? e.message : String(e);
      }
    }

    const quality = qualityHeuristic(
      item.kind,
      attempt.content || "",
      parsed,
      extractOk && parseOk,
      schemaIssues,
    );

    const row = {
      model_id: model.id,
      model_label: model.label,
      app: item.app,
      company: item.company,
      role: item.role,
      kind: item.kind,
      http_ok: attempt.ok,
      http_status: attempt.status,
      error: attempt.error,
      retried,
      latency_ms: attempt.latencyMs,
      finish_reason: attempt.finish_reason || null,
      usage: attempt.usage,
      raw_chars: attempt.content?.length || 0,
      extract_ok: extractOk,
      parse_ok: parseOk,
      extract_error: extractError,
      schema_issues: schemaIssues,
      schema_ok: extractOk && parseOk && schemaIssues.length === 0,
      quality_heuristic: quality,
    };
    results.push(row);
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    fs.writeFileSync(
      path.join(outDir, "raw", `${tag}.txt`),
      attempt.content || `ERROR ${attempt.status}: ${attempt.error || "unknown"}`,
      "utf8",
    );
    if (jsonText) {
      fs.writeFileSync(path.join(outDir, "raw", `${tag}.json`), jsonText, "utf8");
    }
    console.log(
      `  ok=${attempt.ok} extract=${extractOk} schema=${row.schema_ok} q=${quality} ${attempt.latencyMs}ms chars=${row.raw_chars} err=${attempt.error || "-"}`,
    );
    await sleep(SLEEP_MS);
  }
}

console.log(`\nDone. ${results.length} rows`);
