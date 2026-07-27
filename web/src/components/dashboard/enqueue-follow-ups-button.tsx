"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runEnqueueDueFollowUps } from "@/app/actions/follow-ups";

export function EnqueueFollowUpsButton() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function enqueue() {
    setMessage(null);
    startTransition(async () => {
      const result = await runEnqueueDueFollowUps();
      const parts = [
        `${result.enqueued} of ${result.processed} due follow-up(s) enqueued`,
      ];
      if (result.errors.length > 0) {
        parts.push(`${result.errors.length} skipped or failed`);
      }
      setMessage(parts.join(" · "));
      router.refresh();
    });
  }

  return (
    <div className="li-card p-4 lg:px-5 lg:py-4 shrink-0 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="li-section-title">Follow-ups</h2>
        <p className="li-meta">
          Due follow-ups are normally enqueued by a daily cron (
          <code className="text-[11px]">POST /api/cron/enqueue-follow-up-prompts</code>
          ). Run manually if your machine was off.
        </p>
        {message && <p className="li-meta text-on-surface">{message}</p>}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={enqueue}
        className="li-btn-secondary text-[13px] shrink-0 disabled:opacity-50 justify-center"
      >
        {pending ? "Enqueuing…" : "Enqueue due follow-ups"}
      </button>
    </div>
  );
}
