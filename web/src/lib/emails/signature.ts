export interface EmailSignatureProfile {
  full_name: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
}

const DEFAULT_PHONE = "+91-99109-80793";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkLine(label: string, url: string | null | undefined): string {
  const trimmed = url?.trim();
  if (!trimmed) {
    return `<p style="margin:0;line-height:1.5;">${escapeHtml(label)}:</p>`;
  }
  const safe = escapeHtml(trimmed);
  return `<p style="margin:0;line-height:1.5;">${escapeHtml(label)}: ${safe}</p>`;
}

export function buildEmailSignatureHtml(
  profile: EmailSignatureProfile,
): string {
  const name = profile.full_name?.trim() || "Candidate";
  const phone = profile.phone?.trim() || DEFAULT_PHONE;

  return `
<div style="margin-top:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#202124;">
<p style="margin:0;line-height:1.5;">--</p>
<p style="margin:0;line-height:1.5;">${escapeHtml(name)}</p>
<p style="margin:0;line-height:1.5;">Contact Number: ${escapeHtml(phone)}</p>
${linkLine("LinkedIn", profile.linkedin_url)}
${linkLine("GitHub", profile.github_url)}
${linkLine("Online Portfolio", profile.portfolio_url)}
</div>`;
}

export function appendEmailSignatureHtml(
  bodyHtml: string,
  profile: EmailSignatureProfile,
): string {
  const trimmed = bodyHtml.trim();
  if (!trimmed) return buildEmailSignatureHtml(profile);
  return `${trimmed}\n${buildEmailSignatureHtml(profile)}`;
}
