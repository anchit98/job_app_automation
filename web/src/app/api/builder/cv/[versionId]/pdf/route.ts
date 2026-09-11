import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { compileLatexToPdf } from "@/lib/builder/compile-pdf";
import { getBuilderCvVersion } from "@/lib/builder/queries";
import { DriveClient } from "@/lib/google/drive";
import { getGoogleAuthClient } from "@/lib/google/tokens";

export const dynamic = "force-dynamic";

function sanitize(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "_");
}

/**
 * Download a generated CV.
 *
 * Drive is a convenience, not a dependency: the LaTeX source is stored with
 * every version, so a user who never connected Google can still download their
 * CV — it is simply recompiled on demand. Drive is used first when available
 * because fetching a stored file is faster than a rebuild.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { versionId } = await params;
  // Scoped by user id inside the query — one user cannot fetch another's CV.
  const version = await getBuilderCvVersion(versionId);
  if (!version) {
    return NextResponse.json({ error: "CV not found" }, { status: 404 });
  }

  const filename = sanitize(
    `${user.full_name || "CV"}_${version.professional_field ?? "cv"}`,
  );

  let pdf: Buffer | null = null;

  if (version.drive_file_id) {
    try {
      const auth = await getGoogleAuthClient();
      const drive = new DriveClient(auth);
      pdf = await drive.getFile(version.drive_file_id);
    } catch (error) {
      // Revoked Google access or a deleted file must not break the download —
      // fall through to a rebuild from the stored LaTeX.
      console.warn("[builder/pdf] drive fetch failed, rebuilding:", error);
    }
  }

  if (!pdf) {
    if (!version.latex_content) {
      return NextResponse.json(
        { error: "This CV has no stored source to rebuild from." },
        { status: 410 },
      );
    }
    try {
      pdf = await compileLatexToPdf(version.latex_content);
    } catch (error) {
      console.error("[builder/pdf] rebuild failed:", error);
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Could not rebuild the PDF.",
        },
        { status: 502 },
      );
    }
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
