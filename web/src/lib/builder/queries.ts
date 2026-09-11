/**
 * Builder profile + CV version storage.
 *
 * Replaces ResumeBuilderV2's Mongo collections (`user_profiles`,
 * `cv_versions`) with Postgres tables keyed by our own `users.id`.
 */
import { randomUUID } from "crypto";
import { dbAll, dbGet, dbRun, parseJson } from "@/lib/db";
import { getRequestUserId } from "@/lib/auth/request-user";
import { requireUser } from "@/lib/auth/user";
import {
  type BuilderProfile,
  type ProfessionalField,
  emptyBuilderProfile,
  isProfessionalField,
} from "@/lib/builder/types";

async function currentUserId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  return getRequestUserId() ?? (await requireUser()).id;
}

export interface BuilderCvVersion extends Record<string, unknown> {
  id: string;
  cv_type: "original" | "tailored";
  professional_field: string | null;
  drive_file_id: string | null;
  drive_pdf_url: string | null;
  synced_to_master_at: string | null;
  parent_version_id: string | null;
  created_at: string;
}

export async function getBuilderProfile(
  userId?: string,
): Promise<BuilderProfile | null> {
  const uid = await currentUserId(userId);
  const row = await dbGet<{ professional_field: string; profile: unknown }>(
    `SELECT professional_field, profile FROM builder_profiles WHERE user_id = ?`,
    uid,
  );
  if (!row) return null;
  const profile = parseJson<BuilderProfile>(
    row.profile as string,
    emptyBuilderProfile(),
  );
  // The column is the source of truth for field — the JSON copy can lag behind
  // when only the field selector was saved.
  profile.professional_field = isProfessionalField(row.professional_field)
    ? row.professional_field
    : "general";
  return profile;
}

export async function upsertBuilderProfile(
  profile: BuilderProfile,
  userId?: string,
): Promise<void> {
  const uid = await currentUserId(userId);
  const field: ProfessionalField = isProfessionalField(profile.professional_field)
    ? profile.professional_field
    : "general";
  await dbRun(
    `INSERT INTO builder_profiles (user_id, professional_field, profile)
     VALUES (?, ?, ?::jsonb)
     ON CONFLICT (user_id) DO UPDATE
       SET professional_field = EXCLUDED.professional_field,
           profile = EXCLUDED.profile,
           updated_at = (NOW() AT TIME ZONE 'utc')::text`,
    uid,
    field,
    JSON.stringify({ ...profile, professional_field: field }),
  );
}

export async function insertBuilderCvVersion(input: {
  cv_type: "original" | "tailored";
  professional_field: string;
  latex_content: string;
  profile_snapshot: BuilderProfile;
  drive_file_id: string | null;
  drive_pdf_url: string | null;
  parent_version_id?: string | null;
  userId?: string;
}): Promise<string> {
  const uid = await currentUserId(input.userId);
  const id = randomUUID();
  await dbRun(
    `INSERT INTO builder_cv_versions
       (id, user_id, cv_type, professional_field, latex_content,
        profile_snapshot, drive_file_id, drive_pdf_url, parent_version_id)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)`,
    id,
    uid,
    input.cv_type,
    input.professional_field,
    input.latex_content,
    JSON.stringify(input.profile_snapshot),
    input.drive_file_id,
    input.drive_pdf_url,
    input.parent_version_id ?? null,
  );
  return id;
}

export async function listBuilderCvVersions(
  userId?: string,
  limit = 25,
): Promise<BuilderCvVersion[]> {
  const uid = await currentUserId(userId);
  return dbAll<BuilderCvVersion>(
    `SELECT id, cv_type, professional_field, drive_file_id, drive_pdf_url,
            synced_to_master_at, parent_version_id, created_at
       FROM builder_cv_versions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ${Number(limit)}`,
    uid,
  );
}

export async function getBuilderCvVersion(
  versionId: string,
  userId?: string,
): Promise<
  | (BuilderCvVersion & {
      latex_content: string | null;
      profile_snapshot: BuilderProfile | null;
    })
  | undefined
> {
  const uid = await currentUserId(userId);
  const row = await dbGet<
    BuilderCvVersion & { latex_content: string | null; profile_snapshot: unknown }
  >(
    `SELECT id, cv_type, professional_field, latex_content, profile_snapshot,
            drive_file_id, drive_pdf_url, synced_to_master_at,
            parent_version_id, created_at
       FROM builder_cv_versions
      WHERE id = ? AND user_id = ?`,
    versionId,
    uid,
  );
  if (!row) return undefined;
  // The driver runs with prepare:false, so jsonb comes back as raw text rather
  // than a parsed object — parseJson handles both shapes.
  return {
    ...row,
    profile_snapshot: row.profile_snapshot
      ? parseJson<BuilderProfile | null>(
          row.profile_snapshot as string,
          null,
        )
      : null,
  };
}

export async function markVersionSyncedToMaster(
  versionId: string,
  userId?: string,
): Promise<void> {
  const uid = await currentUserId(userId);
  await dbRun(
    `UPDATE builder_cv_versions
        SET synced_to_master_at = (NOW() AT TIME ZONE 'utc')::text
      WHERE id = ? AND user_id = ?`,
    versionId,
    uid,
  );
}
