import { NextResponse } from "next/server";
import { getResumeVersionForDownload } from "@/app/actions/resume";
import { getApplicationById, getProfileRow } from "@/lib/db/queries";
import { compileLatexToPdf } from "@/lib/builder/compile-pdf";
import { DriveClient } from "@/lib/google/drive";
import { getGoogleAuthClient } from "@/lib/google/tokens";

function sanitize(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "_");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; version: string }> },
) {
  const { id, version: versionStr } = await params;
  const version = Number.parseInt(versionStr, 10);
  if (!Number.isFinite(version)) {
    return NextResponse.json({ error: "Invalid version" }, { status: 400 });
  }

  const resumeVersion = await getResumeVersionForDownload(id, version);
  // Three ways to produce the file, in order of cost: the uploaded PDF, a
  // rebuild from the stored LaTeX, or an export of the Doc copy. A version is
  // downloadable if any one of them is available — including after Drive has
  // been disconnected, which the LaTeX rebuild survives.
  if (
    !resumeVersion ||
    (resumeVersion.status !== "ready" &&
      resumeVersion.status !== "upload_failed") ||
    (!resumeVersion.drive_pdf_id &&
      !resumeVersion.latex_content &&
      !resumeVersion.drive_doc_id)
  ) {
    return NextResponse.json({ error: "Resume PDF not found" }, { status: 404 });
  }

  const application = await getApplicationById(id);
  const profile = await getProfileRow();
  const firstName = (profile?.full_name ?? "Resume").split(/\s+/)[0];
  const lastName = (profile?.full_name ?? "").split(/\s+/).slice(-1)[0] ?? "";
  const company = application?.company ?? "Company";
  const role = application?.role ?? "Role";
  const filename = sanitize(
    `${firstName}_${lastName}_Resume_${company}_${role}_v${version}`.replace(/_+/g, "_"),
  );

  let pdf: Buffer | null = null;

  if (resumeVersion.drive_pdf_id) {
    try {
      const auth = await getGoogleAuthClient();
      pdf = await new DriveClient(auth).getFile(resumeVersion.drive_pdf_id);
    } catch (error) {
      console.warn("[resume/pdf] drive fetch failed, rebuilding:", error);
    }
  }

  if (!pdf && resumeVersion.latex_content) {
    try {
      pdf = await compileLatexToPdf(resumeVersion.latex_content);
    } catch (error) {
      console.warn("[resume/pdf] latex rebuild failed:", error);
    }
  }

  if (!pdf && resumeVersion.drive_doc_id) {
    try {
      const auth = await getGoogleAuthClient();
      pdf = await new DriveClient(auth).exportAsPdf(resumeVersion.drive_doc_id);
    } catch (error) {
      console.warn("[resume/pdf] doc export failed:", error);
    }
  }

  if (!pdf) {
    return NextResponse.json(
      { error: "Could not produce the resume PDF. Try again in a moment." },
      { status: 502 },
    );
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, no-store",
    },
  });
}
