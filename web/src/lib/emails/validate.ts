import { z } from "zod";

export const COLD_EMAIL_ROLE_TEMPLATES = [
  "hiring_manager",
  "recruiter",
  "founder",
  "director_product",
  "vp_product",
] as const;

export type ColdEmailRoleTemplate = (typeof COLD_EMAIL_ROLE_TEMPLATES)[number];

export const coldEmailItemSchema = z.object({
  contact_id: z.string().trim().min(1),
  subject: z.string().trim().min(3).max(200),
  body_md: z.string().trim().min(40).max(8000),
});

export const coldEmailBatchSchema = z.object({
  emails: z.array(coldEmailItemSchema).min(1),
});

export type ColdEmailBatch = z.infer<typeof coldEmailBatchSchema>;
export type ColdEmailItem = z.infer<typeof coldEmailItemSchema>;

const PLACEHOLDER_RE =
  /(\{\{[^}]+\}\}|\[(?:COMPANY|NAME|ROLE|YOUR_NAME|JOB_TITLE|INSERT[^\]]*)\])/i;
const ALL_CAPS_BRACKET_RE = /\[[A-Z][A-Z0-9_]{2,}\]/g;

export function findPlaceholders(text: string): string[] {
  const found = new Set<string>();
  const m1 = text.match(PLACEHOLDER_RE);
  if (m1) found.add(m1[0]);
  for (const m of text.matchAll(ALL_CAPS_BRACKET_RE)) {
    found.add(m[0]);
  }
  return [...found];
}

export function firstSentence(body: string): string {
  const trimmed = body.replace(/\s+/g, " ").trim();
  const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/);
  return (match?.[1] ?? trimmed.slice(0, 120)).trim();
}

/** classic Levenshtein distance */
export function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const prev = new Array(t.length + 1);
  const cur = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;

  for (let i = 1; i <= s.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j++) prev[j] = cur[j];
  }
  return prev[t.length];
}

export function markdownToEmailHtml(md: string): string {
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withBreaks = escaped
    .split(/\n{2,}/)
    .map((para) => {
      const inner = para
        .replace(/\n/g, "<br>\n")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>");
      return `<p style="margin:0 0 12px 0;line-height:1.5;">${inner}</p>`;
    })
    .join("\n");

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#202124;">${withBreaks}</div>`;
}

export interface ColdEmailValidationIssue {
  path: string;
  message: string;
}

export function validateColdEmailBatch(
  batch: ColdEmailBatch,
  expectedContactIds: string[],
): {
  ok: boolean;
  issues: ColdEmailValidationIssue[];
  missingContactIds: string[];
  matched: ColdEmailItem[];
} {
  const issues: ColdEmailValidationIssue[] = [];
  const expected = new Set(expectedContactIds);
  const seen = new Set<string>();
  const matched: ColdEmailItem[] = [];

  for (let i = 0; i < batch.emails.length; i++) {
    const item = batch.emails[i];
    const path = `emails[${i}]`;

    if (!expected.has(item.contact_id)) {
      issues.push({
        path: `${path}.contact_id`,
        message: `Unknown contact_id "${item.contact_id}" — must match an input contact.`,
      });
      continue;
    }
    if (seen.has(item.contact_id)) {
      issues.push({
        path: `${path}.contact_id`,
        message: `Duplicate contact_id "${item.contact_id}".`,
      });
      continue;
    }
    seen.add(item.contact_id);

    const placeholders = [
      ...findPlaceholders(item.subject),
      ...findPlaceholders(item.body_md),
    ];
    if (placeholders.length) {
      issues.push({
        path: `${path}.body_md`,
        message: `Unresolved placeholders: ${placeholders.join(", ")}`,
      });
      continue;
    }

    matched.push(item);
  }

  const missingContactIds = expectedContactIds.filter((id) => !seen.has(id));
  if (missingContactIds.length) {
    issues.push({
      path: "emails",
      message: `Missing emails for contact_id(s): ${missingContactIds.join(", ")}`,
    });
  }

  // Opening uniqueness (Levenshtein ≥ 15 between first sentences)
  for (let i = 0; i < matched.length; i++) {
    for (let j = i + 1; j < matched.length; j++) {
      const a = firstSentence(matched[i].body_md);
      const b = firstSentence(matched[j].body_md);
      if (levenshtein(a, b) < 15) {
        issues.push({
          path: `emails[${i}].body_md`,
          message: `Opening sentence is too similar to another email's opening (need distinct personalization). First: "${a.slice(0, 80)}…"`,
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    missingContactIds,
    matched: issues.length === 0 ? matched : matched,
  };
}

export function inferRoleTemplate(
  role: string | null | undefined,
): ColdEmailRoleTemplate {
  const r = (role ?? "").toLowerCase();
  if (/recruiter|talent|people ops|hr\b/.test(r)) return "recruiter";
  if (/founder|co-?founder|ceo|cto/.test(r)) return "founder";
  if (/vp\b|vice president/.test(r) && /product/.test(r)) return "vp_product";
  if (/director/.test(r) && /product/.test(r)) return "director_product";
  if (/hiring manager|head of|engineering manager/.test(r)) {
    return "hiring_manager";
  }
  return "hiring_manager";
}

export function buildColdEmailRepairPrompt(
  issues: ColdEmailValidationIssue[],
  previousResponseSnippet: string,
  missingContactIds?: string[],
): string {
  const lines = issues
    .map((e) => `- ${e.path || "root"}: ${e.message}`)
    .join("\n");

  const missing =
    missingContactIds && missingContactIds.length
      ? `\nAlso include emails for these missing contact_ids: ${missingContactIds.join(", ")}`
      : "";

  return `Your cold-email JSON failed validation:
${lines}${missing}

Regenerate ONLY valid JSON:
{
  "emails": [
    { "contact_id": "string", "subject": "string", "body_md": "string" }
  ]
}

Rules to fix:
- One email per required contact_id; do not invent new IDs.
- First sentence of each body must differ meaningfully (unique personal opener).
- No placeholders like [COMPANY], {{name}}, or YOUR_NAME.
- Keep structure: personalized opening → relevant experience → why company → CTA.
- No sign-off or signature (name, phone, email) — the app appends your profile signature in Gmail drafts.

Previous response (reference):
${previousResponseSnippet.slice(0, 1200)}`;
}
