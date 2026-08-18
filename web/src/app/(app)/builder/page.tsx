import { loadBuilder } from "@/app/actions/builder";
import { getGoogleConnectedState } from "@/lib/google/tokens";
import { BuilderWorkspace } from "@/components/builder/builder-workspace";

export const metadata = { title: "CV Builder · JobApp OS" };

export default async function BuilderPage() {
  const [loaded, googleState] = await Promise.all([
    loadBuilder(),
    getGoogleConnectedState().catch(() => false),
  ]);

  if (!loaded.ok) {
    return (
      <div className="li-card p-6">
        <h1 className="li-section-title mb-2">CV Builder</h1>
        <p className="text-sm text-on-error-container bg-error-container border border-error/20 rounded-lg px-4 py-3">
          {loaded.error}
        </p>
      </div>
    );
  }

  return (
    <BuilderWorkspace
      initialProfile={loaded.profile}
      initialVersions={loaded.versions}
      hasChosenField={loaded.has_profile}
      googleConnected={googleState === true}
    />
  );
}
