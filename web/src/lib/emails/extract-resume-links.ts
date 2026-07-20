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

function parseLabeledValue(line: string, label: string): string | null {
  const pattern = new RegExp(`${label}\\s*:?\\s*([^,]+)`, "i");
  const match = line.match(pattern);
  if (!match?.[1]) return null;
  const value = normalizeUrl(match[1]);
  return value || null;
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

  const urlMatches = linksLine.match(
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
