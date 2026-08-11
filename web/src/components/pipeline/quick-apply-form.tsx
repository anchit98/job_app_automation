"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { startQuickApplyPipeline } from "@/app/actions/pipeline";
import type { PipelineLlmEngine } from "@/lib/pipeline/types";

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

function ContactFinderGuide({ company }: { company: string }) {
  const [open, setOpen] = useState(false);
  const trimmed = company.trim();
  const linkedinSearchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
    `${trimmed ? trimmed + " " : ""}recruiter OR talent acquisition`,
  )}`;

  return (
    <div className="rounded-xl border border-primary/15 bg-primary/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-primary">
          <span className="material-symbols-outlined text-[16px]">
            travel_explore
          </span>
          No direct contact? Find one in ~2 min
        </span>
        <span className="material-symbols-outlined text-[18px] text-primary transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          expand_more
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2.5">
          <ol className="space-y-2">
            {[
              {
                icon: "person_search",
                text: (
                  <>
                    Search LinkedIn for{" "}
                    <a
                      href={linkedinSearchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-primary underline underline-offset-2"
                    >
                      recruiters / talent partners
                    </a>{" "}
                    at {trimmed || "the company"}.
                  </>
                ),
              },
              {
                icon: "link",
                text: (
                  <>
                    Copy their profile URL (looks like{" "}
                    <code className="text-[11px] bg-surface px-1 py-0.5 rounded border border-border-hairline">
                      linkedin.com/in/name
                    </code>
                    ).
                  </>
                ),
              },
              {
                icon: "alternate_email",
                text: (
                  <>
                    Paste it into{" "}
                    <a
                      href="https://mailmeteor.com/tools/linkedin-email-finder"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-primary underline underline-offset-2"
                    >
                      Mailmeteor&apos;s email finder
                    </a>{" "}
                    — free, no signup.
                  </>
                ),
              },
              {
                icon: "playlist_add",
                text: <>Add them as contacts above — drafts are written for you.</>,
              },
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] text-on-surface">
                <span className="material-symbols-outlined text-[15px] text-primary mt-0.5 shrink-0">
                  {step.icon}
                </span>
                <span>{step.text}</span>
              </li>
            ))}
          </ol>
          <p className="rounded-lg bg-surface px-2.5 py-2 text-[12px] text-on-surface-variant border border-border-muted">
            <span className="font-semibold text-on-surface">Why bother?</span>{" "}
            A short cold email to someone who can decide or refer you
            strengthens your application beyond just applying on the site.
            Emailing <span className="font-semibold text-on-surface">2–3 people separately</span>{" "}
            works best.
          </p>
        </div>
      )}
    </div>
  );
}

function SectionHeading({
  step,
  title,
  hint,
}: {
  step: number;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[12px] font-bold leading-none text-primary">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="li-section-title leading-6">{title}</h2>
        {hint ? <p className="li-meta mt-0.5">{hint}</p> : null}
      </div>
    </div>
  );
}

export function QuickApplyForm({
  llmEngine = "openai",
  coverLetterSynced = false,
}: {
  llmEngine?: PipelineLlmEngine;
  /** True when a cover letter Google Doc template has been synced in onboarding. */
  coverLetterSynced?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [jd, setJd] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [emailInstructions, setEmailInstructions] = useState("");
  const [includeCoverLetter, setIncludeCoverLetter] = useState(coverLetterSynced);
  const [coverLetterGateHint, setCoverLetterGateHint] = useState<string | null>(
    null,
  );
  const [contacts, setContacts] = useState<ContactRow[]>([emptyContact()]);
  const [error, setError] = useState<string | null>(null);

  const contactCount = useMemo(
    () => contacts.filter((c) => c.name.trim() && c.email.trim()).length,
    [contacts],
  );

  const canSubmit = useMemo(() => jd.trim().length >= 50, [jd]);

  function updateContact(index: number, patch: Partial<ContactRow>) {
    setContacts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  }

  async function handleSubmit() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const cleaned = contacts
        .map((c) => ({
          name: c.name.trim(),
          email: c.email.trim(),
          role: c.role.trim() || undefined,
          linkedin_url: c.linkedin_url.trim() || undefined,
        }))
        .filter((c) => c.name && c.email);

      const result = await startQuickApplyPipeline({
        jd,
        job_url: jobUrl.trim() || undefined,
        notes: notes.trim() || undefined,
        email_instructions: emailInstructions.trim() || undefined,
        contacts: cleaned,
        skip_cover_letter: !includeCoverLetter,
        llm_engine: llmEngine,
      });

      if (!result.ok) {
        setError(result.error);
        setPending(false);
        return;
      }

      // Navigate immediately — pipeline page starts work; don't wait on alerts.
      if ("queued" in result && result.queued && result.warning) {
        // Soft notice on the pipeline page via query is nicer than blocking alert.
        router.push(
          `/pipeline/${result.pipeline_id}?queued=1`,
        );
        return;
      }

      router.push(`/pipeline/${result.pipeline_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start auto-apply.");
      setPending(false);
    }
  }

  const pipelineSummary = useMemo(() => {
    const steps = ["Parse JD", "Resume"];
    if (includeCoverLetter) steps.push("Cover letter");
    if (contactCount > 0) steps.push("Cold emails", "Gmail drafts");
    return steps;
  }, [includeCoverLetter, contactCount]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:items-stretch">
        {/* JD — stretch to match Contacts + This run will */}
        <div className="lg:col-span-7 li-card p-4 flex flex-col gap-4 lg:h-full min-h-0">
          <SectionHeading
            step={1}
            title="Job description"
          />
          <textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            rows={7}
            placeholder="Paste the full job description here…"
            className="w-full min-h-[160px] flex-1 resize-y rounded-xl border border-border-hairline bg-surface p-3 text-[14px] text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-shadow"
          />
          <div className="flex items-center justify-between text-[11.5px] text-on-surface-variant -mt-2 px-0.5">
            <span>
              {jd.trim().length < 50
                ? `Paste at least 50 characters (${jd.trim().length}/50)`
                : `${jd.trim().length.toLocaleString()} characters`}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <input
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              placeholder="Job URL (optional)"
              className="rounded-xl border border-border-hairline bg-surface px-3 py-2 text-[14px] focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition-shadow"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="rounded-xl border border-border-hairline bg-surface px-3 py-2 text-[14px] focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition-shadow"
            />
          </div>

          <label className="mt-auto flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-muted bg-surface-container-low px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-on-surface">
                Cover letter needed?
              </div>
              <p className="text-[12px] text-on-surface-variant mt-0.5">
                {!coverLetterSynced
                  ? "Requires a synced cover letter template from Onboarding."
                  : includeCoverLetter
                    ? "A tailored cover letter PDF will be generated."
                    : "Cover letter stage will be skipped — faster pipeline."}
              </p>
              {coverLetterGateHint ? (
                <p
                  role="alert"
                  className="mt-1.5 text-[12px] font-medium text-error"
                >
                  {coverLetterGateHint}
                </p>
              ) : null}
            </div>
            <div className="relative shrink-0">
              <select
                value={includeCoverLetter ? "yes" : "no"}
                onChange={(e) => {
                  const wantYes = e.target.value === "yes";
                  if (wantYes && !coverLetterSynced) {
                    setIncludeCoverLetter(false);
                    setCoverLetterGateHint(
                      "Cannot enable cover letter — no cover letter template has been synced. Sync one from Onboarding first.",
                    );
                    return;
                  }
                  setCoverLetterGateHint(null);
                  setIncludeCoverLetter(wantYes);
                }}
                aria-label="Cover letter needed"
                className="appearance-none cursor-pointer rounded-lg border border-border-hairline bg-surface pl-3 pr-9 py-2 text-[13px] font-semibold text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              <span
                className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-on-surface-variant"
                aria-hidden
              >
                <span className="material-symbols-outlined text-[18px] leading-none">
                  expand_more
                </span>
              </span>
            </div>
          </label>
        </div>

        {/* Contacts + This run will — shared height with JD card */}
        <div className="lg:col-span-5 flex flex-col gap-3 lg:h-full min-h-0">
          <div className="li-card p-4 space-y-3 flex-1 flex flex-col min-h-0">
            <div className="flex items-start justify-between gap-3">
              <SectionHeading
                step={2}
                title="Contacts"
              />
              <button
                type="button"
                onClick={() => setContacts((prev) => [...prev, emptyContact()])}
                className="li-btn-ghost h-6 shrink-0 self-start text-[13px] leading-6 text-primary"
              >
                + Add
              </button>
            </div>

            <ContactFinderGuide company="" />

            <div className="space-y-2 flex-1 min-h-0 max-h-[240px] overflow-y-auto pr-1">
              {contacts.map((c, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 gap-2 rounded-xl border border-border-muted p-3 bg-canvas/50"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={c.name}
                      onChange={(e) => updateContact(i, { name: e.target.value })}
                      placeholder="Full name"
                      className="rounded-lg border border-border-hairline bg-surface px-3 py-2 text-[13px] focus:border-primary outline-none"
                    />
                    <input
                      value={c.email}
                      onChange={(e) => updateContact(i, { email: e.target.value })}
                      placeholder="Email"
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
                  <button
                    type="button"
                    onClick={() =>
                      setContacts((prev) =>
                        prev.length === 1
                          ? [emptyContact()]
                          : prev.filter((_, idx) => idx !== i),
                      )
                    }
                    className="text-[12px] text-on-surface-variant hover:text-error text-left"
                  >
                    Clear
                  </button>
                </div>
              ))}
            </div>

            <textarea
              value={emailInstructions}
              onChange={(e) => setEmailInstructions(e.target.value)}
              placeholder="Email instructions (optional) - e.g. mention relocating in July, keep under 120 words"
              rows={2}
              className="w-full rounded-xl border border-border-hairline bg-surface px-3 py-2 text-[13px] focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition-shadow"
            />
          </div>

          <div className="li-card p-4 space-y-2 shrink-0">
            <h3 className="text-[13px] font-semibold text-on-surface">
              This run will:
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {pipelineSummary.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/8 border border-primary/15 px-2.5 py-1 text-[12px] font-medium text-primary"
                >
                  <span className="material-symbols-outlined text-[13px]">
                    check_small
                  </span>
                  {s}
                </span>
              ))}
              {!includeCoverLetter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-[12px] font-medium text-on-surface-variant line-through">
                  Cover letter
                </span>
              )}
              {contactCount === 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-[12px] font-medium text-on-surface-variant line-through">
                  Cold emails
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-7" aria-hidden />
        <div className="lg:col-span-5 space-y-3">
          {error && (
            <div className="rounded-xl bg-error-container text-on-error-container border border-error/20 p-3 text-[13px]">
              {error}
            </div>
          )}
          <button
            type="button"
            disabled={!canSubmit || pending}
            onClick={() => void handleSubmit()}
            className="li-btn-primary w-full justify-center disabled:opacity-50"
          >
            {pending ? "Opening pipeline…" : "Start auto-apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
