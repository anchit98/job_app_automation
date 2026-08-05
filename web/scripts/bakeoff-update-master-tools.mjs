import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv(path.join(__dirname, "../.env.local"));

const USER_ID = "ca7513be-4b5c-43a7-81f0-e98052689b6e";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const [row] = await sql`
  SELECT content FROM master_resume WHERE user_id = ${USER_ID}
`;
const content =
  typeof row.content === "string" ? JSON.parse(row.content) : row.content;

console.log("skills before:", content.skills);

// Keep 4 skill lines; fold tools into AI & Data lines without adding a 5th line.
content.skills = [
  "Product Management: Product Discovery, Product Strategy, Product Roadmap, PRD, Cross-Functional Leadership, Stakeholder Management, Agile/Scrum, GTM, Voice of the Customer",
  "Product Analytics & Growth: KPI Ownership, A/B Testing, Funnel Optimization, Retention, Churn, CSAT",
  "AI & Automation: LLM Integration, RAG, Agentic AI, MCP Integrations, Process Automation, Claude, OpenAI APIs, Gemini, Prompt Engineering, AI Prototyping",
  "Data & Build: Python, SQL, Streamlit, Replit, Railway, Render, Supabase, Vercel, Power BI, Cursor, Google Stitch, Figma, Miro, Whimsical, Jira, Wrike",
];

await sql`
  UPDATE master_resume
  SET content = ${sql.json(content)}
  WHERE user_id = ${USER_ID}
`;

const masterPath = path.join(
  __dirname,
  "../../masterresume/anchit-master-resume.json",
);
const masterFile = JSON.parse(fs.readFileSync(masterPath, "utf8"));
masterFile.skills = content.skills;
fs.writeFileSync(masterPath, JSON.stringify(masterFile, null, 2) + "\n");

console.log("skills after:", content.skills);
await sql.end();
console.log("Updated DB + masterresume JSON");
