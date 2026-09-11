import { NextResponse } from "next/server";
import { getCoverLetterVersionForDownload } from "@/app/actions/cover-letter";
import { DriveClient } from "@/lib/google/drive";
import { getGoogleAuthClient } from "@/lib/google/tokens";

/**
 * View the cover letter in a tab.
 *
 * Prefers the Drive copy so the file opens where the user's other application
 * files live. Without one — Google not connected, or the background upload
 * failed — it falls back to serving the rebuilt PDF inline, which is a better
 * answer than a 404 for a letter that exists.
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

  const inlineUrl = new URL(
    `/api/applications/${id}/cover-letter/${version}/pdf?inline=1`,
    request.url,
  );

  if (!coverLetter.drive_pdf_id) {
    return NextResponse.redirect(inlineUrl);
  }

  try {
    const auth = await getGoogleAuthClient();
    const drive = new DriveClient(auth);
    const link = await drive.getWebViewLink(coverLetter.drive_pdf_id);
    return NextResponse.redirect(link ?? inlineUrl);
  } catch {
    return NextResponse.redirect(inlineUrl);
  }
}
