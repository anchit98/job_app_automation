import { ExtensionSettingsPanel } from "@/components/settings/extension-settings-panel";
import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="li-page-title">Settings</h1>
        <p className="text-[14px] text-on-surface-variant mt-1">
          Extension bridge, health, and local ops. Profile &amp; master docs live under{" "}
          <Link href="/onboarding" className="text-primary font-semibold hover:underline">
            Profile
          </Link>
          .
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        <div className="lg:col-span-8">
          <ExtensionSettingsPanel />
        </div>
        <div className="lg:col-span-4 li-card p-4">
          <h2 className="li-section-title">Health</h2>
          <p className="li-meta mt-1">
            Check Google connection, pending prompts, and SQLite status.
          </p>
          <Link
            href="/health"
            className="inline-flex mt-3 text-[13px] font-semibold text-primary hover:underline"
          >
            Open health page →
          </Link>
        </div>
      </div>
    </div>
  );
}
