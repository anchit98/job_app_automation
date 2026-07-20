"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startQuickApplyForApplication } from "@/app/actions/pipeline";
import type { Contact } from "@/lib/db/types";

type ContactRow = {
  name: string;
  email: string;
  role: string;
  linkedin_url: string;
};

function fromContacts(contacts: Contact[]): ContactRow[] {
  const rows = contacts
    .filter((c) => c.email?.trim())
    .map((c) => ({
      name: c.name,
      email: c.email!,
      role: c.role ?? "",
      linkedin_url: c.linkedin_url ?? "",
    }));
  return rows.length > 0
    ? rows
    : [{ name: "", email: "", role: "", linkedin_url: "" }];
}

export function QuickApplyExistingButton({
  applicationId,
  contacts,
  compact = false,
}: {
  applicationId: string;
  contacts: Contact[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ContactRow[]>(() => fromContacts(contacts));
  const [emailInstructions, setEmailInstructions] = useState("");

  const hasSavedEmails = useMemo(
    () => contacts.some((c) => Boolean(c.email?.trim())),
    [contacts],
  );

  function start(withContacts?: ContactRow[]) {
    setError(null);
    startTransition(async () => {
      const cleaned = (withContacts ?? rows)
        .map((c) => ({
          name: c.name.trim(),
          email: c.email.trim(),
          role: c.role.trim() || undefined,
          linkedin_url: c.linkedin_url.trim() || undefined,
        }))
        .filter((c) => c.name && c.email);

      const result = await startQuickApplyForApplication({
        applicationId,
        email_instructions: emailInstructions.trim() || undefined,
        // Omit contacts when using saved ones — server loads from DB.
        contacts:
          withContacts === undefined
            ? undefined
            : cleaned.length > 0
              ? cleaned
              : undefined,
      });

      if (!result.ok) {
        if ("needs_contacts" in result && result.needs_contacts) {
          setOpen(true);
          setError(result.error);
          return;
        }
        setError(result.error);
        setOpen(true);
        return;
      }

      router.push(`/pipeline/${result.pipeline_id}`);
    });
  }

  function handleClick() {
    // Prefer saved contacts on the application; modal only if none exist.
    start(hasSavedEmails ? undefined : rows);
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className={
          compact
            ? "text-[12px] font-medium text-primary hover:underline disabled:opacity-50"
            : "li-btn-primary text-[13px] disabled:opacity-50"
        }
      >
        <span className="material-symbols-outlined text-[16px]">
          rocket_launch
        </span>
        {pending ? "Starting…" : "Quick Apply"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg li-card p-5 space-y-4 shadow-[var(--shadow-card)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[18px] font-medium text-on-surface">
                  Quick Apply this application
                </h3>
                <p className="text-[13px] text-on-surface-variant mt-1">
                  Re-runs resume → cover letter → cold emails → Gmail drafts for this
                  role. Confirm contacts with emails below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {rows.map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-outline-variant p-3"
                >
                  <input
                    value={row.name}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, idx) =>
                          idx === i ? { ...r, name: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="Name *"
                    className="rounded-lg border border-outline-variant bg-surface-container-highest px-3 py-2 text-[13px]"
                  />
                  <input
                    value={row.email}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, idx) =>
                          idx === i ? { ...r, email: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="Email *"
                    className="rounded-lg border border-outline-variant bg-surface-container-highest px-3 py-2 text-[13px]"
                  />
                  <input
                    value={row.role}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, idx) =>
                          idx === i ? { ...r, role: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="Role"
                    className="rounded-lg border border-outline-variant bg-surface-container-highest px-3 py-2 text-[13px]"
                  />
                  <input
                    value={row.linkedin_url}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, idx) =>
                          idx === i ? { ...r, linkedin_url: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="LinkedIn URL"
                    className="rounded-lg border border-outline-variant bg-surface-container-highest px-3 py-2 text-[13px]"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="text-[12px] font-medium text-on-surface-variant block mb-1">
                Email instructions (optional)
              </label>
              <textarea
                value={emailInstructions}
                onChange={(e) => setEmailInstructions(e.target.value)}
                placeholder="Anything specific to mention in cold emails…"
                rows={3}
                className="w-full rounded-lg border border-outline-variant bg-surface-container-highest px-3 py-2 text-[13px] resize-none"
              />
            </div>

            <button
              type="button"
              className="text-[13px] text-primary hover:underline"
              onClick={() =>
                setRows((prev) => [
                  ...prev,
                  { name: "", email: "", role: "", linkedin_url: "" },
                ])
              }
            >
              + Add contact
            </button>

            {error && (
              <p className="text-[13px] text-error-container bg-error-container/20 rounded-lg p-3">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-4 py-2 text-[13px] text-on-surface-variant"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(rows)}
                className="bg-primary text-on-primary rounded-full px-5 py-2 text-[13px] font-medium disabled:opacity-50"
              >
                {pending ? "Starting…" : "Start Quick Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
