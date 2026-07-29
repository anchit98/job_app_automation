"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { exportJdParsePrompt } from "@/app/actions/applications";
import { abandonPromptRun } from "@/app/actions/prompts";
import { resolveStatusAdvance } from "@/lib/applications/status-advance-client";
import { UnifiedPasteModal } from "@/components/paste-flow/unified-paste-modal";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

interface JdParseFlowProps {
  applicationId: string;
  hasParsed: boolean;
}

export function JdParseFlow({ applicationId, hasParsed }: JdParseFlowProps) {
  const router = useRouter();
  const [promptRunId, setPromptRunId] = useState<string | null>(null);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [lengthWarning, setLengthWarning] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startParse() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await exportJdParsePrompt(applicationId);
        setPromptRunId(result.prompt_run_id);
        setPromptText(result.prompt_text);
        setLengthWarning(result.length_warning);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to export prompt");
      }
    });
  }

  function handleCancel() {
    if (!promptRunId) return;
    startTransition(async () => {
      await abandonPromptRun(promptRunId);
      setPromptRunId(null);
      setPromptText(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-container border border-outline-variant rounded-xl p-6">
        <h2 className="text-[16px] font-medium text-on-surface">Parse job description (optional)</h2>
        <p className="mt-2 text-[14px] text-on-surface-variant">
          Extract structured fields via AI - company, keywords, tech stack, and more.
          {hasParsed && " Re-parsing will overwrite the cached fields (history stays in prompt runs)."}
        </p>
        <button
          type="button"
          className="mt-4 bg-primary text-on-primary text-[14px] font-medium px-6 py-2 rounded-full hover:opacity-90 disabled:opacity-50 transition-colors"
          onClick={startParse}
          disabled={pending}
        >
          {pending ? "Preparing…" : hasParsed ? "Re-parse JD" : "Parse JD"}
        </button>
        {error && (
          <p className="mt-3 rounded-lg bg-error-container p-3 text-[14px] text-on-error-container">
            {error}
          </p>
        )}
      </div>

      <UnifiedPasteModal
        title="Parse Job Description"
        promptRunId={promptRunId || ""}
        promptText={promptText || ""}
        lengthWarning={lengthWarning}
        open={Boolean(promptText && promptRunId)}
        onClose={handleCancel}
        onSuccess={async (_parsed, meta) => {
          setPromptRunId(null);
          setPromptText(null);
          await resolveStatusAdvance(applicationId, meta?.status_advance, router);
          router.refresh();
        }}
      />
    </div>
  );
}
