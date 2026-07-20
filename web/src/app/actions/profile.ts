"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import {
  extractSignatureFieldsFromResume,
  mergeSignatureFields,
} from "@/lib/emails/extract-resume-links";
import {
  getMasterResumeRow,
  getProfileRow,
  upsertProfileRow,
} from "@/lib/db/queries";
import { resumeContentSchema } from "@/lib/resume/fabrication";

export interface ProfileInput {
  full_name: string;
  headline?: string;
  location?: string;
  timezone?: string;
  preferred_tone?: string;
  phone?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
}

export async function upsertProfile(input: ProfileInput) {
  await upsertProfileRow({
    full_name: input.full_name.trim(),
    headline: input.headline?.trim() || null,
    location: input.location?.trim() || null,
    timezone: input.timezone?.trim() || "UTC",
    preferred_tone: input.preferred_tone?.trim() || null,
    phone: input.phone?.trim() || null,
    linkedin_url: input.linkedin_url?.trim() || null,
    github_url: input.github_url?.trim() || null,
    portfolio_url: input.portfolio_url?.trim() || null,
  });

  await writeAuditLog("profile.upsert", "profiles", "local", {
    full_name: input.full_name,
  });

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function getProfile() {
  return await getProfileRow();
}

export async function syncSignatureLinksFromResume(options?: {
  overwrite?: boolean;
}) {
  const profile = await getProfileRow();
  if (!profile?.full_name?.trim()) {
    return {
      ok: false as const,
      error: "Save your full name on the profile first.",
    };
  }

  const master = await getMasterResumeRow();
  if (!master?.content) {
    return { ok: false as const, error: "No master resume found to extract from." };
  }

  const parsed = resumeContentSchema.safeParse(master.content);
  if (!parsed.success) {
    return { ok: false as const, error: "Master resume JSON is invalid." };
  }

  const extracted = extractSignatureFieldsFromResume(parsed.data);
  const merged = mergeSignatureFields(profile, extracted, options?.overwrite);

  await upsertProfileRow({
    full_name: profile.full_name,
    headline: profile.headline,
    location: profile.location,
    timezone: profile.timezone,
    preferred_tone: profile.preferred_tone,
    phone: merged.phone,
    linkedin_url: merged.linkedin_url,
    github_url: merged.github_url,
    portfolio_url: merged.portfolio_url,
  });

  await writeAuditLog("profile.signature_synced", "profiles", "local", {
    extracted,
    merged,
    overwrite: options?.overwrite ?? false,
  });

  revalidatePath("/onboarding");
  revalidatePath("/dashboard");

  return { ok: true as const, fields: merged };
}
