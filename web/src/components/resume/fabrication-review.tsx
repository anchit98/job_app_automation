"use client";

import { useState, useTransition } from "react";
import type { FabricationFlag } from "@/lib/resume/fabrication";
import type { ResumeContent } from "@/lib/resume/fabrication";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

interface FabricationReviewProps {
  flags: FabricationFlag[];
  acceptedIds: string[];
  onToggle: (id: string) => void;
}

export function FabricationReview({
  flags,
  acceptedIds,
  onToggle,
}: FabricationReviewProps) {
  return (
    <Card className="border-amber-300 dark:border-amber-800">
      <CardTitle>Review flagged bullets</CardTitle>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Review flagged items before export. Accept rewordings you are comfortable with,
        or run a repair prompt in AI.
      </p>
      <ul className="mt-4 space-y-3">
        {flags.map((flag) => (
          <li
            key={flag.id}
            className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
          >
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={acceptedIds.includes(flag.id)}
                onChange={() => onToggle(flag.id)}
                className="mt-1"
              />
              <span>
                <span className="font-medium text-amber-800 dark:text-amber-200">
                  {flag.reason === "new_metric"
                    ? "New metric"
                    : flag.reason === "missing_jd_keyword"
                      ? "JD keywords"
                      : "Rewording"}
                </span>
                <span className="block text-zinc-600 dark:text-zinc-400">
                  {flag.message}
                </span>
                <span className="mt-1 block">{flag.bullet}</span>
                {flag.suggested_source && (
                  <span className="mt-1 block text-xs text-zinc-500">
                    Closest source: {flag.suggested_source}
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface ResumeDiffProps {
  master: ResumeContent;
  generated: ResumeContent;
}

export function ResumeDiff({ master, generated }: ResumeDiffProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold">Master resume</h3>
        <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
          {JSON.stringify(master, null, 2)}
        </pre>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Generated resume</h3>
        <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
          {JSON.stringify(generated, null, 2)}
        </pre>
      </div>
    </div>
  );
}
