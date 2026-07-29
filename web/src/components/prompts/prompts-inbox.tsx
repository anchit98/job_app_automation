"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { abandonPromptRun } from "@/app/actions/prompts";
import type { PendingPromptRunItem } from "@/lib/tracker/queries";

const KIND_LABELS: Record<string, string> = {
  jd_parse: "Parse job description",
  resume: "Generate resume",
  cover_letter: "Generate cover letter",
  cold_email: "Generate cold emails",
  email_discovery: "Email discovery",
  follow_up: "Follow-up email",
  hello_world: "Demo prompt",
  repair: "Repair prompt",
};

interface PromptsInboxProps {
  items: PendingPromptRunItem[];
}

export function PromptsInbox({ items }: PromptsInboxProps) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function copyPrompt(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  }

  function abandon(id: string) {
    startTransition(async () => {
      await abandonPromptRun(id);
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface-container p-8 text-center">
        <span className="material-symbols-outlined text-[40px] text-outline-variant">
          inbox
        </span>
        <p className="mt-3 text-[16px] text-on-surface">Inbox is clear</p>
        <p className="text-[13px] text-on-surface-variant mt-1">
          Pending paste-to-GPT tasks appear here after you export a prompt.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const appLabel =
          item.application_company || item.application_role
            ? `${item.application_company ?? "Company"} - ${item.application_role ?? "Role"}`
            : null;
        const href = item.application_id
          ? `/applications/${item.application_id}?tab=emails`
          : item.target_entity_id && item.target_entity === "applications"
            ? `/applications/${item.target_entity_id}`
            : null;

        return (
          <li
            key={item.id}
            className="rounded-xl border border-outline-variant bg-surface-container p-5 space-y-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[15px] font-medium text-on-surface">
                  {KIND_LABELS[item.kind] ?? item.kind}
                </p>
                {appLabel && (
                  <p className="text-[13px] text-on-surface-variant mt-0.5">
                    {appLabel}
                  </p>
                )}
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Exported {new Date(item.exported_at).toLocaleString()}
                </p>
              </div>
              {href && (
                <Link
                  href={href}
                  className="text-[13px] text-primary hover:underline shrink-0"
                >
                  Open application
                </Link>
              )}
            </div>

            <p className="text-[12px] text-on-surface-variant line-clamp-3 font-mono bg-surface-container-high rounded-lg p-3 border border-outline-variant/50">
              {item.prompt_text.slice(0, 280)}
              {item.prompt_text.length > 280 ? "…" : ""}
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyPrompt(item.id, item.prompt_text)}
                className="px-4 py-2 rounded-full bg-primary text-on-primary text-[13px] font-medium"
              >
                {copiedId === item.id ? "Copied!" : "Copy prompt"}
              </button>
              <a
                href="https://chat.openai.com/"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-full border border-outline-variant text-[13px] font-medium hover:bg-surface-container-high"
              >
                Open ChatGPT
              </a>
              <button
                type="button"
                onClick={() => abandon(item.id)}
                disabled={pending}
                className="px-4 py-2 rounded-full text-[13px] text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
