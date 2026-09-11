/**
 * Typeset the newest tailored resume and compile it, so the layout can be
 * looked at rather than guessed about.
 *
 * Usage: npx tsx scripts/check-tailored-resume-latex.ts out.pdf
 */
import fs from "fs";
for (const line of fs.readFileSync(".env.local","utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g,"");
}
async function main() {
  const { dbAll } = await import("../src/lib/db/index");
  const { generateTailoredResumeLatex } = await import("../src/lib/builder/tailored-resume-latex");
  const { compileLatexToPdf } = await import("../src/lib/builder/compile-pdf");

  const [rv] = (await dbAll(
    `SELECT r.content, a.role FROM resume_versions r
       JOIN applications a ON a.id = r.application_id
      WHERE r.status = 'ready' ORDER BY r.created_at DESC LIMIT 1`)) as any[];
  const [p] = (await dbAll(
    `SELECT full_name, phone, location, linkedin_url, github_url, portfolio_url
       FROM profiles WHERE full_name IS NOT NULL ORDER BY updated_at DESC LIMIT 1`)) as any[];
  const [u] = (await dbAll(`SELECT email FROM users WHERE email IS NOT NULL ORDER BY created_at DESC LIMIT 1`)) as any[];

  const content = typeof rv.content === "string" ? JSON.parse(rv.content) : rv.content;
  console.log(`role: ${rv.role}`);
  console.log(`headline: ${content.headline}`);
  console.log(`experience: ${content.experience.length}  projects: ${(content.projects||[]).length}  skills: ${(content.skills||[]).length}  education: ${(content.education||[]).length}`);

  const latex = generateTailoredResumeLatex({
    content,
    profile: { ...p, email: u?.email },
  });
  console.log(`latex: ${latex.length} chars`);
  const pdf = await compileLatexToPdf(latex);
  console.log(`pdf: ${pdf.length} bytes`);
  const out = process.argv[2];
  if (out) { fs.writeFileSync(out, pdf); console.log("wrote " + out); }
  process.exit(0);
}
void main();
