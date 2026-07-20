"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

interface PasteToGptDrawerProps {
  promptText: string;
  chatgptUrl?: string;
  lengthWarning?: string | null;
  onOpenPasteBack: () => void;
  onCancel?: () => void;
}

export function PasteToGptDrawer({
  promptText,
  chatgptUrl = "https://chat.openai.com/",
  lengthWarning,
  onOpenPasteBack,
  onCancel,
}: PasteToGptDrawerProps) {
  const [copied, setCopied] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);

  async function copyAndOpen() {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
    } catch {
      setCopied(false);
    }

    const win = window.open(chatgptUrl, "_blank", "noopener,noreferrer");
    if (!win) setPopupBlocked(true);
  }

  return (
    <Card className="space-y-4">
      <CardTitle>Paste-to-GPT</CardTitle>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Copy the prompt, run it in ChatGPT, then paste the response back.
      </p>
      {lengthWarning && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {lengthWarning}
        </p>
      )}
      <textarea
        readOnly
        value={promptText}
        className="h-48 w-full rounded-lg border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={copyAndOpen}>
          {copied ? "Copied — Open ChatGPT" : "Copy & Open ChatGPT"}
        </Button>
        <Button type="button" variant="secondary" onClick={onOpenPasteBack}>
          Paste response back
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      {popupBlocked && (
        <p className="text-sm text-amber-700">
          Popup blocked.{" "}
          <a
            href={chatgptUrl}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Open ChatGPT manually
          </a>
          , then paste the prompt from the box above.
        </p>
      )}
    </Card>
  );
}
