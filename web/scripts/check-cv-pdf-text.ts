/**
 * Compile the sample CV and check what a text extractor sees.
 *
 * The header used to print its contact row in an icon font, so every parser
 * downstream — Drive's PDF import, and the ATS the resume is sent to — read
 * "Æ" where the phone number should be. This compiles the real template and
 * asserts the icon font is not embedded at all.
 *
 *   npx tsx scripts/check-cv-pdf-text.ts
 */
import { writeFileSync } from "node:fs";
import { compileLatexToPdf } from "@/lib/builder/compile-pdf";
import { generateLatexContent } from "@/lib/builder/latex-engine";
import type { BuilderProfile } from "@/lib/builder/types";

const profile: BuilderProfile = {
  name: "Anchit Boruuah",
  professional_field: "tech",
  professional_summary:
    "Product manager and analyst with six years shipping data products.",
  contact: {
    phone: "9910980793",
    email: "jobsforanchit.boruah@gmail.com",
    linkedin: "linkedin.com/in/anchitboruah",
    github: "github.com/anchitb",
    portfolio: "https://anchit.dev",
    location: "Bengaluru, India",
  },
  education: [
    {
      institution: "University of Petroleum and Energy Studies",
      location: "Dehradun, Uttarakhand",
      degree: "BTech Petroleum Engineering",
      graduation_date: "2020",
    },
  ],
  experience: [
    {
      company: "WPP Media",
      role: "Senior Product Manager & Analyst",
      location: "Bengaluru, India",
      start_date: "Apr 2024",
      end_date: "Present",
      description: [
        "Supervised product discovery for 250+ stakeholders, cutting intake-to-handoff time by 70%.",
        "Tracked success KPIs across delivered products: 80% adoption, 90% retention, 88% CSAT.",
      ],
    },
  ],
  skills: [
    { category_name: "Product", skills: ["Discovery", "Roadmapping", "PRDs"] },
    { category_name: "Data", skills: ["SQL", "Python", "dbt", "Looker"] },
  ],
  projects: [
    {
      name: "Panel Health Monitor",
      demo_link: "https://example.com/panel-health?ref=cv&v=2",
      technologies: "React, Node.js, PostgreSQL, Redis, Docker, AWS Lambda",
      description: ["Surfaced panel attrition a fortnight before it landed."],
    },
  ],
};

async function main() {
  const latex = generateLatexContent(profile);
  const pdf = await compileLatexToPdf(latex);
  const out = process.argv[2] ?? "cv-sample.pdf";
  writeFileSync(out, pdf);

  const raw = pdf.toString("latin1");
  console.log(`wrote ${out} (${pdf.length} bytes)`);
  console.log("FontAwesome embedded:", raw.includes("FontAwesome"));
  console.log(
    "fonts:",
    [...new Set(raw.match(/\/BaseFont\s*\/([A-Za-z0-9+-]+)/g) ?? [])].join(", "),
  );
  console.log("link annotations:", (raw.match(/\/Subtype\s*\/Link/g) ?? []).length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
