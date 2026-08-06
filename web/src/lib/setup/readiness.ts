import { cache } from "react";
import { getCurrentUser } from "@/lib/auth/user";
import { dbGet } from "@/lib/db";
import { getProfileRow } from "@/lib/db/queries";
import { isGoogleConnected } from "@/lib/google/tokens";
import { profileFieldsComplete } from "@/lib/setup/profile-complete";

export type SetupReadiness = {
  googleConnected: boolean;
  profileDone: boolean;
  masterResumeDone: boolean;
  /** Ready to use Dashboard + Apply */
  setupReady: boolean;
};

/**
 * One-time setup gate for paid users:
 * Connect Google + profile (name, location, phone, LinkedIn) + master resume.
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
  const [profile, resumeFlag, googleConnected] = await Promise.all([
    getProfileRow().catch(() => null),
    dbGet<{ resume_done: boolean }>(
      `SELECT CASE
                WHEN content IS NULL THEN false
                WHEN btrim(content::text) IN ('', '{}', 'null') THEN false
                ELSE true
              END AS resume_done
         FROM master_resume
        WHERE user_id = ?`,
      user.id,
    ).catch(() => undefined),
    isGoogleConnected().catch(() => false),
  ]);

  const profileDone = profileFieldsComplete({
    full_name: profile?.full_name,
    location: profile?.location,
    phone: profile?.phone,
    linkedin_url: profile?.linkedin_url,
  });
  const masterResumeDone = Boolean(resumeFlag?.resume_done);

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
