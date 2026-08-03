import { cache } from "react";
import { getCurrentUser } from "@/lib/auth/user";
import { getProfileRow, getMasterResumeRow } from "@/lib/db/queries";
import { isGoogleConnected } from "@/lib/google/tokens";
import { profileFieldsComplete } from "@/lib/setup/profile-complete";

export type SetupReadiness = {
  googleConnected: boolean;
  profileDone: boolean;
  masterResumeDone: boolean;
  /** Ready to use Dashboard + Apply */
  setupReady: boolean;
};

function hasMasterResumeContent(
  content: Record<string, unknown> | null | undefined,
): boolean {
  if (!content) return false;
  return Object.keys(content).length > 0;
}

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

  const [profile, resume, googleConnected] = await Promise.all([
    getProfileRow().catch(() => null),
    getMasterResumeRow().catch(() => null),
    isGoogleConnected().catch(() => false),
  ]);

  const profileDone = profileFieldsComplete({
    full_name: profile?.full_name,
    location: profile?.location,
    phone: profile?.phone,
    linkedin_url: profile?.linkedin_url,
  });
  const masterResumeDone = hasMasterResumeContent(
    resume?.content as Record<string, unknown> | null | undefined,
  );

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
