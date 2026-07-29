import { z } from "zod";

/** Practical RFC 5322 subset - trims whitespace before validation. */
export const emailAddressSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .regex(
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/,
    "Invalid email address",
  );

export const linkedinUrlSchema = z
  .string()
  .trim()
  .url("Enter a valid LinkedIn URL")
  .refine(
    (url) => /linkedin\.com\/in\//i.test(url),
    "URL must be a LinkedIn profile (linkedin.com/in/...)",
  );

export const mailmeteorValidationStatusSchema = z.enum([
  "Valid",
  "Risky",
  "valid",
  "risky",
]);

export const mailmeteorResultSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  position: z.string().trim().optional().nullable(),
  email: emailAddressSchema,
  validation_status: mailmeteorValidationStatusSchema,
  notes: z.string().trim().optional().nullable(),
});

export type MailmeteorResult = z.infer<typeof mailmeteorResultSchema>;

export const manualContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  role: z.string().trim().optional().nullable(),
  linkedin_url: linkedinUrlSchema.optional().nullable(),
  company_domain: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/,
      "Enter a valid domain (e.g. acme.com)",
    )
    .optional()
    .nullable(),
  email: emailAddressSchema,
  notes: z.string().trim().optional().nullable(),
});

export type ManualContactInput = z.infer<typeof manualContactSchema>;

export const contactIntakeSchema = z.object({
  linkedin_url: linkedinUrlSchema,
  name: z.string().trim().optional().nullable(),
  role: z.string().trim().optional().nullable(),
  company_domain: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/,
      "Enter a valid domain (e.g. acme.com)",
    )
    .optional()
    .nullable(),
});

export type ContactIntake = z.infer<typeof contactIntakeSchema>;

export function mapMailmeteorVerificationStatus(
  status: string,
): "valid" | "risky" {
  return status.toLowerCase() === "risky" ? "risky" : "valid";
}

export function tryParseMailmeteorJson(raw: string): MailmeteorResult | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    const result = mailmeteorResultSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
