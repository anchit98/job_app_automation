import { NextResponse } from "next/server";
import { getResumeVersionForDownload } from "@/app/actions/resume";
import { DriveClient } from "@/lib/google/drive";
import { getGoogleAuthClient } from "@/lib/google/tokens";

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
  if (!resumeVersion?.drive_pdf_id || resumeVersion.status !== "ready") {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  try {
    const auth = await getGoogleAuthClient();
    const drive = new DriveClient(auth);
    const link = await drive.getWebViewLink(resumeVersion.drive_pdf_id);
    if (!link) {
      return NextResponse.json({ error: "Drive link unavailable" }, { status: 404 });
    }
    return NextResponse.redirect(link);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Open failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
