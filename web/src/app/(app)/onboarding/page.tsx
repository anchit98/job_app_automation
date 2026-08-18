import { Suspense } from "react";
import { getProfile, syncSignatureLinksFromResume } from "@/app/actions/profile";
import { getMasterResume } from "@/app/actions/master-resume";
import { getMasterCoverLetter } from "@/app/actions/cover-letter";
import { getCurrentUser } from "@/lib/auth/user";
import { getGoogleConnectedState } from "@/lib/google/tokens";
import { getSetupReadiness } from "@/lib/setup/readiness";
import { listBuilderCvVersions } from "@/lib/builder/queries";
import { OnboardingForms } from "@/components/onboarding/onboarding-forms";
import { GoogleConnectModal } from "@/components/onboarding/google-connect-modal";
import { GoogleOAuthQueryCleaner } from "@/components/onboarding/google-oauth-query-cleaner";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const googleError =
    typeof params.google_error === "string" ? params.google_error : null;
  const justConnected = params.google_connected === "1";

  const [
    profile,
    masterResume,
    masterCoverLetter,
    user,
    googleState,
    readiness,
    builderCvs,
  ] = await Promise.all([
    getProfile().catch(() => null),
    getMasterResume().catch(() => null),
    getMasterCoverLetter().catch(() => null),
    getCurrentUser().catch(() => null),
    getGoogleConnectedState(),
    getSetupReadiness().catch(() => null),
    // Only the newest build is offered — older ones live in /builder, and a
    // list of near-identical CVs here is a choice nobody wants to make.
    listBuilderCvVersions(undefined, 1).catch(() => []),
  ]);

  let resolvedProfile = profile;
  if (
    masterResume?.content &&
    Object.keys(masterResume.content).length > 0 &&
    resolvedProfile?.full_name &&
    (!resolvedProfile.linkedin_url ||
      !resolvedProfile.github_url ||
      !resolvedProfile.portfolio_url)
  ) {
    await syncSignatureLinksFromResume({ overwrite: false }).catch(() => null);
    resolvedProfile = (await getProfile().catch(() => null)) ?? resolvedProfile;
  }

  // Only treat an explicit `false` as disconnected. `null` (DB blip) must not
  // reopen the Connect Google modal for users who already linked.
  const googleConnected = googleState === true || justConnected;
  const askToConnect =
    !justConnected && (googleState === false || Boolean(googleError));
  const setupReady = Boolean(readiness?.setupReady);

  return (
    <div className="space-y-3">
      <Suspense fallback={null}>
        <GoogleOAuthQueryCleaner />
      </Suspense>
      <GoogleConnectModal
        open={askToConnect}
        initialConnected={googleConnected}
        googleError={googleError}
      />

      <OnboardingForms
        profile={resolvedProfile}
        masterResume={masterResume}
        masterCoverLetter={masterCoverLetter}
        latestBuilderCv={builderCvs[0] ?? null}
        isAdmin={Boolean(user?.is_admin)}
        googleConnected={googleConnected || googleState !== false}
        setupReady={setupReady}
        justConnected={justConnected}
        googleError={googleError}
      />
    </div>
  );
}
