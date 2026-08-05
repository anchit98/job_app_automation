"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { dbRun } from "@/lib/db";
import {
  clearProfileAvatarRow,
  upsertMasterCoverLetterRow,
  upsertMasterResumeRow,
  upsertProfileRow,
} from "@/lib/db/queries";
import { requireUser, requireAdmin, ensureUserProfile } from "@/lib/auth/user";
import {
  ANCHIT_BULLET_LAYOUT,
  BULLET_LAYOUT_VERSION,
  getDefaultMasterResumeRules,
} from "@/lib/resume/bullet-layout";

export async function markSetupConsoleDone() {
  const user = await requireAdmin();
  await ensureUserProfile(user.id, user.full_name);
  await dbRun(
    `UPDATE profiles
     SET setup_console_done_at = (NOW() AT TIME ZONE 'utc')::text,
         updated_at = (NOW() AT TIME ZONE 'utc')::text
     WHERE user_id = ?`,
    user.id,
  );
  // Client already updates local state; avoid full RSC refresh.
  return { ok: true as const };
}

export async function clearSetupConsoleDone() {
  const user = await requireAdmin();
  await dbRun(
    `UPDATE profiles
     SET setup_console_done_at = NULL,
         updated_at = (NOW() AT TIME ZONE 'utc')::text
     WHERE user_id = ?`,
    user.id,
  );
  return { ok: true as const };
}

export async function setSetupGuideCollapsed(collapsed: boolean) {
  const user = await requireUser();
  await dbRun(
    `UPDATE profiles
     SET setup_guide_collapsed = ?,
         updated_at = (NOW() AT TIME ZONE 'utc')::text
     WHERE user_id = ?`,
    collapsed,
    user.id,
  );
  // Instant UI via client state - no dashboard revalidate.
  return { ok: true as const };
}

function revalidateSetupPaths() {
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
}

/** Clear profile text fields + avatar (keeps timezone / setup flags). */
export async function resetSetupProfile() {
  const user = await requireUser();
  await ensureUserProfile(user.id, user.full_name);
  await upsertProfileRow({
    full_name: "",
    headline: null,
    location: null,
    phone: null,
    linkedin_url: null,
    github_url: null,
    portfolio_url: null,
    preferred_tone: null,
  });
  await clearProfileAvatarRow();
  await writeAuditLog("setup.profile_reset", "profiles", user.id);
  revalidateSetupPaths();
  return { ok: true as const };
}

/** Clear synced master resume content and Doc link. */
export async function resetSetupMasterResume() {
  const user = await requireUser();
  await upsertMasterResumeRow({
    content: {},
    rules: {
      ...getDefaultMasterResumeRules(),
      never_fabricate: true,
      bullet_layout_locked: true,
      bullet_layout_version: BULLET_LAYOUT_VERSION,
      bullet_layout: ANCHIT_BULLET_LAYOUT,
    },
    doc_id: null,
    doc_layout: null,
    doc_synced_at: null,
  });
  await writeAuditLog("setup.master_resume_reset", "master_resume", user.id);
  revalidateSetupPaths();
  return { ok: true as const };
}

/** Clear synced cover letter Doc link / layout. */
export async function resetSetupCoverLetter() {
  const user = await requireUser();
  await upsertMasterCoverLetterRow({
    doc_id: null,
    doc_layout: null,
    doc_synced_at: null,
  });
  await writeAuditLog(
    "setup.master_cover_letter_reset",
    "master_cover_letter",
    user.id,
  );
  revalidateSetupPaths();
  return { ok: true as const };
}

/** Reset profile + resume + cover letter setup values. */
export async function resetSetupAll() {
  await resetSetupProfile();
  await resetSetupMasterResume();
  await resetSetupCoverLetter();
  return { ok: true as const };
}
