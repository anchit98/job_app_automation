"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateFollowUpNow,
  snoozeFollowUp,
  stopFollowUpsForThisApplication,
} from "@/app/actions/follow-ups";
import { FollowUpEmailArtifacts } from "@/components/applications/application-artifacts";
import type { Contact, EmailRecord, FollowUp } from "@/lib/db/types";
import {
  FOLLOW_UP_INTERVAL_DAYS,
  parseDbTimestamp,
} from "@/lib/follow-ups/business-days";
import type { EmailSendPack } from "@/lib/emails/manual-send";

export interface DueFollowUp {
  id: string;
  sequence: 1 | 2;
  due_at: string;
  contact_name: string | null;
}

function describeWhen(ts: number): string {
  const days = Math.round((ts - Date.now()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * The next reminder that is scheduled but has not arrived yet.
 *
 * Sequence 2 is deliberately ignored while it is still `waiting`: it has no due
 * date until #1 is closed, so announcing it would be announcing nothing.
 */
function nextScheduled(followUps: FollowUp[]): number | null {
  const times = followUps
    .filter((f) => f.status === "pending" || f.status === "snoozed")
    .map(
      (f) =>
        parseDbTimestamp(f.snoozed_until)?.getTime() ??
        parseDbTimestamp(f.due_at)?.getTime(),
    )
    .filter((ts): ts is number => ts != null && ts > Date.now());
  return times.length > 0 ? Math.min(...times) : null;
}

/**
 * Follow-up reminders for one application.
 *
 * A reminder is only worth showing if there is something to do about it, so
 * the three controls are the three answers: write it, not yet, never.
 */
export function FollowUpPanel({
  applicationId,
  followUps,
  dueFollowUp,
  emails,
  contacts,
  sendPacks,
}: {
  applicationId: string;
  followUps: FollowUp[];
  dueFollowUp: DueFollowUp | null;
  emails: EmailRecord[];
  contacts: Contact[];
  sendPacks: EmailSendPack[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const hasColdEmail = emails.some((e) => e.kind === "cold");
  const upcoming = nextScheduled(followUps);
  const allStopped =
    hasColdEmail &&
    followUps.length > 0 &&
    followUps.every((f) => f.status === "skipped" || f.status === "sent");
  // Written but not sent: the row leaves the due list the moment a draft
  // exists, so without this the panel would claim nothing is pending while an
  // unsent follow-up sits right below it.
  const awaitingSend = followUps.some(
    (f) => f.status === "enqueued" && f.draft_email_id,
  );

  function run(
    label: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    setError(null);
    setNotice(label);
    startTransition(async () => {
      const result = await action();
      setNotice(null);
      if (!result.ok) {
        setError(result.error ?? `${label} failed.`);
        return;
      }
      setNotice(success);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {!hasColdEmail ? (
        <p className="text-[14px] text-on-surface-variant">
          Follow-up reminders start once a cold email exists for this
          application.
        </p>
      ) : dueFollowUp ? (
        <div className="rounded-xl border border-l-4 border-l-primary border-outline-variant bg-surface-container-low p-4 space-y-3">
          <div>
            <p className="text-[14px] font-semibold text-on-surface">
              Follow-up #{dueFollowUp.sequence} is due
              {dueFollowUp.contact_name ? ` — ${dueFollowUp.contact_name}` : ""}
            </p>
            <p className="text-[12px] text-on-surface-variant mt-0.5">
              Written from the email you already sent, so it reads as a nudge
              rather than a resend.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  "Writing follow-up…",
                  () => generateFollowUpNow(dueFollowUp.id),
                  "Follow-up ready below — copy it into the original thread.",
                )
              }
              className="li-btn-primary text-[13px] disabled:opacity-50"
            >
              {pending ? "Working…" : "Generate"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  "Snoozing…",
                  () => snoozeFollowUp(dueFollowUp.id),
                  `Reminder pushed out ${FOLLOW_UP_INTERVAL_DAYS} days.`,
                )
              }
              className="li-btn-secondary text-[13px] disabled:opacity-50"
            >
              Ignore for {FOLLOW_UP_INTERVAL_DAYS} days
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    "Stop all follow-up reminders for this application?",
                  )
                ) {
                  return;
                }
                run(
                  "Stopping…",
                  () => stopFollowUpsForThisApplication(applicationId),
                  "Follow-up reminders stopped for this application.",
                );
              }}
              className="text-[13px] font-medium text-on-surface-variant hover:text-error disabled:opacity-50"
            >
              Stop reminders
            </button>
          </div>
        </div>
      ) : awaitingSend ? (
        <p className="text-[13px] text-on-surface-variant">
          Follow-up written. Copy it into your original thread, then mark it
          sent — the next reminder is {FOLLOW_UP_INTERVAL_DAYS} days after that.
        </p>
      ) : allStopped ? (
        <p className="text-[13px] text-on-surface-variant">
          Follow-up reminders are stopped for this application.
        </p>
      ) : upcoming ? (
        <p className="text-[13px] text-on-surface-variant">
          Next reminder {describeWhen(upcoming)} — every{" "}
          {FOLLOW_UP_INTERVAL_DAYS} days until you reply or stop it.
        </p>
      ) : (
        <p className="text-[13px] text-on-surface-variant">
          No reminder pending.
        </p>
      )}

      {notice && <p className="text-[12px] text-primary">{notice}</p>}
      {error && <p className="text-[12px] text-error">{error}</p>}

      <FollowUpEmailArtifacts
        emails={emails}
        contacts={contacts}
        sendPacks={sendPacks}
      />
    </div>
  );
}
