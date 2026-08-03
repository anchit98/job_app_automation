"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  exportCoverLetterPrompt,
  getCoverLetterVersionsForApplication,
  retryCoverLetterUpload,
  saveCoverLetterEdit,
  submitCoverLetterResponse,
  updateCompanyBlurb,
} from "@/app/actions/cover-letter";
import { abandonPromptRun } from "@/app/actions/prompts";
import { CoverLetterEditor } from "@/components/cover-letter/cover-letter-editor";
import { UnifiedPasteModal } from "@/components/paste-flow/unified-paste-modal";
import { resolveStatusAdvance } from "@/lib/applications/status-advance-client";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { CoverLetterVersion, ResumeVersion } from "@/lib/db/types";
import { formatAppDateTime } from "@/lib/datetime/india";

interface CoverLetterFlowProps {
  applicationId: string;
  initialCompanyBlurb: string | null;
  resumeVersions: ResumeVersion[];
  initialVersions: CoverLetterVersion[];
  coverLetterTemplateReady: boolean;
}

export function CoverLetterFlow({
  applicationId,
  initialCompanyBlurb,
  resumeVersions,
  initialVersions,
  coverLetterTemplateReady,
}: CoverLetterFlowProps) {
  const router = useRouter();
  const readyResumes = resumeVersions.filter((v) => v.status === "ready");
  const [versions, setVersions] = useState(initialVersions);
  const [companyBlurb, setCompanyBlurb] = useState(initialCompanyBlurb ?? "");
  const [selectedResumeVersion, setSelectedResumeVersion] = useState<number>(
    () => readyResumes[0]?.version ?? 0,
  );
  const [exportResumeVersion, setExportResumeVersion] = useState<number | null>(
    null,
  );
  const [promptRunId, setPromptRunId] = useState<string | null>(null);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [lengthWarning, setLengthWarning] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [rawPaste, setRawPaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [repairPrompt, setRepairPrompt] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    { path: string; message: string }[] | null
  >(null);
  const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const [editHtml, setEditHtml] = useState("");
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [pending, startTransition] = useTransition();

  const latestVersion = versions[0] ?? null;
  const hasManualEdit =
    latestVersion != null &&
    (latestVersion.prompt_run_id === null ||
      latestVersion.edited_from_version_id != null);

  function refreshVersions() {
    startTransition(async () => {
      const data = await getCoverLetterVersionsForApplication(applicationId);
      setVersions(data);
      router.refresh();
    });
  }

  function saveBlurb() {
    startTransition(async () => {
      const result = await updateCompanyBlurb(applicationId, companyBlurb);
      if (!result.ok) setError(result.error);
      else setError(null);
    });
  }

  function startGeneration() {
    if (hasManualEdit && !confirmRegenerate) {
      setConfirmRegenerate(true);
      return;
    }
    setConfirmRegenerate(false);
    setError(null);
    setRepairPrompt(null);
    setValidationErrors(null);
    startTransition(async () => {
      try {
        const result = await exportCoverLetterPrompt(applicationId, {
          resumeVersion: selectedResumeVersion || undefined,
        });
        setPromptRunId(result.prompt_run_id);
        setPromptText(result.prompt_text);
        setLengthWarning(result.length_warning);
        setExportResumeVersion(result.resume_version);
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

  function handleSubmitPaste() {
    if (!promptRunId || !rawPaste.trim()) return;
    setError(null);
    setRepairPrompt(null);
    setValidationErrors(null);
    startTransition(async () => {
      const result = await submitCoverLetterResponse(promptRunId, rawPaste, {
        resumeVersion: exportResumeVersion ?? selectedResumeVersion,
      });
      if (!result.ok) {
        setError(result.error);
        if ("repair_prompt" in result && result.repair_prompt) {
          setRepairPrompt(result.repair_prompt);
        }
        if ("validation_errors" in result && result.validation_errors) {
          setValidationErrors(result.validation_errors);
        }
        return;
      }
      setPromptRunId(null);
      setPromptText(null);
      setPasteOpen(false);
      setRawPaste("");
      refreshVersions();
    });
  }

  function startEdit(version: CoverLetterVersion) {
    setEditingVersion(version.version);
    setEditHtml(
      version.content.body_html ||
        version.content.body
          .split(/\n\n+/)
          .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
          .join(""),
    );
    setError(null);
  }

  function handleSaveEdit() {
    if (editingVersion == null) return;
    setError(null);
    startTransition(async () => {
      const result = await saveCoverLetterEdit(
        applicationId,
        editingVersion,
        editHtml,
      );
      if (!result.ok) {
        setError(result.error);
        if ("validation_errors" in result && result.validation_errors) {
          setValidationErrors(result.validation_errors);
        }
        return;
      }
      setEditingVersion(null);
      setEditHtml("");
      refreshVersions();
    });
  }

  function handleRetryUpload(versionId: string) {
    startTransition(async () => {
      const result = await retryCoverLetterUpload(versionId);
      if (!result.ok) setError(result.error);
      else refreshVersions();
    });
  }

  if (!coverLetterTemplateReady) {
    return (
      <Card>
        <CardTitle>Cover letter</CardTitle>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Sync your cover letter Google Doc template first (greeting + 5 body
          paragraphs + sign-off).{" "}
          <Link href="/onboarding" className="underline">
            Go to Onboarding
          </Link>{" "}
          and click &quot;Sync cover letter template&quot;.
        </p>
      </Card>
    );
  }

  if (readyResumes.length === 0) {
    return (
      <Card>
        <CardTitle>Cover letter</CardTitle>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Generate a tailored resume first - the cover letter uses that version as
          evidence.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>Company context (optional)</CardTitle>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Paste a company About-page blurb to strengthen the why-this-company
          paragraph. No web scraping - paste only.
        </p>
        <textarea
          value={companyBlurb}
          onChange={(e) => setCompanyBlurb(e.target.value)}
          placeholder="Paste company mission, values, or recent news…"
          className="mt-3 h-24 w-full rounded-lg border border-zinc-300 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <Button type="button" className="mt-3" variant="secondary" onClick={saveBlurb} disabled={pending}>
          Save blurb
        </Button>
      </Card>

      <Card>
        <CardTitle>Cover letter generation</CardTitle>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Uses your tailored resume + JD via AI. Each generation creates a
          new versioned PDF and DOCX in Drive.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="resume-version">Resume version</Label>
            <select
              id="resume-version"
              value={selectedResumeVersion}
              onChange={(e) =>
                setSelectedResumeVersion(Number.parseInt(e.target.value, 10))
              }
              className="mt-1 block rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {readyResumes.map((v) => (
                <option key={v.id} value={v.version}>
                  v{v.version} · {formatAppDateTime(v.created_at)}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" onClick={startGeneration} disabled={pending}>
            {pending ? "Preparing…" : "Generate cover letter"}
          </Button>
        </div>

        {confirmRegenerate && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
            <p>
              The latest cover letter (v{latestVersion?.version}) was manually
              edited. Regenerating will not overwrite it - a new version will be
              created. Continue?
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="px-4 py-1.5 text-sm bg-primary text-on-primary rounded-full hover:opacity-90 transition-opacity" onClick={startGeneration}>
                Continue
              </button>
              <button
                type="button"
                className="px-4 py-1.5 text-sm text-primary hover:bg-surface-container-high rounded-full transition-colors"
                onClick={() => setConfirmRegenerate(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-error-container text-on-error-container p-3 text-[14px]">
            {error}
          </p>
        )}
        {validationErrors && validationErrors.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-[12px] text-error">
            {validationErrors.map((e) => (
              <li key={`${e.path}-${e.message}`}>
                {e.path}: {e.message}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <UnifiedPasteModal
        title="Generate cover letter"
        copyPromptLabel="Copy cover letter prompt"
        promptRunId={promptRunId || ""}
        promptText={promptText || ""}
        lengthWarning={lengthWarning}
        open={Boolean(promptText && promptRunId)}
        onClose={handleCancel}
        onSuccess={async (_parsed, meta) => {
          setPromptRunId(null);
          setPromptText(null);
          await resolveStatusAdvance(applicationId, meta?.status_advance, router);
          refreshVersions();
        }}
        customSubmit={async (raw) => {
          return submitCoverLetterResponse(promptRunId!, raw, {
            resumeVersion: exportResumeVersion ?? selectedResumeVersion,
          });
        }}
      />

      {editingVersion != null && (
        <Card>
          <CardTitle>Edit cover letter (v{editingVersion})</CardTitle>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Saving creates a new immutable version linked to this edit.
          </p>
          <div className="mt-4">
            <CoverLetterEditor
              initialBody={
                versions.find((v) => v.version === editingVersion)?.content
                  .body ?? ""
              }
              initialHtml={editHtml}
              onChange={setEditHtml}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="button" onClick={handleSaveEdit} disabled={pending}>
              {pending ? "Saving…" : "Save as new version"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditingVersion(null)}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>Cover letter versions</CardTitle>
        {versions.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No cover letters yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {versions.map((v) => (
              <li
                key={v.id}
                className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">v{v.version}</span>
                    <span className="ml-2 text-zinc-500">{v.status}</span>
                    {v.edited_from_version_id && (
                      <span className="ml-2 text-xs text-zinc-400">edited</span>
                    )}
                    {v.resume_version_id && (
                      <span className="ml-2 text-xs text-zinc-400">
                        · resume linked
                      </span>
                    )}
                    <span className="ml-2 text-xs text-zinc-400">
                      {formatAppDateTime(v.created_at)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {v.status === "ready" && (
                      <>
                        <a
                          href={`/api/applications/${applicationId}/cover-letter/${v.version}/pdf`}
                          className="underline"
                        >
                          PDF
                        </a>
                        <a
                          href={`/api/applications/${applicationId}/cover-letter/${v.version}/docx`}
                          className="underline"
                        >
                          DOCX
                        </a>
                        <a
                          href={`/api/applications/${applicationId}/cover-letter/${v.version}/doc`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          Edit in Docs
                        </a>
                        <a
                          href={`/api/applications/${applicationId}/cover-letter/${v.version}/open`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          Open PDF
                        </a>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => startEdit(v)}
                        >
                          Edit
                        </Button>
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
                </div>
                {v.status === "ready" && editingVersion !== v.version && (
                  <p className="mt-2 line-clamp-3 text-xs text-zinc-500">
                    {v.content.body.slice(0, 280)}
                    {v.content.body.length > 280 ? "…" : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
