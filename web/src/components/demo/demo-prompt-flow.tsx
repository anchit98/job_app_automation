"use client";

import { useState, useTransition } from "react";
import {
  abandonPromptRun,
  exportPrompt,
  getRecentPromptRuns,
} from "@/app/actions/prompts";
import { getProfile } from "@/app/actions/profile";
import { PasteBackModal } from "@/components/paste-flow/paste-back-modal";
import { PasteToGptDrawer } from "@/components/paste-flow/paste-to-gpt-drawer";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { formatAppDateTime } from "@/lib/datetime/india";

export function DemoPromptFlow() {
  const [promptRunId, setPromptRunId] = useState<string | null>(null);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [lengthWarning, setLengthWarning] = useState<string | null>(null);
  const [parsedResult, setParsedResult] = useState<unknown>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof getRecentPromptRuns>>>([]);
  const [pending, startTransition] = useTransition();

  function loadRuns() {
    startTransition(async () => {
      const data = await getRecentPromptRuns(5);
      setRuns(data);
    });
  }

  function startDemo() {
    setError(null);
    setParsedResult(null);
    startTransition(async () => {
      try {
        const profile = await getProfile();
        const name = profile?.full_name?.trim() || "Candidate";
        const result = await exportPrompt("hello_world", { name });
        setPromptRunId(result.prompt_run_id);
        setPromptText(result.prompt_text);
        setLengthWarning(result.length_warning);
        loadRuns();
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
      loadRuns();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>hello_world demo</CardTitle>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Tests the full paste-to-AI round trip. AI should return JSON with{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">greeting</code> and{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">echo</code>.
        </p>
        <Button type="button" className="mt-4" onClick={startDemo} disabled={pending}>
          {pending ? "Preparing…" : "Run demo prompt"}
        </Button>
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950">
            {error}
          </p>
        )}
      </Card>

      {promptText && promptRunId && (
        <PasteToGptDrawer
          promptText={promptText}
          lengthWarning={lengthWarning}
          onOpenPasteBack={() => setPasteOpen(true)}
          onCancel={handleCancel}
        />
      )}

      {parsedResult != null && (
        <Card>
          <CardTitle>Validated response</CardTitle>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-50 p-4 text-xs dark:bg-zinc-900">
            {JSON.stringify(parsedResult, null, 2)}
          </pre>
        </Card>
      )}

      <PasteBackModal
        promptRunId={promptRunId ?? ""}
        open={pasteOpen && Boolean(promptRunId)}
        onClose={() => setPasteOpen(false)}
        onSuccess={(parsed) => {
          setParsedResult(parsed);
          loadRuns();
        }}
      />

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Recent prompt runs</CardTitle>
          <Button type="button" variant="ghost" onClick={loadRuns}>
            Refresh
          </Button>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {runs.length === 0 && (
            <li className="text-zinc-500">No runs yet.</li>
          )}
          {runs.map((run) => (
            <li
              key={run.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
            >
              <span>
                {run.kind} - <span className="font-mono text-xs">{run.status}</span>
              </span>
              <span className="text-xs text-zinc-500">
                {formatAppDateTime(run.exported_at)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
