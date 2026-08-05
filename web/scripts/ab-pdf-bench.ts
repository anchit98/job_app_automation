/**
 * A/B PDF pipeline benchmark on latest applications.
 *
 * A = Google Docs copy → replace → export PDF → write to object-storage-like local file
 *     (skips Drive PDF re-upload; that's the proposed Solution A)
 * B = Server-side PDF (pdf-lib) from the same tailored JSON → local file
 *
 * Usage (from web/): npx tsx scripts/ab-pdf-bench.ts
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DriveClient } from "../src/lib/google/drive";
import {
  DocsClient,
  buildReplaceRequests,
  buildSkillCategoryBoldRequests,
  buildMetricBoldRequests,
  type DocLayoutMap,
  type DocSlot,
} from "../src/lib/google/docs";
import { getGoogleAuthClient } from "../src/lib/google/tokens";
import {
  buildCoverLetterGreeting,
  buildCoverLetterSignoff,
  mapContentToBodyParagraphs,
  type CoverLetterLayoutMap,
} from "../src/lib/cover-letter/master-sync";
import { normalizeCoverLetterContent } from "../src/lib/cover-letter/normalize";
import type { ResumeContent } from "../src/lib/resume/fabrication";
import type { CoverLetterContent } from "../src/lib/cover-letter/validate";

const OUT = path.join(process.cwd(), "..", "bakeoff-out", "ab-pdf-bench");
const APP_LIMIT = 3;

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function resolveSlotReplacement(
  slot: DocSlot,
  tailored: ResumeContent,
): string | null {
  switch (slot.section) {
    case "headline":
      return tailored.headline ?? null;
    case "experience": {
      if (slot.experience_index === undefined || slot.bullet_index === undefined)
        return null;
      return (
        tailored.experience[slot.experience_index]?.bullets[slot.bullet_index] ??
        null
      );
    }
    case "project": {
      if (slot.project_index === undefined || slot.bullet_index === undefined)
        return null;
      return (
        tailored.projects[slot.project_index]?.bullets[slot.bullet_index] ?? null
      );
    }
    case "skill":
      if (slot.skill_index === undefined) return null;
      return tailored.skills[slot.skill_index] ?? null;
    default:
      return null;
  }
}

async function timed<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ ms: number; value: T }> {
  const t0 = Date.now();
  const value = await fn();
  const ms = Date.now() - t0;
  console.log(`  ${label}: ${ms}ms`);
  return { ms, value };
}

/** Solution B: structured PDF from JSON (not Docs-fidelity; speed test). */
async function renderResumePdfServer(
  fullName: string,
  company: string | null,
  role: string | null,
  content: ResumeContent,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]);
  let y = 760;
  const left = 48;
  const width = 516;
  const size = 9;
  const lineGap = 12;

  const draw = (text: string, opts?: { bold?: boolean; size?: number }) => {
    const f = opts?.bold ? bold : font;
    const s = opts?.size ?? size;
    const lines = wrapText(text, f, s, width);
    for (const line of lines) {
      if (y < 48) {
        page = doc.addPage([612, 792]);
        y = 760;
      }
      page.drawText(line, {
        x: left,
        y,
        size: s,
        font: f,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= lineGap;
    }
  };

  draw(fullName, { bold: true, size: 14 });
  y -= 4;
  if (content.headline) draw(content.headline, { bold: true });
  draw(`Target: ${role ?? "Role"} @ ${company ?? "Company"}`);
  y -= 6;

  if (content.experience?.length) {
    draw("EXPERIENCE", { bold: true, size: 10 });
    y -= 2;
    for (const exp of content.experience) {
      draw(
        `${exp.title ?? ""} — ${exp.company ?? ""} (${exp.start_date ?? ""}–${exp.end_date ?? "Present"})`,
        { bold: true },
      );
      for (const b of exp.bullets ?? []) draw(`• ${b}`);
      y -= 4;
    }
  }

  if (content.projects?.length) {
    draw("PROJECTS", { bold: true, size: 10 });
    y -= 2;
    for (const p of content.projects) {
      draw(p.name ?? "Project", { bold: true });
      for (const b of p.bullets ?? []) draw(`• ${b}`);
      y -= 4;
    }
  }

  if (content.skills?.length) {
    draw("SKILLS", { bold: true, size: 10 });
    y -= 2;
    for (const s of content.skills) draw(s);
  }

  return Buffer.from(await doc.save());
}

async function renderCoverPdfServer(
  fullName: string,
  company: string | null,
  content: CoverLetterContent,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  let y = 740;
  const left = 54;
  const width = 504;

  const draw = (text: string, isBold = false) => {
    const f = isBold ? bold : font;
    for (const line of wrapText(text, f, 11, width)) {
      page.drawText(line, { x: left, y, size: 11, font: f, color: rgb(0.1, 0.1, 0.1) });
      y -= 16;
    }
    y -= 8;
  };

  const normalized = normalizeCoverLetterContent(content);
  draw(`Dear Hiring Team at ${company ?? "the company"},`, false);
  if (normalized.opening_hook) draw(normalized.opening_hook);
  if (normalized.why_this_role) draw(normalized.why_this_role);
  for (const p of normalized.evidence_points ?? []) draw(p);
  if (normalized.why_this_company) draw(normalized.why_this_company);
  if (normalized.cta) draw(normalized.cta);
  draw(`Best regards,\n${fullName}`);

  return Buffer.from(await doc.save());
}

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  if (!words[0]) return [""];
  const lines: string[] = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = `${cur} ${words[i]}`;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) cur = next;
    else {
      lines.push(cur);
      cur = words[i];
    }
  }
  lines.push(cur);
  return lines;
}

type RowResult = {
  app: string;
  kind: "resume" | "cover_letter";
  a_docs_ms: number;
  a_store_ms: number;
  a_total_ms: number;
  a_bytes: number;
  b_render_ms: number;
  b_store_ms: number;
  b_total_ms: number;
  b_bytes: number;
  winner: "A" | "B";
  speedup: number;
};

async function main() {
  loadEnvLocal();
  fs.mkdirSync(OUT, { recursive: true });

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const apps = await sql`
    SELECT a.id, a.company, a.role, a.user_id, a.created_at
    FROM applications a
    WHERE EXISTS (
      SELECT 1 FROM resume_versions rv
      WHERE rv.application_id = a.id AND rv.status IN ('ready', 'uploading')
    )
    ORDER BY a.created_at DESC
    LIMIT ${APP_LIMIT}
  `;

  if (!apps.length) {
    await sql.end();
    throw new Error("No recent applications with resume versions found.");
  }

  const userId = String(apps[0].user_id);
  const [profile] = await sql`
    SELECT full_name, drive_root_id FROM profiles WHERE user_id = ${userId}
  `;
  const [masterResume] = await sql`
    SELECT doc_id, doc_layout FROM master_resume WHERE user_id = ${userId}
  `;
  const [masterCover] = await sql`
    SELECT doc_id, doc_layout FROM master_cover_letter WHERE user_id = ${userId}
  `;

  if (!profile?.drive_root_id) throw new Error("profiles.drive_root_id missing");
  if (!masterResume?.doc_id || !masterResume.doc_layout) {
    throw new Error("Master resume Doc missing — Solution A needs Google Docs templates");
  }

  const fullName = String(profile.full_name || "Candidate").trim();
  const resumeLayout = (
    typeof masterResume.doc_layout === "string"
      ? JSON.parse(masterResume.doc_layout)
      : masterResume.doc_layout
  ) as DocLayoutMap;
  const coverLayout = masterCover?.doc_layout
    ? ((typeof masterCover.doc_layout === "string"
        ? JSON.parse(masterCover.doc_layout)
        : masterCover.doc_layout) as CoverLetterLayoutMap)
    : null;

  console.log(`User ${userId}`);
  console.log(`Apps: ${apps.map((a) => a.company).join(", ")}`);
  console.log("Auth + Drive…");
  const auth = await getGoogleAuthClient(userId);
  const drive = new DriveClient(auth);
  const docs = new DocsClient(auth);
  const rootId = String(profile.drive_root_id);
  const benchFolder = await drive.ensureFolder("_ab_pdf_bench", rootId);

  const results: RowResult[] = [];

  for (const app of apps) {
    const appId = String(app.id);
    const company = (app.company as string | null) ?? "Company";
    const role = (app.role as string | null) ?? "Role";
    const label = `${company} / ${role}`;
    console.log(`\n======== ${label} ========`);

    const [resumeRow] = await sql`
      SELECT content, version FROM resume_versions
      WHERE application_id = ${appId}
        AND status IN ('ready', 'uploading')
      ORDER BY version DESC
      LIMIT 1
    `;
    const [coverRow] = await sql`
      SELECT content, version FROM cover_letter_versions
      WHERE application_id = ${appId}
        AND status IN ('ready', 'uploading')
      ORDER BY version DESC
      LIMIT 1
    `;

    if (!resumeRow?.content) {
      console.log("  skip — no resume content");
      continue;
    }

    const tailored =
      typeof resumeRow.content === "string"
        ? (JSON.parse(resumeRow.content) as ResumeContent)
        : (resumeRow.content as ResumeContent);

    // --- A: Docs → PDF buffer → local store (no Drive PDF re-upload) ---
    console.log(">>> A resume (Docs export → storage)");
    const resumeBase = sanitizeFilename(
      `${fullName.split(/\s+/)[0]}_${company}_Resume_ab`,
    );
    const aResume = await timed("A docs copy+replace+export", async () => {
      const docId = await drive.copyFile(
        String(masterResume.doc_id),
        `${resumeBase}_v${resumeRow.version}_A`,
        benchFolder,
      );
      const edits = resumeLayout.slots
        .map((slot) => {
          const replacement = resolveSlotReplacement(slot, tailored);
          if (replacement == null) return null;
          if (replacement.trim() === slot.original.trim()) return null;
          return { original: slot.original, replacement };
        })
        .filter(Boolean) as Array<{ original: string; replacement: string }>;
      await docs.batchUpdate(docId, buildReplaceRequests(edits));
      const after = await docs.getDocument(docId);
      await docs.batchUpdate(
        docId,
        buildSkillCategoryBoldRequests(after, tailored.skills ?? []),
      );
      return drive.exportAsPdf(docId);
    });
    const aResumeStore = await timed("A storage write", async () => {
      const p = path.join(OUT, `${sanitizeFilename(company)}__resume__A.pdf`);
      fs.writeFileSync(p, aResume.value);
      return p;
    });

    // --- B: server PDF ---
    console.log(">>> B resume (server pdf-lib → storage)");
    const bResume = await timed("B render", () =>
      renderResumePdfServer(fullName, company, role, tailored),
    );
    const bResumeStore = await timed("B storage write", async () => {
      const p = path.join(OUT, `${sanitizeFilename(company)}__resume__B.pdf`);
      fs.writeFileSync(p, bResume.value);
      return p;
    });

    const aResumeTotal = aResume.ms + aResumeStore.ms;
    const bResumeTotal = bResume.ms + bResumeStore.ms;
    results.push({
      app: label,
      kind: "resume",
      a_docs_ms: aResume.ms,
      a_store_ms: aResumeStore.ms,
      a_total_ms: aResumeTotal,
      a_bytes: aResume.value.length,
      b_render_ms: bResume.ms,
      b_store_ms: bResumeStore.ms,
      b_total_ms: bResumeTotal,
      b_bytes: bResume.value.length,
      winner: aResumeTotal <= bResumeTotal ? "A" : "B",
      speedup:
        Math.max(aResumeTotal, bResumeTotal) /
        Math.max(1, Math.min(aResumeTotal, bResumeTotal)),
    });

    if (coverRow?.content && coverLayout && masterCover?.doc_id) {
      const coverContent =
        typeof coverRow.content === "string"
          ? (JSON.parse(coverRow.content) as CoverLetterContent)
          : (coverRow.content as CoverLetterContent);

      console.log(">>> A cover (Docs export → storage)");
      const coverBase = sanitizeFilename(
        `${fullName.split(/\s+/)[0]}_${company}_Cover_ab`,
      );
      const aCover = await timed("A docs copy+replace+export", async () => {
        const docId = await drive.copyFile(
          String(masterCover.doc_id),
          `${coverBase}_v${coverRow.version}_A`,
          benchFolder,
        );
        const normalized = normalizeCoverLetterContent(coverContent);
        const bodyParagraphs = mapContentToBodyParagraphs(normalized);
        const greeting = buildCoverLetterGreeting(
          company,
          coverLayout.greeting.original,
        );
        const signoff = buildCoverLetterSignoff(
          fullName,
          coverLayout.signoff.original,
        );
        const edits = [
          { original: coverLayout.greeting.original, replacement: greeting },
          ...coverLayout.body_slots.map((slot, i) => ({
            original: slot.original,
            replacement: bodyParagraphs[i] ?? "",
          })),
          { original: coverLayout.signoff.original, replacement: signoff },
        ];
        if (coverLayout.signoff.name_original?.trim()) {
          edits.push({
            original: coverLayout.signoff.name_original,
            replacement: fullName,
          });
        }
        await docs.batchUpdate(docId, buildReplaceRequests(edits));
        const after = await docs.getDocument(docId);
        const boldReqs = buildMetricBoldRequests(after);
        if (boldReqs.length) await docs.batchUpdate(docId, boldReqs);
        return drive.exportAsPdf(docId);
      });
      const aCoverStore = await timed("A storage write", async () => {
        const p = path.join(OUT, `${sanitizeFilename(company)}__cover__A.pdf`);
        fs.writeFileSync(p, aCover.value);
        return p;
      });

      console.log(">>> B cover (server pdf-lib → storage)");
      const bCover = await timed("B render", () =>
        renderCoverPdfServer(fullName, company, coverContent),
      );
      const bCoverStore = await timed("B storage write", async () => {
        const p = path.join(OUT, `${sanitizeFilename(company)}__cover__B.pdf`);
        fs.writeFileSync(p, bCover.value);
        return p;
      });

      const aCoverTotal = aCover.ms + aCoverStore.ms;
      const bCoverTotal = bCover.ms + bCoverStore.ms;
      results.push({
        app: label,
        kind: "cover_letter",
        a_docs_ms: aCover.ms,
        a_store_ms: aCoverStore.ms,
        a_total_ms: aCoverTotal,
        a_bytes: aCover.value.length,
        b_render_ms: bCover.ms,
        b_store_ms: bCoverStore.ms,
        b_total_ms: bCoverTotal,
        b_bytes: bCover.value.length,
        winner: aCoverTotal <= bCoverTotal ? "A" : "B",
        speedup:
          Math.max(aCoverTotal, bCoverTotal) /
          Math.max(1, Math.min(aCoverTotal, bCoverTotal)),
      });
    }
  }

  await sql.end();

  const reportPath = path.join(OUT, "REPORT.json");
  fs.writeFileSync(reportPath, JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2));

  console.log("\n================ SUMMARY ================");
  console.log(
    "kind".padEnd(14) +
      "A_ms".padStart(8) +
      "B_ms".padStart(8) +
      "winner".padStart(8) +
      "  app",
  );
  for (const r of results) {
    console.log(
      `${r.kind.padEnd(14)}${String(r.a_total_ms).padStart(8)}${String(r.b_total_ms).padStart(8)}${r.winner.padStart(8)}  ${r.app}`,
    );
  }

  const aSum = results.reduce((s, r) => s + r.a_total_ms, 0);
  const bSum = results.reduce((s, r) => s + r.b_total_ms, 0);
  const bWins = results.filter((r) => r.winner === "B").length;
  console.log("\nTotal A (Docs→storage):", aSum, "ms");
  console.log("Total B (server→storage):", bSum, "ms");
  console.log(
    `Verdict: ${bSum < aSum ? "B is faster" : "A is faster"} by ${(Math.max(aSum, bSum) / Math.max(1, Math.min(aSum, bSum))).toFixed(1)}x (${bWins}/${results.length} artifacts favor B)`,
  );
  console.log(
    "Note: B is a plain layout for speed — not pixel-matching the Google Doc template.",
  );
  console.log("Wrote", reportPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
