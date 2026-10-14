/**
 * Round-trip check for the CV builder's master Doc.
 *
 * Builds the Doc lines from a profile, then feeds those lines back through
 * master-sync exactly as if they had been read out of Google Docs. The Doc we
 * write has to stay parseable: the app-written slot map is used on the first
 * sync, but a later "sync again" reads the Doc from scratch.
 *
 *   npx tsx scripts/check-master-doc-build.ts
 */
import type { docs_v1 } from "googleapis";
import type { DocsClient } from "@/lib/google/docs";
import { buildMasterDoc, builtMasterToSynced } from "@/lib/builder/master-doc";
import { generateLatexContent } from "@/lib/builder/latex-engine";
import { syncMasterResumeFromDoc } from "@/lib/resume/master-sync";
import { stripIconGlyphs } from "@/lib/resume/icon-glyphs";
import type { BuilderProfile } from "@/lib/builder/types";

const profile: BuilderProfile = {
  name: "Anchit Boruuah",
  professional_field: "tech",
  professional_summary:
    "Product manager and analyst with six years shipping data products, moving discovery-to-handoff time down by 70% and holding 88% CSAT across a portfolio of internal tools.",
  contact: {
    phone: "9910980793",
    email: "jobsforanchit.boruah@gmail.com",
    linkedin: "https://linkedin.com/in/anchitboruah",
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
        "Owned Agile sprint planning and capacity across three squads.",
      ],
    },
    {
      company: "Nielsen",
      role: "Business Analyst",
      location: "Gurgaon, India",
      start_date: "Jul 2020",
      end_date: "Mar 2024",
      description: [
        "Built the reporting layer behind a 40-market media panel refresh.",
        "Automated a weekly QA pass that removed two analyst-days per week.",
      ],
    },
  ],
  skills: [
    {
      category_name: "Product",
      skills: ["Discovery", "Roadmapping", "A/B testing", "PRDs"],
    },
    {
      category_name: "Data",
      skills: ["SQL", "Python", "dbt", "Looker", "Amplitude"],
    },
  ],
  projects: [
    {
      name: "Panel Health Monitor",
      demo_link: "https://example.com/panel-health",
      technologies: "React, Node.js, PostgreSQL, Redis, Docker, AWS Lambda",
      description: [
        "Surfaced panel attrition a fortnight before it hit reported numbers.",
      ],
    },
  ],
  certifications: ["Certified Scrum Product Owner (2023)"],
};

function asDocument(
  lines: ReturnType<typeof buildMasterDoc>["lines"],
): docs_v1.Schema$Document {
  return {
    body: {
      content: lines.map((line) => ({
        paragraph: {
          elements: [{ textRun: { content: `${line.text}\n` } }],
          ...(line.kind === "bullet" ? { bullet: { listId: "kix.list" } } : {}),
        },
      })),
    },
  };
}

async function main() {
  const built = buildMasterDoc(profile);

  console.log("--- Doc lines ---");
  for (const line of built.lines) {
    console.log(`${line.kind.padEnd(10)} | ${line.text.replace(/\t/g, " ⇥ ")}`);
  }

  console.log("\n--- Contact links ---");
  const contact = built.lines.find((l) => l.kind === "contact");
  for (const link of contact?.links ?? []) {
    console.log(
      `${contact!.text.slice(link.start, link.end).padEnd(34)} -> ${link.url}`,
    );
  }

  console.log("\n--- Slots written by the builder ---");
  for (const slot of built.slots) {
    console.log(`${slot.key.padEnd(20)} ${slot.original.slice(0, 60)}`);
  }

  const stub = {
    getDocument: async () => asDocument(built.lines),
  } as unknown as DocsClient;
  const reparsed = await syncMasterResumeFromDoc(stub, "doc-id");

  console.log("\n--- Re-sync of the same Doc (heuristic parse) ---");
  console.log("mode:", reparsed.sync_mode);
  console.log("headline:", reparsed.content.headline.slice(0, 70));
  console.log("contact_line:", reparsed.content.contact_line);
  console.log(
    "experience:",
    reparsed.content.experience.map(
      (e) => `${e.company} / ${e.title} / ${e.start_date}-${e.end_date} / ${e.bullets.length} bullets`,
    ),
  );
  console.log(
    "projects:",
    reparsed.content.projects.map((p) => `${p.name} (${p.bullets.length})`),
  );
  console.log("skills:", reparsed.content.skills);
  console.log("education:", reparsed.content.education);
  console.log("slots:", reparsed.layout.slots.length);

  const written = builtMasterToSynced(built, "doc-id");
  console.log("\nslots app-written vs re-parsed:", written.layout.slots.length, "vs", reparsed.layout.slots.length);

  console.log("\n--- Icon debris stripping ---");
  const dirty =
    "Æ 9910980793 | [ jobsforanchit.boruah@gmail.com | ° LinkedIn |  GitHub |  Portfolio | ½ Bengaluru, India";
  console.log("before:", dirty);
  console.log("after :", stripIconGlyphs(dirty));

  console.log("\n--- LaTeX header ---");
  const latex = generateLatexContent(profile);
  const headerStart = latex.indexOf("\\begin{center}");
  console.log(latex.slice(headerStart, latex.indexOf("\\end{center}", headerStart) + 12));
  console.log(
    "icon font referenced:",
    /\\fa[A-Z]|usepackage\{fontawesome\}/.test(latex),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
