import { getProfile, syncSignatureLinksFromResume } from "@/app/actions/profile";
import { getMasterResume } from "@/app/actions/master-resume";
import { getMasterCoverLetter } from "@/app/actions/cover-letter";
import { OnboardingForms } from "@/components/onboarding/onboarding-forms";
import { loadAnchitMasterResumeDefault } from "@/lib/resume/anchit-default";
import { env } from "@/lib/env";

export default async function OnboardingPage() {
  const [profile, masterResume, masterCoverLetter] = await Promise.all([
    getProfile().catch(() => null),
    getMasterResume().catch(() => null),
    getMasterCoverLetter().catch(() => null),
  ]);

  let resolvedProfile = profile;
  if (
    masterResume?.content &&
    resolvedProfile?.full_name &&
    (!resolvedProfile.linkedin_url ||
      !resolvedProfile.github_url ||
      !resolvedProfile.portfolio_url)
  ) {
    await syncSignatureLinksFromResume({ overwrite: false }).catch(() => null);
    resolvedProfile = (await getProfile().catch(() => null)) ?? resolvedProfile;
  }

  const defaultResumeContent = loadAnchitMasterResumeDefault();

  return (
    <div className="space-y-3">
      <div>
        <h1 className="li-page-title">Profile &amp; master resume</h1>
        <p className="text-[14px] text-on-surface-variant mt-1">
          Master resume and cover letter templates sync from your Google Docs.
        </p>
      </div>
      <OnboardingForms
        profile={resolvedProfile}
        masterResume={masterResume}
        masterCoverLetter={masterCoverLetter}
        defaultResumeContent={defaultResumeContent}
        defaultMasterDocId={env.resumeMasterDocId()}
        defaultCoverLetterDocId={env.coverLetterMasterDocId()}
      />
    </div>
  );
}
