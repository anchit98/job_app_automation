"use client";

import { useState, useTransition } from "react";
import { submitPasteBack } from "@/app/actions/prompts";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

interface PasteBackModalProps {
  promptRunId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: (parsed: unknown) => void;
}

export function PasteBackModal({
  promptRunId,
  open,
  onClose,
  onSuccess,
}: PasteBackModalProps) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [repairPrompt, setRepairPrompt] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    { path: string; message: string }[] | null
  >(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function handleSubmit() {
    setError(null);
    setRepairPrompt(null);
    setValidationErrors(null);

    startTransition(async () => {
      const result = await submitPasteBack(promptRunId, raw);
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
      onSuccess(result.parsed);
      setRaw("");
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <CardTitle>Paste AI response</CardTitle>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Paste the full response (JSON with or without code fences).
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='{"greeting": "...", "echo": "..."}'
          className="mt-4 h-56 w-full rounded-lg border border-zinc-300 p-3 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
            {error}
          </p>
        )}
        {validationErrors && validationErrors.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-sm text-red-700">
            {validationErrors.map((e) => (
              <li key={`${e.path}-${e.message}`}>
                {e.path}: {e.message}
              </li>
            ))}
          </ul>
        )}
        {repairPrompt && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">Repair prompt (run in same AI thread):</p>
            <textarea
              readOnly
              value={repairPrompt}
              className="h-32 w-full rounded-lg border border-zinc-300 bg-zinc-50 p-2 font-mono text-xs dark:border-zinc-700"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigator.clipboard.writeText(repairPrompt)}
            >
              Copy repair prompt
            </Button>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Button type="button" onClick={handleSubmit} disabled={pending || !raw.trim()}>
            {pending ? "Validating…" : "Submit"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
