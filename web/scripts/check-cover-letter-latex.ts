/**
 * Compile a sample cover letter and report whether the PDF came back.
 *
 * The cover letter is generated LaTeX now, and a LaTeX bug shows up as a
 * failed compile at the end of a two-minute Apply run. This renders one with
 * the characters that actually break TeX — ampersands, percent signs, braces,
 * a URL with a query string — and pushes it through the same build service the
 * app uses.
 *
 * Usage: npx tsx scripts/check-cover-letter-latex.ts [--write out.pdf]
 */
import fs from "fs";
import { compileLatexToPdf } from "../src/lib/builder/compile-pdf";
import { generateCoverLetterLatex } from "../src/lib/builder/cover-letter-latex";

const latex = generateCoverLetterLatex({
  content: {
    opening_hook:
      "Dear Acme Hiring Team, I have spent four years shipping payments products, and Acme's move into UPI autopay is the problem I want next.",
    why_this_role:
      "The role asks for someone who can own a P&L and work 100% remotely with design & engineering — that is the shape of my last two years.",
    evidence_points: [
      "Cut checkout drop-off by 23% at Northwind by rebuilding the retry flow (see northwind.example.com/case?id=42).",
      "Led a 6-person squad through a migration to Kubernetes with zero customer-visible downtime.",
      "Owned a $4M ARR line and grew it 31% year over year using {experiment-led} pricing.",
    ],
    why_this_company:
      "Acme's public writing on 100% test coverage and its \"ship small\" culture matches how I work.",
    cta: "I would welcome 20 minutes to talk through the autopay roadmap.",
    // The real letter, as an edited body would arrive: this is what gets
    // rendered, and the sections above are only the fallback.
    body: [
      "I have spent four years shipping payments products, and Acme's move into UPI autopay is the problem I want next.",
      "The role asks for someone who can own a P&L and work 100% remotely with design & engineering — that is the shape of my last two years.",
      "At Northwind I cut checkout drop-off by 23% by rebuilding the retry flow (northwind.example.com/case?id=42), led a 6-person squad through a Kubernetes migration with no customer-visible downtime, and grew a $4M ARR line by 31% using {experiment-led} pricing.",
      "Acme's public writing on 100% test coverage and its \"ship small\" culture matches how I work. I would welcome 20 minutes to talk through the autopay roadmap.",
    ].join("\n\n"),
  },
  profile: {
    full_name: "Aditi Rao",
    email: "aditi.rao@example.com",
    phone: "+91 98765 43210",
    location: "Bengaluru, India",
    linkedin_url: "linkedin.com/in/aditi-rao",
    portfolio_url: "https://aditi.example.com/work?src=cv",
  },
  company: "Acme & Co.",
  role: "Senior Product Manager (Payments)",
  date: new Date("2026-09-10T00:00:00Z"),
});

console.log(`LaTeX: ${latex.length} chars`);

const outIndex = process.argv.indexOf("--write");
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : null;

async function main() {
  try {
    const started = Date.now();
    const pdf = await compileLatexToPdf(latex);
    console.log(
      `PDF: ${pdf.length} bytes in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
    if (!pdf.subarray(0, 5).toString("utf8").startsWith("%PDF-")) {
      console.error("Response is not a PDF.");
      process.exit(1);
    }
    if (outPath) {
      fs.writeFileSync(outPath, pdf);
      console.log(`Wrote ${outPath}`);
    }
    console.log("OK");
  } catch (error) {
    console.error("FAILED:", error instanceof Error ? error.message : error);
    console.error("\n--- LaTeX source ---\n" + latex);
    process.exit(1);
  }
}

void main();
