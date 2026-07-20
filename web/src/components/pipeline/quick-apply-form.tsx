"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startQuickApplyPipeline } from "@/app/actions/pipeline";

type ContactRow = {
  name: string;
  email: string;
  role: string;
  linkedin_url: string;
};

const emptyContact = (): ContactRow => ({
  name: "",
  email: "",
  role: "",
  linkedin_url: "",
});

export function QuickApplyForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [jd, setJd] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [emailInstructions, setEmailInstructions] = useState("");
  const [contacts, setContacts] = useState<ContactRow[]>([emptyContact()]);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (jd.trim().length < 50) return false;
    return contacts.some((c) => c.name.trim() && c.email.trim());
  }, [jd, contacts]);

  function updateContact(index: number, patch: Partial<ContactRow>) {
    setContacts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const cleaned = contacts
          .map((c) => ({
            name: c.name.trim(),
            email: c.email.trim(),
            role: c.role.trim() || undefined,
            linkedin_url: c.linkedin_url.trim() || undefined,
          }))
          .filter((c) => c.name && c.email);

        if (cleaned.length === 0) {
          setError("Add at least one contact with a name and email.");
          return;
        }

        const result = await startQuickApplyPipeline({
          jd,
          company: company.trim() || undefined,
          role: role.trim() || undefined,
          job_url: jobUrl.trim() || undefined,
          notes: notes.trim() || undefined,
          email_instructions: emailInstructions.trim() || undefined,
          contacts: cleaned,
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        router.push(`/pipeline/${result.pipeline_id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start auto-apply.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* JD takes the left two-thirds */}
        <div className="lg:col-span-7 li-card p-4 space-y-3">
          <div>
            <h2 className="li-section-title">Job description</h2>
            <p className="li-meta mt-1">
              Paste the full JD. Parsing through Gmail drafts run automatically.
            </p>
          </div>
          <textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            rows={5}
            placeholder="Paste the job description here…"
            className="w-full h-[120px] resize-y rounded-lg border border-border-hairline bg-surface p-3 text-[14px] text-on-surface focus:outline-none focus:border-primary"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company (optional)"
              className="rounded-lg border border-border-hairline bg-surface px-3 py-2 text-[14px] focus:border-primary outline-none"
            />
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Role (optional)"
              className="rounded-lg border border-border-hairline bg-surface px-3 py-2 text-[14px] focus:border-primary outline-none"
            />
            <input
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              placeholder="Job URL (optional)"
              className="rounded-lg border border-border-hairline bg-surface px-3 py-2 text-[14px] focus:border-primary outline-none sm:col-span-2"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="rounded-lg border border-border-hairline bg-surface px-3 py-2 text-[14px] focus:border-primary outline-none sm:col-span-2"
            />
            <textarea
              value={emailInstructions}
              onChange={(e) => setEmailInstructions(e.target.value)}
              placeholder="Email instructions (optional) — e.g. mention relocating in July, ask about team structure, keep under 120 words"
              rows={3}
              className="rounded-lg border border-border-hairline bg-surface px-3 py-2 text-[14px] focus:border-primary outline-none sm:col-span-2"
            />
          </div>
        </div>

        {/* Contacts + submit on the right */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="li-card p-4 space-y-3 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="li-section-title">Contacts</h2>
                <p className="li-meta mt-1">Name + email required.</p>
              </div>
              <button
                type="button"
                onClick={() => setContacts((prev) => [...prev, emptyContact()])}
                className="li-btn-ghost text-[13px] text-primary"
              >
                + Add
              </button>
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {contacts.map((c, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-border-muted p-3 bg-canvas/50"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={c.name}
                      onChange={(e) => updateContact(i, { name: e.target.value })}
                      placeholder="Full name *"
                      className="rounded-lg border border-border-hairline bg-surface px-3 py-2 text-[13px] focus:border-primary outline-none"
                    />
                    <input
                      value={c.email}
                      onChange={(e) => updateContact(i, { email: e.target.value })}
                      placeholder="Email *"
                      className="rounded-lg border border-border-hairline bg-surface px-3 py-2 text-[13px] focus:border-primary outline-none"
                    />
                    <input
                      value={c.role}
                      onChange={(e) => updateContact(i, { role: e.target.value })}
                      placeholder="Role / title"
                      className="rounded-lg border border-border-hairline bg-surface px-3 py-2 text-[13px] focus:border-primary outline-none"
                    />
                    <input
                      value={c.linkedin_url}
                      onChange={(e) =>
                        updateContact(i, { linkedin_url: e.target.value })
                      }
                      placeholder="LinkedIn URL"
                      className="rounded-lg border border-border-hairline bg-surface px-3 py-2 text-[13px] focus:border-primary outline-none"
                    />
                  </div>
                  {contacts.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setContacts((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="text-[12px] text-on-surface-variant hover:text-error text-left"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-error-container text-on-error-container border border-error/20 p-3 text-[13px]">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={!canSubmit || pending}
            onClick={handleSubmit}
            className="li-btn-primary w-full justify-center disabled:opacity-50"
          >
            {pending ? "Starting pipeline…" : "Start auto-apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
