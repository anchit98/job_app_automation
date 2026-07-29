"use client";

import { ExtensionBridgeControls } from "@/components/settings/extension-bridge-controls";

export function ExtensionSettingsPanel() {
  return (
    <div className="li-card p-4 space-y-4">
      <div>
        <h2 className="li-section-title">JobApp Bridge (Chrome extension)</h2>
        <p className="li-meta mt-1">
          Required for auto-apply. Without it, pipelines stop at AI steps.
        </p>
      </div>
      <ExtensionBridgeControls />
    </div>
  );
}
