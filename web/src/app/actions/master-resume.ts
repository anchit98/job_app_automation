"use server";

import { revalidatePath } from "next/cache";
import {
  ANCHIT_BULLET_LAYOUT,
  BULLET_LAYOUT_VERSION,
  getDefaultMasterResumeRules,
} from "@/lib/resume/bullet-layout";
import { writeAuditLog } from "@/lib/audit";
import {
  getMasterResumeRow,
  upsertMasterResumeRow,
} from "@/lib/db/queries";

export interface MasterResumeInput {
  content: Record<string, unknown>;
  rules?: Record<string, unknown>;
}

export async function upsertMasterResume(input: MasterResumeInput) {
  await upsertMasterResumeRow({
    content: input.content,
    rules: {
      ...getDefaultMasterResumeRules(),
      ...input.rules,
      never_fabricate: true,
      bullet_layout_locked: true,
      bullet_layout_version: BULLET_LAYOUT_VERSION,
      bullet_layout: ANCHIT_BULLET_LAYOUT,
    },
  });

  await writeAuditLog("master_resume.upsert", "master_resume", "local");

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function getMasterResume() {
  return await getMasterResumeRow();
}
