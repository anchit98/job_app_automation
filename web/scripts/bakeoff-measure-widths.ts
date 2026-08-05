import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { estimateTextWidth } from "../src/lib/resume/text-width";
import {
  BULLET_MAX_WIDTH,
  BULLET_TARGET_WIDTH,
  countWords,
} from "../src/lib/resume/bullet-layout";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const originalSkills = [
  "Product Management: Product Discovery, Product Strategy, Product Roadmap, PRD, Cross-Functional Leadership, Stakeholder Management, Agile/Scrum, GTM, Voice of the Customer",
  "Product Analytics & Growth: KPI Ownership, A/B Testing, Funnel Optimization, Retention, Churn, CSAT",
  "AI & Automation: LLM Integration, RAG, Agentic AI, MCP Integrations, Process Automation",
  "Data & Build: Power BI, Cursor, Google Antigravity, Render, Vercel, Google Stitch, SQL, Figma, Miro, Whimsical, Jira, Wrike",
];

function load(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
}

function dump(label: string, r: any) {
  console.log(`\n=== ${label} ===`);
  for (let i = 0; i < r.experience.length; i++) {
    const masterExp = load(path.join(root, "masterresume/anchit-master-resume.json"))
      .experience[i];
    for (let j = 0; j < r.experience[i].bullets.length; j++) {
      const b = r.experience[i].bullets[j];
      const m = masterExp.bullets[j];
      const w = estimateTextWidth(b);
      const mw = estimateTextWidth(m);
      const flag = w > mw + 2 ? " LONGER" : "";
      const over = w > BULLET_MAX_WIDTH ? " OVER" : "";
      console.log(
        `E${i}b${j} now=${w.toFixed(0)} master=${mw.toFixed(0)} words=${countWords(b)}/${countWords(m)} chars=${b.length}/${m.length}${flag}${over}`,
      );
    }
  }
  for (let i = 0; i < r.projects.length; i++) {
    const master = load(path.join(root, "masterresume/anchit-master-resume.json"))
      .projects[i];
    for (let j = 0; j < r.projects[i].bullets.length; j++) {
      const b = r.projects[i].bullets[j];
      const m = master.bullets[j];
      console.log(
        `P${i}b${j} now=${estimateTextWidth(b).toFixed(0)} master=${estimateTextWidth(m).toFixed(0)} words=${countWords(b)}/${countWords(m)}`,
      );
    }
    console.log(
      `P${i}sub now=${estimateTextWidth(r.projects[i].subtitle || "").toFixed(0)} master=${estimateTextWidth(master.subtitle || "").toFixed(0)}`,
    );
  }
  r.skills.forEach((s: string, i: number) => {
    const m = originalSkills[i];
    const w = estimateTextWidth(s);
    const mw = estimateTextWidth(m);
    console.log(
      `SK${i} now=${w.toFixed(0)} master=${mw.toFixed(0)} chars=${s.length}/${m.length}${w > mw + 2 ? " LONGER" : ""}`,
    );
  });
}

const master = load(path.join(root, "masterresume/anchit-master-resume.json"));
master.skills = originalSkills;
dump("MASTER", master);
dump("MIQ", load(path.join(root, "bakeoff-out/raw/miq__resume__google_gemma-4-31b-it.json")));
dump("GOV", load(path.join(root, "bakeoff-out/raw/govpreneurs__resume__google_gemma-4-31b-it.json")));
console.log(`ceilings max=${BULLET_MAX_WIDTH} target=${BULLET_TARGET_WIDTH}`);
