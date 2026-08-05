import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { estimateTextWidth } from "../src/lib/resume/text-width";
import { countWords } from "../src/lib/resume/bullet-layout";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const master = JSON.parse(
  fs.readFileSync(path.join(root, "masterresume/anchit-master-resume.json"), "utf8"),
);
const full = JSON.parse(
  fs.readFileSync(path.join(root, "bakeoff-out/playsimple/resume_full.json"), "utf8"),
);

const candidates = {
  headline: [
    "Product Manager | Ownership | 0-to-1 Products",
    "Product Manager | Game Products | 0-to-1 Products",
    "Product Manager | Ownership & GTM | 0-to-1 Products",
  ],
  E1b0: [
    "Managed product lifecycle strategy of multiple AI automations saving ~INR 50 Cr+ and 176,000+ hours overall.",
    "Managed product strategy and execution of AI automations saving ~INR 50 Cr+ and 176,000+ hours overall.",
    "Managed product strategy and execution of multiple AI automations saving ~INR 50 Cr+ and 176,000+ hours overall.",
  ],
  E1b3: [
    "Suggested design modifications across 3 major products (worth ~INR 4 Cr+), improving usability and end-user adoption.",
    "Suggested UI/UX modifications across 3 major products (worth ~INR 4 Cr+), improving usability and end-user adoption.",
  ],
  SK1: [
    "Product Analytics & Growth: Analytical Skills, KPI Ownership, A/B Testing, Retention, Churn, CSAT",
    "Product Analytics & Growth: Analytical Skills, KPI Ownership, A/B Testing, Funnel Optimization, CSAT",
    "Product Analytics & Growth: KPI Ownership, A/B Testing, Funnel Optimization, Retention, Churn, CSAT",
  ],
};

function pick(label: string, options: string[], masterText: string) {
  for (const opt of options) {
    const w = estimateTextWidth(opt);
    const mw = estimateTextWidth(masterText);
    const ok = w <= mw + 2;
    console.log(
      `${ok ? "OK" : "no"} ${label} ${w.toFixed(0)}/${mw.toFixed(0)} ${JSON.stringify(opt)}`,
    );
    if (ok) return opt;
  }
  throw new Error(`No fit for ${label}`);
}

full.headline = pick("headline", candidates.headline, master.headline);
full.experience[1].bullets[0] = pick(
  "E1b0",
  candidates.E1b0,
  master.experience[1].bullets[0],
);
full.experience[1].bullets[3] = pick(
  "E1b3",
  candidates.E1b3,
  master.experience[1].bullets[3],
);
full.skills[1] = pick("SK1", candidates.SK1, master.skills[1]);

fs.writeFileSync(
  path.join(root, "bakeoff-out/playsimple/resume_full.json"),
  JSON.stringify(full, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(root, "bakeoff-out/raw/playsimple__resume__google_gemma-4-31b-it.json"),
  JSON.stringify(full, null, 2) + "\n",
);
console.log("fitted + saved");
