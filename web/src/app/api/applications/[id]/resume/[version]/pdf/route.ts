import { NextResponse } from "next/server";
import { getResumeVersionForDownload } from "@/app/actions/resume";
import { getApplicationById, getProfileRow } from "@/lib/db/queries";
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
  if (!resumeVersion?.drive_pdf_id || resumeVersion.status !== "ready") {
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

  try {
    const auth = await getGoogleAuthClient();
    const drive = new DriveClient(auth);
    const buffer = await drive.getFile(resumeVersion.drive_pdf_id);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
