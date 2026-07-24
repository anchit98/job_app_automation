"use server";

import { dbRun } from "@/lib/db";
import { requireUser, ensureUserProfile } from "@/lib/auth/user";

export async function markSetupConsoleDone() {
  const user = await requireUser();
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
  const user = await requireUser();
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
  // Instant UI via client state — no dashboard revalidate.
  return { ok: true as const };
}
