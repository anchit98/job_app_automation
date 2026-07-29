"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  exportResumePrompt,
  getResumeVersionsForApplication,
  retryResumeUpload,
  submitResumeResponse,
} from "@/app/actions/resume";
import { abandonPromptRun } from "@/app/actions/prompts";
import {
  FabricationReview,
  ResumeDiff,
} from "@/components/resume/fabrication-review";
import { resolveStatusAdvance } from "@/lib/applications/status-advance-client";
import { UnifiedPasteModal } from "@/components/paste-flow/unified-paste-modal";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import type { ResumeVersion } from "@/lib/db/types";
import type { FabricationFlag, ResumeContent } from "@/lib/resume/fabrication";

interface ResumeGenerationFlowProps {
  applicationId: string;
  masterResume: ResumeContent;
  initialVersions: ResumeVersion[];
}

export function ResumeGenerationFlow({
  applicationId,
  masterResume,
  initialVersions,
}: ResumeGenerationFlowProps) {
  const router = useRouter();
  const [versions, setVersions] = useState(initialVersions);
  const [promptRunId, setPromptRunId] = useState<string | null>(null);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [editablePrompt, setEditablePrompt] = useState<string | null>(null);
  const [lengthWarning, setLengthWarning] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [rawPaste, setRawPaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [repairPrompt, setRepairPrompt] = useState<string | null>(null);
  const [fabricationFlags, setFabricationFlags] = useState<FabricationFlag[]>([]);
  const [acceptedFlagIds, setAcceptedFlagIds] = useState<string[]>([]);
  const [generatedPreview, setGeneratedPreview] = useState<ResumeContent | null>(null);
  const [pending, startTransition] = useTransition();

  function refreshVersions() {
    startTransition(async () => {
      const data = await getResumeVersionsForApplication(applicationId);
      setVersions(data);
      router.refresh();
    });
  }

  function startGeneration(condensed = false) {
    setError(null);
    setRepairPrompt(null);
    setFabricationFlags([]);
    setAcceptedFlagIds([]);
    setGeneratedPreview(null);
    startTransition(async () => {
      try {
        const result = await exportResumePrompt(applicationId, { condensed });
        setPromptRunId(result.prompt_run_id);
        setPromptText(result.prompt_text);
        setEditablePrompt(result.prompt_text);
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
      setEditablePrompt(null);
    });
  }

  function handleSuccess(
    parsed: unknown,
    meta?: { status_advance?: import("@/lib/applications/auto-status").StatusAdvanceOutcome },
  ) {
    setGeneratedPreview(parsed as ResumeContent);
    setPromptRunId(null);
    setPromptText(null);
    setEditablePrompt(null);
    setPasteOpen(false);
    setRawPaste("");
    setFabricationFlags([]);
    setAcceptedFlagIds([]);
    void resolveStatusAdvance(applicationId, meta?.status_advance, router).then(
      () => refreshVersions(),
    );
  }

  function handleRetryUpload(versionId: string) {
    startTransition(async () => {
      const result = await retryResumeUpload(versionId);
      if (!result.ok) setError(result.error);
      else refreshVersions();
    });
  }

  const activePrompt = editablePrompt ?? promptText ?? "";

  return (
    <div className="space-y-6">
      <div className="bg-surface-container border border-outline-variant rounded-xl p-6">
        <h2 className="text-[16px] font-medium text-on-surface">Resume generation</h2>
        <p className="mt-2 text-[14px] text-on-surface-variant">
          Tailor your master resume to this JD via AI. Each generation creates a
          new versioned PDF + DOCX in Drive.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => startGeneration(false)} disabled={pending} className="rounded-full">
            {pending ? "Preparing…" : "Generate resume"}
          </Button>
          {lengthWarning && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => startGeneration(true)}
              disabled={pending}
              className="rounded-full"
            >
              Generate (condensed)
            </Button>
          )}
        </div>
        {error && (
          <p className="mt-3 rounded-lg bg-error-container p-3 text-[14px] text-on-error-container">
            {error}
          </p>
        )}
      </div>

      <UnifiedPasteModal
        title="Generate tailored resume"
        copyPromptLabel="Copy resume prompt"
        promptRunId={promptRunId || ""}
        promptText={editablePrompt ?? activePrompt}
        lengthWarning={lengthWarning}
        open={Boolean(activePrompt && promptRunId)}
        onClose={handleCancel}
        onSuccess={handleSuccess}
        customSubmit={async (raw, localAcceptedFlags) => {
          return submitResumeResponse(promptRunId!, raw, {
            acceptedFlagIds: localAcceptedFlags,
          });
        }}
      />

      {generatedPreview && (
        <Card>
          <CardTitle>Latest generation preview</CardTitle>
          <div className="mt-4">
            <ResumeDiff master={masterResume} generated={generatedPreview} />
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>Resume versions</CardTitle>
        {versions.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No resume versions yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <div>
                  <span className="font-medium">v{v.version}</span>
                  <span className="ml-2 text-zinc-500">{v.status}</span>
                  <span className="ml-2 text-xs text-zinc-400">
                    {new Date(v.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {v.status === "ready" && (
                    <>
                      <a
                        href={`/api/applications/${applicationId}/resume/${v.version}/pdf`}
                        className="underline"
                      >
                        PDF
                      </a>
                      <a
                        href={`/api/applications/${applicationId}/resume/${v.version}/doc`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Edit in Docs
                      </a>
                      <a
                        href={`/api/applications/${applicationId}/resume/${v.version}/open`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Open PDF
                      </a>
                    </>
                  )}
                  {v.status === "upload_failed" && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleRetryUpload(v.id)}
                      disabled={pending}
                    >
                      Retry upload
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
