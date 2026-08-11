import { cache } from "react";
import { getCurrentUser } from "@/lib/auth/user";
import { dbGet } from "@/lib/db";
import { getProfileRow } from "@/lib/db/queries";
import { getGoogleConnectedState } from "@/lib/google/tokens";
import { profileFieldsComplete } from "@/lib/setup/profile-complete";

export type SetupReadiness = {
  googleConnected: boolean;
  profileDone: boolean;
  masterResumeDone: boolean;
  /** Ready to use Dashboard + Apply */
  setupReady: boolean;
};

/** Cheap setup check by user id (login landing) — no session / React cache needed. */
export async function isSetupReadyForUserId(userId: string): Promise<boolean> {
  const [profile, resumeFlag, google] = await Promise.all([
    dbGet<{
      full_name: string | null;
      location: string | null;
      phone: string | null;
      linkedin_url: string | null;
    }>(
      `SELECT full_name, location, phone, linkedin_url
         FROM profiles WHERE user_id = ?`,
      userId,
    ).catch(() => null),
    dbGet<{ resume_done: boolean }>(
      `SELECT CASE
                WHEN content IS NULL THEN false
                WHEN octet_length(content) <= 2 THEN false
                WHEN left(content, 8) IN ('{}', 'null', '') THEN false
                ELSE true
              END AS resume_done
         FROM master_resume
        WHERE user_id = ?`,
      userId,
    ).catch(() => undefined),
    dbGet<{ status: string }>(
      `SELECT status FROM google_tokens WHERE user_id = ?`,
      userId,
    ).catch(() => null),
  ]);

  const profileDone = profileFieldsComplete({
    full_name: profile?.full_name,
    location: profile?.location,
    phone: profile?.phone,
    linkedin_url: profile?.linkedin_url,
  });
  const masterResumeDone = Boolean(resumeFlag?.resume_done);
  const googleConnected = google?.status === "active";
  return googleConnected && profileDone && masterResumeDone;
}

/**
 * One-time setup gate for paid users:
 * Connect Google + profile (name, location, phone, LinkedIn) + master resume.
 * Onboarding UI order: Google → basics → Doc sync → contact & links.
 */
export const getSetupReadiness = cache(async (): Promise<SetupReadiness> => {
  const user = await getCurrentUser();
  if (!user) {
    return {
      googleConnected: false,
      profileDone: false,
      masterResumeDone: false,
      setupReady: false,
    };
  }

  // Cheap checks only — never pull master_resume.content/doc_layout blobs here.
  const [profile, resumeFlag, googleState] = await Promise.all([
    getProfileRow().catch(() => null),
    dbGet<{ resume_done: boolean }>(
      `SELECT CASE
                WHEN content IS NULL THEN false
                WHEN octet_length(content) <= 2 THEN false
                WHEN left(content, 8) IN ('{}', 'null', '') THEN false
                ELSE true
              END AS resume_done
         FROM master_resume
        WHERE user_id = ?`,
      user.id,
    ).catch(() => undefined),
    getGoogleConnectedState(),
  ]);

  const profileDone = profileFieldsComplete({
    full_name: profile?.full_name,
    location: profile?.location,
    phone: profile?.phone,
    linkedin_url: profile?.linkedin_url,
  });
  const masterResumeDone = Boolean(resumeFlag?.resume_done);
  // Unknown (DB blip) must not look like "not connected" — that locked paid
  // users behind the Connect Google modal after a successful OAuth.
  const googleConnected = googleState !== false;

  return {
    googleConnected,
    profileDone,
    masterResumeDone,
    setupReady: googleConnected && profileDone && masterResumeDone,
  };
});

export {
  SETUP_ALLOWED_PREFIXES,
  setupAllowed,
  setupLockedPath,
} from "@/lib/setup/setup-paths";
