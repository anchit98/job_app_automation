/**
 * Compose live resume prompt for PlaySimple + run Gemma, then validate widths.
 * Usage (from web/): npx tsx scripts/bakeoff-playsimple-gemma-resume.ts
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import postgres from "postgres";
import { randomUUID } from "crypto";
import { composePrompt } from "../src/lib/prompt/composer";
import { buildResumeStructuralGuide } from "../src/lib/resume/prompt-anchors";
import { buildJdKeywordBrief } from "../src/lib/resume/jd-keywords";
import { buildJdContent } from "../src/lib/resume/context";
import { resumeContentSchema } from "../src/lib/resume/fabrication";
import { estimateTextWidth } from "../src/lib/resume/text-width";
import { countWords } from "../src/lib/resume/bullet-layout";
import type { Application, PromptTemplate } from "../src/lib/db/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const outDir = path.join(root, "bakeoff-out", "playsimple");
const APP_ID = "91637eb3-a7ed-4633-a087-99a4a20986b3";
const USER_ID = "ca7513be-4b5c-43a7-81f0-e98052689b6e";
const MODEL = "google/gemma-4-31b-it";

function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv(path.join(__dirname, "../.env.local"));
loadEnv(path.join(root, ".env.testing.local"));

function extractJson(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const o = text.indexOf("{");
  const a = text.indexOf("[");
  const idxs = [o, a].filter((x) => x >= 0);
  if (!idxs.length) throw new Error("No JSON in model output");
  return text.slice(Math.min(...idxs));
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const [appRow] = await sql`SELECT * FROM applications WHERE id = ${APP_ID}`;
  const [masterRow] = await sql`
    SELECT content, rules, doc_layout, doc_id FROM master_resume WHERE user_id = ${USER_ID}
  `;
  const [templateRow] = await sql`
    SELECT * FROM prompt_templates
    WHERE kind = 'resume' AND active = 1
    ORDER BY version DESC LIMIT 1
  `;
  await sql.end();

  if (!appRow) throw new Error("PlaySimple application not found");
  if (!masterRow?.content) throw new Error("Master resume missing");
  if (!templateRow) throw new Error("Active resume template missing");

  const application = {
    ...appRow,
    jd_parsed:
      typeof appRow.jd_parsed === "string"
        ? JSON.parse(appRow.jd_parsed)
        : appRow.jd_parsed,
  } as Application;

  const masterContent =
    typeof masterRow.content === "string"
      ? JSON.parse(masterRow.content)
      : masterRow.content;
  const masterParsed = resumeContentSchema.parse(masterContent);
  const docLayout =
    typeof masterRow.doc_layout === "string"
      ? JSON.parse(masterRow.doc_layout)
      : masterRow.doc_layout;
  const rules =
    typeof masterRow.rules === "string"
      ? JSON.parse(masterRow.rules)
      : masterRow.rules ?? {};

  const template: PromptTemplate = {
    id: String(templateRow.id),
    kind: "resume",
    version: Number(templateRow.version),
    body: String(templateRow.body),
    variables:
      typeof templateRow.variables === "string"
        ? JSON.parse(templateRow.variables)
        : (templateRow.variables as string[]) ?? [],
    output_schema:
      typeof templateRow.output_schema === "string"
        ? templateRow.output_schema
        : JSON.stringify(templateRow.output_schema),
    active: true,
    notes: templateRow.notes ? String(templateRow.notes) : null,
    created_at: String(templateRow.created_at),
  };

  const runId = randomUUID();
  const promptText = composePrompt(
    template,
    {
      master_resume_json: JSON.stringify(masterParsed, null, 2),
      jd_content: buildJdContent(application),
      jd_keyword_brief: buildJdKeywordBrief(application),
      rules_json: JSON.stringify(rules, null, 2),
      section_budgets: buildResumeStructuralGuide(
        masterParsed,
        rules,
        docLayout as Record<string, unknown> | null,
      ),
    },
    runId,
  );

  const promptPath = path.join(outDir, "resume_prompt.txt");
  fs.writeFileSync(promptPath, promptText, "utf8");
  console.log(
    "Composed prompt",
    promptText.length,
    "chars; template v" + template.version,
    template.notes,
  );
  console.log(
    "Kickoff check Anchit?",
    /Anchit Boruah/i.test(promptText) ? "YES (bad)" : "no (good)",
  );

  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY missing in .env.testing.local");

  const reqPath = path.join(outDir, "resume_req.json");
  const apiPath = path.join(outDir, "resume_api.json");
  const body = {
    model: MODEL,
    temperature: 0.2,
    top_p: 0.9,
    max_tokens: 6144,
    stream: false,
    messages: [
      {
        role: "system",
        content:
          "You are a careful assistant for job-application automation. Return ONLY valid JSON matching the user's schema. No markdown fences, no preamble, no reasoning outside JSON.",
      },
      { role: "user", content: promptText },
    ],
  };
  fs.writeFileSync(reqPath, JSON.stringify(body), "utf8");

  console.log("Calling Gemma…");
  let http = "000";
  let lastErr = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const curlOut = execFileSync(
        "curl.exe",
        [
          "-sS",
          "-m",
          "360",
          "-w",
          "\nHTTP:%{http_code}",
          "https://integrate.api.nvidia.com/v1/chat/completions",
          "-H",
          `Authorization: Bearer ${key}`,
          "-H",
          "Content-Type: application/json",
          "--data-binary",
          `@${reqPath}`,
          "-o",
          apiPath,
        ],
        { encoding: "utf8", timeout: 380000 },
      );
      http = (curlOut.match(/HTTP:(\d+)/) || [])[1] || "000";
      console.log(`Attempt ${attempt} HTTP ${http}`);
      if (http === "200") break;
      lastErr = fs.existsSync(apiPath)
        ? fs.readFileSync(apiPath, "utf8").slice(0, 300)
        : curlOut.slice(0, 300);
    } catch (e) {
      lastErr = String((e as Error).message || e)
        .replace(/Bearer\s+\S+/g, "Bearer [REDACTED]")
        .slice(0, 300);
      console.log(`Attempt ${attempt} failed: ${lastErr}`);
      http = "000";
    }
    if (attempt < 4) {
      const sleep = Math.min(90, 10 * 2 ** (attempt - 1));
      console.log(`Retry sleep ${sleep}s`);
      execFileSync("powershell.exe", ["-Command", `Start-Sleep -Seconds ${sleep}`], {
        stdio: "ignore",
      });
    }
  }
  if (http !== "200") {
    throw new Error(`Gemma call failed HTTP ${http}: ${lastErr}`);
  }

  const api = JSON.parse(fs.readFileSync(apiPath, "utf8"));
  const raw = String(api.choices?.[0]?.message?.content ?? "");
  fs.writeFileSync(path.join(outDir, "resume_raw.txt"), raw, "utf8");
  const jsonText = extractJson(raw);
  fs.writeFileSync(path.join(outDir, "resume.json"), jsonText, "utf8");

  const tailored = JSON.parse(jsonText);
  // Merge with master non-bullet fields for PDF generation
  const full = {
    ...masterParsed,
    headline: tailored.headline ?? masterParsed.headline,
    experience: masterParsed.experience.map((exp, i) => ({
      ...exp,
      bullets: tailored.experience?.[i]?.bullets ?? exp.bullets,
    })),
    projects: masterParsed.projects.map((p, i) => ({
      ...p,
      bullets: tailored.projects?.[i]?.bullets ?? p.bullets,
      subtitle: tailored.projects?.[i]?.subtitle ?? p.subtitle,
    })),
    skills: tailored.skills ?? masterParsed.skills,
  };
  fs.writeFileSync(
    path.join(outDir, "resume_full.json"),
    JSON.stringify(full, null, 2),
    "utf8",
  );

  console.log("\nWidth check vs master:");
  let fails = 0;
  const check = (label: string, now: string, master: string) => {
    const w = estimateTextWidth(now);
    const mw = estimateTextWidth(master);
    const ok = w <= mw + 2;
    if (!ok) fails++;
    console.log(
      `${ok ? "OK" : "FAIL"} ${label} w=${w.toFixed(0)}/${mw.toFixed(0)} words=${countWords(now)}/${countWords(master)}`,
    );
  };
  if (full.headline) check("headline", full.headline, masterParsed.headline || "");
  full.experience.forEach((exp, i) => {
    exp.bullets.forEach((b, j) =>
      check(`E${i}b${j}`, b, masterParsed.experience[i].bullets[j]),
    );
  });
  full.projects.forEach((p, i) => {
    p.bullets.forEach((b, j) =>
      check(`P${i}b${j}`, b, masterParsed.projects[i].bullets[j]),
    );
  });
  full.skills.forEach((s, i) =>
    check(`SK${i}`, s, masterParsed.skills[i] || ""),
  );
  console.log(fails ? `\n${fails} line(s) over master width` : "\nAll lines within master width");
  console.log("Wrote", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
