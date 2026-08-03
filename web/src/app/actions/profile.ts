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
  clearProfileAvatarRow,
  setProfileAvatarRow,
  upsertProfileRow,
} from "@/lib/db/queries";
import { linkedinUrlSchema } from "@/lib/contacts/validate";
import { resumeContentSchema } from "@/lib/resume/fabrication";
import { requireUser } from "@/lib/auth/user";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_AVATAR_BYTES = 750_000;

export interface ProfileInput {
  full_name: string;
  headline?: string;
  location: string;
  preferred_tone?: string;
  phone: string;
  linkedin_url: string;
  github_url?: string;
  portfolio_url?: string;
}

function requireTrimmed(value: string | undefined, label: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

export async function upsertProfile(input: ProfileInput) {
  const full_name = requireTrimmed(input.full_name, "Full name");
  const location = requireTrimmed(input.location, "Location");
  const phone = requireTrimmed(input.phone, "Contact number");
  const linkedinParsed = linkedinUrlSchema.safeParse(input.linkedin_url);
  if (!linkedinParsed.success) {
    throw new Error(
      linkedinParsed.error.issues[0]?.message ?? "Enter a valid LinkedIn URL.",
    );
  }

  const existing = await getProfileRow().catch(() => null);

  await upsertProfileRow({
    full_name,
    headline: input.headline?.trim() || null,
    location,
    timezone: existing?.timezone ?? "Asia/Kolkata",
    preferred_tone: input.preferred_tone?.trim() || null,
    phone,
    linkedin_url: linkedinParsed.data,
    github_url: input.github_url?.trim() || null,
    portfolio_url: input.portfolio_url?.trim() || null,
  });

  await writeAuditLog("profile.upsert", "profiles", "local", {
    full_name,
  });

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function getProfile() {
  return await getProfileRow();
}

export async function uploadProfileAvatar(formData: FormData) {
  await requireUser();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Choose an image to upload." };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return {
      ok: false as const,
      error: "Use a JPEG, PNG, or WebP image.",
    };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return {
      ok: false as const,
      error: "Image is too large after processing. Try a smaller photo.",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await setProfileAvatarRow({
    data: buffer.toString("base64"),
    mime: file.type,
  });

  await writeAuditLog("profile.avatar_upload", "profiles", "local", {
    mime: file.type,
    bytes: buffer.length,
  });

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function removeProfileAvatar() {
  await requireUser();
  await clearProfileAvatarRow();
  await writeAuditLog("profile.avatar_remove", "profiles", "local", {});
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  revalidatePath("/", "layout");
  return { ok: true as const };
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
