import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { estimateTextWidth } from "../src/lib/resume/text-width";
import { countWords } from "../src/lib/resume/bullet-layout";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const master = JSON.parse(
  fs.readFileSync(path.join(root, "masterresume/anchit-master-resume.json"), "utf8"),
);

// Original pre-bakeoff skill lines (length anchors for the Google Doc slots)
const masterSkills = [
  "Product Management: Product Discovery, Product Strategy, Product Roadmap, PRD, Cross-Functional Leadership, Stakeholder Management, Agile/Scrum, GTM, Voice of the Customer",
  "Product Analytics & Growth: KPI Ownership, A/B Testing, Funnel Optimization, Retention, Churn, CSAT",
  "AI & Automation: LLM Integration, RAG, Agentic AI, MCP Integrations, Process Automation",
  "Data & Build: Power BI, Cursor, Google Antigravity, Render, Vercel, Google Stitch, SQL, Figma, Miro, Whimsical, Jira, Wrike",
];

function cloneMaster() {
  return JSON.parse(JSON.stringify(master));
}

function assertFit(label: string, text: string, masterText: string, tol = 1.5) {
  const w = estimateTextWidth(text);
  const mw = estimateTextWidth(masterText);
  const words = countWords(text);
  const mwords = countWords(masterText);
  const ok = w <= mw + tol;
  console.log(
    `${ok ? "OK" : "FAIL"} ${label} width ${w.toFixed(0)}/${mw.toFixed(0)} words ${words}/${mwords}`,
  );
  if (!ok) throw new Error(`${label} exceeds master width`);
}

// --- MiQ ---
const miq = cloneMaster();
miq.headline = "Product Manager, Intelligence | AI/ML | 0-to-1 Products";

// WPP b2: remove "success " to fund "data-intensive" over "delivered"
miq.experience[0].bullets[2] =
  "Tracked KPIs across multiple data-intensive products, overall achieving 80% adoption, 90% retention, 8-10% churn, 88% CSAT, while simultaneously monitoring active users, usage rates, time spent, task completions, issues raised per product, etc.";

// Annalect b0: drop "and execution " to fund "algorithmic AI/ML products"
miq.experience[1].bullets[0] =
  "Managed product strategy of multiple algorithmic AI/ML products saving ~INR 50 Cr+ and 176,000+ hours overall.";

// Keep Annalect b3 at master wording (no UX collaboration bloat)
miq.experience[1].bullets[3] =
  "Suggested UI/UX modifications across 3 major products (worth ~INR 4 Cr+), improving usability and end-user adoption.";

// Projects: keep master bullets; tool swaps only in subtitles at <= master width
miq.projects[0].subtitle =
  "Website Link | Cursor, Streamlit, Replit, Claude, Groq LLM API, GitHub Actions";
miq.projects[1].subtitle =
  "Website Link | Cursor, Supabase, Railway, Render, Groq LLM API, GitHub Actions";
// Groww bullet: keep master (already has AI-powered); optional prototyping via skill line

miq.skills = [
  "Product Management: Product Discovery, Product Strategy, Product Roadmap, PRD, Cross-Functional Leadership, Stakeholder Management, Agile/Scrum, GTM, Voice of the Customer",
  "Product Analytics & Growth: Amplitude, KPI Ownership, A/B Testing, Retention, Churn, CSAT",
  "AI & Automation: Claude, OpenAI APIs, Gemini, RAG, AI Prototyping, Process Automation",
  "Data & Build: Python, SQL, Streamlit, Replit, Railway, Render, Supabase, Vercel, Power BI, Cursor, Jira, Miro",
];

// --- Govpreneurs ---
const gov = cloneMaster();
gov.headline = "Product Manager | AI Products & Automation | 0-to-1 Products";

// WPP b0: swap VOC phrase for customer obsession without growing width
gov.experience[0].bullets[0] =
  "Supervised product discovery for 250+ internal automation initiatives using customer-obsession signals and data-driven prioritizations resulting in 30% FTE, 33,000+ hours & ~INR 10 Cr+ savings with 88%+ stakeholder alignment.";

// WPP b2: keep master length (PostHog lives in skills)
gov.experience[0].bullets[2] = master.experience[0].bullets[2];

// Annalect b0: AI products (similar length to AI automations)
gov.experience[1].bullets[0] =
  "Managed product strategy and execution of multiple AI products saving ~INR 50 Cr+ and 176,000+ hours overall.";

// Annalect b3: design intuition — keep near master width
gov.experience[1].bullets[3] =
  "Suggested UI/UX modifications across 3 major products (worth ~INR 4 Cr+), improving usability and end-user adoption.";

// Servetel b1: curiosity via compact swap; drop "market " before trends to fund width
gov.experience[2].bullets[1] =
  "Conducted curious market & competitor research to forecast FY22–23 trends and identify growth opportunities. Delivered strategic recommendations that informed business decisions and contributed to a 230% increase in sales within 6 months.";

// Meta: high agency / bias for action without net growth vs master
gov.projects[2].bullets[0] =
  "Led the end-to-end automation of Meta campaign activation for India's implementation team to eliminate costly manual-entry errors, delivering a zero-touch setup workflow via high-agency bias-for-action execution. The solution achieved 35% FTE savings, 86% CSAT, and ~INR 1.5 Cr+ in annual departmental savings.";

gov.projects[0].subtitle =
  "Website Link | Cursor, Streamlit, Replit, Claude, Groq LLM API, GitHub Actions";
gov.projects[1].subtitle =
  "Website Link | Cursor, Supabase, Railway, Render, Groq LLM API, GitHub Actions";

gov.skills = [
  "Product Management: Product Discovery, Product Strategy, Product Roadmap, PRD, Cross-Functional Leadership, Stakeholder Management, Agile/Scrum, GTM, Customer Obsession",
  "Product Analytics & Growth: PostHog, KPI Ownership, A/B Testing, Retention, Churn, CSAT",
  "AI & Automation: Claude, OpenAI API, Anthropic API, RAG, Prompting, Process Automation",
  "Data & Build: Python, SQL, Streamlit, Replit, Railway, Render, Supabase, Claude Code, Vercel, Power BI, Cursor, Jira",
];

// Master file + future generations: tools swapped in at master widths
const masterOut = cloneMaster();
masterOut.skills = [
  "Product Management: Product Discovery, Product Strategy, Product Roadmap, PRD, Cross-Functional Leadership, Stakeholder Management, Agile/Scrum, GTM, Voice of the Customer",
  "Product Analytics & Growth: KPI Ownership, A/B Testing, Funnel Optimization, Retention, Churn, CSAT",
  "AI & Automation: Claude, OpenAI APIs, Gemini, RAG, AI Prototyping, Process Automation",
  "Data & Build: Python, SQL, Streamlit, Replit, Railway, Render, Supabase, Vercel, Power BI, Cursor, Jira, Miro",
];

function validate(label: string, tailored: any) {
  console.log(`\nValidate ${label}`);
  assertFit("headline", tailored.headline, master.headline, 8); // headline can vary slightly
  for (let i = 0; i < tailored.experience.length; i++) {
    for (let j = 0; j < tailored.experience[i].bullets.length; j++) {
      assertFit(
        `E${i}b${j}`,
        tailored.experience[i].bullets[j],
        master.experience[i].bullets[j],
        2,
      );
    }
  }
  for (let i = 0; i < tailored.projects.length; i++) {
    for (let j = 0; j < tailored.projects[i].bullets.length; j++) {
      assertFit(
        `P${i}b${j}`,
        tailored.projects[i].bullets[j],
        master.projects[i].bullets[j],
        2,
      );
    }
    assertFit(
      `P${i}sub`,
      tailored.projects[i].subtitle || "",
      master.projects[i].subtitle || "",
      2,
    );
  }
  tailored.skills.forEach((s: string, i: number) => {
    assertFit(`SK${i}`, s, masterSkills[i], 2);
  });
}

validate("MIQ", miq);
validate("GOV", gov);
validate("MASTER_SKILLS", { ...masterOut, experience: master.experience, projects: master.projects, headline: master.headline });

fs.writeFileSync(
  path.join(root, "bakeoff-out/raw/miq__resume__google_gemma-4-31b-it.json"),
  JSON.stringify(miq, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(root, "bakeoff-out/raw/govpreneurs__resume__google_gemma-4-31b-it.json"),
  JSON.stringify(gov, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(root, "masterresume/anchit-master-resume.json"),
  JSON.stringify(masterOut, null, 2) + "\n",
);

console.log("\nWrote trimmed resumes + master skills");
