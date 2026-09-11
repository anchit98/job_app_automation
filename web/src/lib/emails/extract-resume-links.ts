import type { ResumeContent } from "@/lib/resume/fabrication";

export interface ExtractedSignatureFields {
  phone: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/[.,;)\]]+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function extractPhone(contactLine: string | undefined): string | null {
  if (!contactLine?.trim()) return null;
  const labeled = contactLine.match(
    /(?:phone|mobile|contact(?:\s*number)?)\s*:?\s*(\+?\d[\d\s\-().]{8,}\d)/i,
  );
  if (labeled?.[1]) return labeled[1].replace(/\s+/g, "");

  const loose = contactLine.match(/(\+?\d[\d\s\-().]{8,}\d)/);
  return loose?.[1]?.replace(/\s+/g, "") ?? null;
}

/** A label value is only a link when it carries a real domain. */
const DOMAIN_RE =
  /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#][^\s|]*)?$/i;

function parseLabeledValue(line: string, label: string): string | null {
  const pattern = new RegExp(`${label}\\s*:?\\s*([^,]+)`, "i");
  const match = line.match(pattern);
  if (!match?.[1]) return null;
  // Resumes (especially PDF-converted ones) often render the contact row as
  // bare labels — "LinkedIn | GitHub | Portfolio | Noida" — with the real URLs
  // living only in hyperlinks the converter drops. Stop at the next separator
  // and demand an actual domain, otherwise the label run itself gets stored as
  // "https://| GitHub | Portfolio | Noida" and overwrites a good profile link.
  const candidate = match[1]
    .split("|")[0]
    .trim()
    .replace(/[.,;)\]]+$/, "");
  if (!candidate || !DOMAIN_RE.test(candidate)) return null;
  return normalizeUrl(candidate) || null;
}

function classifyUrl(url: string): "linkedin" | "github" | "portfolio" | null {
  if (/linkedin\.com/i.test(url)) return "linkedin";
  if (/github\.com/i.test(url)) return "github";
  return "portfolio";
}

export function extractSignatureFieldsFromResume(
  content: Pick<ResumeContent, "contact_line" | "links_line">,
): ExtractedSignatureFields {
  const result: ExtractedSignatureFields = {
    phone: extractPhone(content.contact_line),
    linkedin_url: null,
    github_url: null,
    portfolio_url: null,
  };

  const linksLine = content.links_line?.trim() ?? "";
  if (!linksLine) return result;

  result.linkedin_url =
    parseLabeledValue(linksLine, "LinkedIn") ??
    parseLabeledValue(linksLine, "linked in");
  result.github_url = parseLabeledValue(linksLine, "GitHub");
  result.portfolio_url =
    parseLabeledValue(linksLine, "Portfolio") ??
    parseLabeledValue(linksLine, "Website") ??
    parseLabeledValue(linksLine, "Online Portfolio");

  // Drop email addresses first — otherwise "name@gmail.com" scans as the
  // domain gmail.com and lands in portfolio_url.
  const scannable = linksLine.replace(/[\w.+-]+@[\w.-]+\.\w+/g, " ");
  const urlMatches = scannable.match(
    /(?:https?:\/\/)?[\w.-]+\.(?:com|app|dev|io|net|vercel\.app)[^\s,)]*/gi,
  );
  if (urlMatches) {
    for (const raw of urlMatches) {
      const url = normalizeUrl(raw);
      const kind = classifyUrl(url);
      if (kind === "linkedin" && !result.linkedin_url) result.linkedin_url = url;
      else if (kind === "github" && !result.github_url) result.github_url = url;
      else if (kind === "portfolio" && !result.portfolio_url) {
        result.portfolio_url = url;
      }
    }
  }

  return result;
}

export function mergeSignatureFields(
  profile: {
    phone?: string | null;
    linkedin_url?: string | null;
    github_url?: string | null;
    portfolio_url?: string | null;
  } | null,
  extracted: ExtractedSignatureFields,
  overwrite = false,
): ExtractedSignatureFields {
  const pick = (profileVal: string | null | undefined, extractedVal: string | null) =>
    overwrite ? (extractedVal ?? profileVal ?? null) : (profileVal ?? extractedVal ?? null);

  return {
    phone: pick(profile?.phone, extracted.phone),
    linkedin_url: pick(profile?.linkedin_url, extracted.linkedin_url),
    github_url: pick(profile?.github_url, extracted.github_url),
    portfolio_url: pick(profile?.portfolio_url, extracted.portfolio_url),
  };
}
