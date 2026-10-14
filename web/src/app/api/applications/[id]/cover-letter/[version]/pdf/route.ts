import { NextResponse } from "next/server";
import { getCoverLetterVersionForDownload } from "@/app/actions/cover-letter";
import { compileLatexToPdf } from "@/lib/builder/compile-pdf";
import { getApplicationById, getProfileRow } from "@/lib/db/queries";
import { DriveClient } from "@/lib/google/drive";
import { getGoogleAuthClient } from "@/lib/google/tokens";

function sanitize(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "_");
}

/**
 * Download a cover letter.
 *
 * Drive is a convenience copy, not the source: the LaTeX is stored on the row,
 * so a user who never connected Google — or whose Drive upload failed in the
 * background — still gets their PDF, recompiled on demand. Drive is tried
 * first only because fetching a stored file beats a rebuild.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; version: string }> },
) {
  const { id, version: versionStr } = await params;
  const version = Number.parseInt(versionStr, 10);
  if (!Number.isFinite(version)) {
    return NextResponse.json({ error: "Invalid version" }, { status: 400 });
  }

  const coverLetter = await getCoverLetterVersionForDownload(id, version);
  if (!coverLetter || coverLetter.status !== "ready") {
    return NextResponse.json(
      { error: "Cover letter PDF not found" },
      { status: 404 },
    );
  }

  const application = await getApplicationById(id);
  const profile = await getProfileRow();
  const firstName = (profile?.full_name ?? "Cover").split(/\s+/)[0];
  const lastName = (profile?.full_name ?? "").split(/\s+/).slice(-1)[0] ?? "";
  const company = application?.company ?? "Company";
  const role = application?.role ?? "Role";
  const filename = sanitize(
    `${firstName}_${lastName}_Cover_Letter_${company}_${role}_v${version}`.replace(
      /_+/g,
      "_",
    ),
  );

  let pdf: Buffer | null = null;

  if (coverLetter.drive_pdf_id) {
    try {
      const auth = await getGoogleAuthClient();
      const drive = new DriveClient(auth);
      pdf = await drive.getFile(coverLetter.drive_pdf_id);
    } catch (error) {
      console.warn("[cover-letter/pdf] drive fetch failed, rebuilding:", error);
    }
  }

  if (!pdf) {
    if (!coverLetter.latex_content) {
      return NextResponse.json(
        { error: "This cover letter has no stored source to rebuild from." },
        { status: 410 },
      );
    }
    try {
      pdf = await compileLatexToPdf(coverLetter.latex_content);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not rebuild the PDF.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // `?inline=1` is how /open shows the letter in a tab when there is no Drive
  // copy to link to — same bytes, different disposition.
  const inline = new URL(request.url).searchParams.get("inline") === "1";

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}.pdf"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, no-store",
    },
  });
}
