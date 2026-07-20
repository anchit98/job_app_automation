export function sanitizeDriveFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function buildResumePdfFilename(
  fullName: string,
  company: string | null,
  role: string | null,
  version: number,
): string {
  const first = fullName.split(/\s+/)[0] || "Resume";
  const last = fullName.split(/\s+/).slice(-1)[0] || "";
  const co = (company || "Company").trim();
  const ro = (role || "Role").trim();
  return `${sanitizeDriveFilename(`${first}_${last}_Resume_${co}_${ro}`)}_v${version}.pdf`;
}

export function buildCoverLetterPdfFilename(
  fullName: string,
  company: string | null,
  role: string | null,
  version: number,
): string {
  const first = fullName.split(/\s+/)[0] || "Cover";
  const last = fullName.split(/\s+/).slice(-1)[0] || "";
  const co = (company || "Company").trim();
  const ro = (role || "Role").trim();
  return `${sanitizeDriveFilename(`${first}_${last}_Cover_Letter_${co}_${ro}`)}_v${version}.pdf`;
}
