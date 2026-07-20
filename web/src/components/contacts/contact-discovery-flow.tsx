"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getContactsForApplication,
  getSmtpVerifyStatus,
  lookupCompanyDomain,
  markNoEmailAvailable,
  removeContact,
  runPatternFallback,
  saveManualContact,
  startEmailDiscovery,
  submitMailmeteorResult,
} from "@/app/actions/contacts";
import { abandonPromptRun } from "@/app/actions/prompts";
import { MailmeteorPasteModal } from "@/components/contacts/mailmeteor-paste-modal";
import type { Contact, EmailDiscoveryPayload } from "@/lib/db/types";
import type { MailmeteorResult } from "@/lib/contacts/validate";

interface ContactDiscoveryFlowProps {
  applicationId: string;
  companyName: string | null;
  initialContacts: Contact[];
}

const VERIFICATION_LABELS: Record<Contact["verification_status"], string> = {
  valid: "Valid",
  risky: "Risky",
  unverified: "Unverified",
  no_email_available: "No email",
};

const VERIFICATION_STYLES: Record<Contact["verification_status"], string> = {
  valid: "bg-secondary-container text-on-secondary-container",
  risky: "bg-tertiary-container text-on-tertiary-container",
  unverified: "bg-surface-variant text-on-surface-variant",
  no_email_available: "bg-surface-container-high text-on-surface-variant",
};

const SOURCE_LABELS: Record<NonNullable<Contact["email_source"]>, string> = {
  mailmeteor_manual: "Mailmeteor",
  pattern_smtp: "Pattern guess",
  manual_entry: "Manual",
};

export function ContactDiscoveryFlow({
  applicationId,
  companyName,
  initialContacts,
}: ContactDiscoveryFlowProps) {
  const router = useRouter();
  const [contacts, setContacts] = useState(initialContacts);
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [companyDomain, setCompanyDomain] = useState("");
  const [domainSuggestions, setDomainSuggestions] = useState<
    { name: string; domain: string }[]
  >([]);
  const [smtpBanner, setSmtpBanner] = useState<string | null>(null);

  const [promptRunId, setPromptRunId] = useState<string | null>(null);
  const [discoveryPayload, setDiscoveryPayload] =
    useState<EmailDiscoveryPayload | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [fallbackMode, setFallbackMode] = useState<
    null | "no_results" | "pattern" | "manual"
  >(null);

  const [manualEmail, setManualEmail] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refreshContacts() {
    startTransition(async () => {
      const data = await getContactsForApplication(applicationId);
      setContacts(data);
      router.refresh();
    });
  }

  function resolveDomain() {
    if (!companyName?.trim()) return;
    startTransition(async () => {
      const result = await lookupCompanyDomain(companyName);
      if (result.domain) setCompanyDomain(result.domain);
      setDomainSuggestions(result.suggestions);
    });
  }

  function startDiscovery() {
    setError(null);
    startTransition(async () => {
      const smtp = await getSmtpVerifyStatus();
      if (smtp.capability === "unavailable") {
        setSmtpBanner(
          "SMTP verify is unavailable on this host — pattern guesses will be marked unverified.",
        );
      }

      const result = await startEmailDiscovery(applicationId, {
        linkedin_url: linkedinUrl,
        name: name || null,
        role: role || null,
        company_domain: companyDomain || null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setPromptRunId(result.prompt_run_id);
      setDiscoveryPayload(result.payload);
      setModalOpen(true);
      setFallbackMode(null);
    });
  }

  function handleCancelDiscovery() {
    if (promptRunId) {
      startTransition(async () => {
        await abandonPromptRun(promptRunId);
        setPromptRunId(null);
        setDiscoveryPayload(null);
        setModalOpen(false);
        setFallbackMode(null);
      });
    } else {
      setModalOpen(false);
      setFallbackMode(null);
    }
  }

  async function handleMailmeteorSubmit(result: MailmeteorResult) {
    if (!promptRunId) return { ok: false, error: "Missing discovery run." };
    const response = await submitMailmeteorResult(promptRunId, result);
    if (response.ok) {
      setPromptRunId(null);
      setDiscoveryPayload(null);
      setLinkedinUrl("");
      setName("");
      setRole("");
      refreshContacts();
    }
    return response;
  }

  function handleNoResults() {
    setModalOpen(false);
    setFallbackMode("no_results");
  }

  function runPattern() {
    if (!name.trim() || !companyDomain.trim()) {
      setError("Full name and company domain are required for pattern guessing.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await runPatternFallback({
        applicationId,
        promptRunId,
        name,
        companyDomain,
        linkedinUrl: (discoveryPayload?.linkedin_url ?? linkedinUrl) || null,
        role: role || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.note) setSmtpBanner(result.note);
      setPromptRunId(null);
      setDiscoveryPayload(null);
      setFallbackMode(null);
      setLinkedinUrl("");
      refreshContacts();
    });
  }

  function saveManual() {
    setError(null);
    startTransition(async () => {
      const result = await saveManualContact(applicationId, {
        name: name || discoveryPayload?.name || "Contact",
        role: role || discoveryPayload?.role || null,
        linkedin_url: (discoveryPayload?.linkedin_url ?? linkedinUrl) || null,
        company_domain: companyDomain || discoveryPayload?.company_domain || null,
        email: manualEmail,
        notes: manualNotes || null,
        promptRunId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPromptRunId(null);
      setDiscoveryPayload(null);
      setFallbackMode(null);
      setManualEmail("");
      setManualNotes("");
      setLinkedinUrl("");
      refreshContacts();
    });
  }

  function skipContact() {
    if (!promptRunId) return;
    startTransition(async () => {
      const result = await markNoEmailAvailable(promptRunId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPromptRunId(null);
      setDiscoveryPayload(null);
      setFallbackMode(null);
      setLinkedinUrl("");
      refreshContacts();
    });
  }

  function deleteContactRow(contactId: string) {
    startTransition(async () => {
      await removeContact(contactId);
      refreshContacts();
    });
  }

  return (
    <div className="space-y-6">
      {smtpBanner && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-[13px] text-on-surface-variant flex gap-2">
          <span className="material-symbols-outlined text-[18px] shrink-0">info</span>
          <p>{smtpBanner}</p>
        </div>
      )}

      <div className="bg-surface-container border border-outline-variant rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-[16px] font-medium text-on-surface">Add contact</h2>
          <p className="mt-1 text-[14px] text-on-surface-variant">
            Paste a LinkedIn profile URL, find the email in Mailmeteor, then paste the result back.
            {companyName && " Company domain can be inferred from the application."}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-[12px] font-medium text-on-surface-variant block mb-1">
              LinkedIn profile URL *
            </label>
            <input
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://www.linkedin.com/in/jane-doe/"
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-[14px] text-on-surface"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-on-surface-variant block mb-1">
              Name (optional)
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-[14px] text-on-surface"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-on-surface-variant block mb-1">
              Title / role (optional)
            </label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Head of Product"
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-[14px] text-on-surface"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[12px] font-medium text-on-surface-variant block mb-1">
              Company domain (override)
            </label>
            <div className="flex gap-2">
              <input
                value={companyDomain}
                onChange={(e) => setCompanyDomain(e.target.value)}
                placeholder="acme.com"
                className="flex-1 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-[14px] text-on-surface"
              />
              {companyName && (
                <button
                  type="button"
                  onClick={resolveDomain}
                  disabled={pending}
                  className="text-[13px] text-primary px-4 py-2 rounded-full border border-outline-variant hover:bg-surface-container-high whitespace-nowrap"
                >
                  Resolve from {companyName}
                </button>
              )}
            </div>
            {domainSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {domainSuggestions.map((s) => (
                  <button
                    key={s.domain}
                    type="button"
                    onClick={() => setCompanyDomain(s.domain)}
                    className="text-[12px] px-2 py-1 rounded-full bg-surface-container-low border border-outline-variant hover:border-primary"
                  >
                    {s.name} ({s.domain})
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={startDiscovery}
          disabled={pending || !linkedinUrl.trim()}
          className="bg-primary text-on-primary text-[14px] font-medium px-6 py-2 rounded-full hover:opacity-90 disabled:opacity-50 transition-colors"
        >
          {pending ? "Preparing…" : "Find email in Mailmeteor"}
        </button>

        {error && (
          <p className="rounded-lg bg-error-container p-3 text-[14px] text-on-error-container">
            {error}
          </p>
        )}
      </div>

      {fallbackMode === "no_results" && (
        <div className="bg-surface-container border border-outline-variant rounded-xl p-6 space-y-4">
          <h3 className="text-[16px] font-medium text-on-surface">
            No email from Mailmeteor
          </h3>
          <p className="text-[14px] text-on-surface-variant">
            Choose a fallback: guess a pattern, enter an email manually, or skip this contact.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFallbackMode("pattern")}
              className="text-[14px] bg-secondary-container text-on-secondary-container px-4 py-2 rounded-full"
            >
              Run pattern guess
            </button>
            <button
              type="button"
              onClick={() => setFallbackMode("manual")}
              className="text-[14px] border border-outline-variant px-4 py-2 rounded-full hover:bg-surface-container-high"
            >
              Enter email manually
            </button>
            <button
              type="button"
              onClick={skipContact}
              disabled={pending}
              className="text-[14px] text-on-surface-variant px-4 py-2 rounded-full hover:bg-surface-container-high"
            >
              Skip — no email available
            </button>
          </div>
        </div>
      )}

      {fallbackMode === "pattern" && (
        <div className="bg-surface-container border border-outline-variant rounded-xl p-6 space-y-4">
          <h3 className="text-[16px] font-medium text-on-surface">Pattern guess fallback</h3>
          <p className="text-[14px] text-on-surface-variant">
            Generates common patterns (firstname.lastname@, etc.) and optionally probes SMTP.
            Results are always marked <strong>unverified</strong> unless explicitly accepted by the server.
          </p>
          <button
            type="button"
            onClick={runPattern}
            disabled={pending}
            className="bg-primary text-on-primary text-[14px] font-medium px-6 py-2 rounded-full disabled:opacity-50"
          >
            {pending ? "Running…" : "Generate pattern guess"}
          </button>
        </div>
      )}

      {fallbackMode === "manual" && (
        <div className="bg-surface-container border border-outline-variant rounded-xl p-6 space-y-4">
          <h3 className="text-[16px] font-medium text-on-surface">Manual email entry</h3>
          <div className="grid gap-3 max-w-md">
            <div>
              <label className="text-[12px] font-medium text-on-surface-variant block mb-1">
                Email *
              </label>
              <input
                type="email"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-[14px] text-on-surface"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-on-surface-variant block mb-1">
                Notes
              </label>
              <input
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-[14px] text-on-surface"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={saveManual}
            disabled={pending || !manualEmail.trim()}
            className="bg-primary text-on-primary text-[14px] font-medium px-6 py-2 rounded-full disabled:opacity-50"
          >
            Save manual contact
          </button>
        </div>
      )}

      <div className="bg-surface-container border border-outline-variant rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-[16px] font-medium text-on-surface">
            Contacts ({contacts.length})
          </h2>
        </div>

        {contacts.length === 0 ? (
          <p className="text-[14px] text-on-surface-variant">
            No contacts yet. Add a hiring manager or recruiter to prepare for cold emails in Phase 5.
          </p>
        ) : (
          <div className="space-y-3">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="bg-surface-container-low border border-outline-variant rounded-lg p-4"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-medium text-on-surface">
                        {contact.name}
                      </span>
                      <span
                        className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${VERIFICATION_STYLES[contact.verification_status]}`}
                      >
                        {VERIFICATION_LABELS[contact.verification_status]}
                      </span>
                      {contact.email_source && (
                        <span className="text-[10px] text-on-surface-variant uppercase">
                          via {SOURCE_LABELS[contact.email_source]}
                        </span>
                      )}
                    </div>
                    {contact.role && (
                      <p className="text-[13px] text-on-surface-variant mt-0.5">
                        {contact.role}
                      </p>
                    )}
                    {contact.email && (
                      <p className="text-[14px] text-on-surface mt-1 font-mono">
                        {contact.email}
                      </p>
                    )}
                    {contact.linkedin_url && (
                      <a
                        href={contact.linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[12px] text-primary hover:underline mt-1 inline-flex items-center gap-1"
                      >
                        LinkedIn
                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                      </a>
                    )}
                    {contact.notes && (
                      <p className="text-[12px] text-on-surface-variant mt-2">
                        {contact.notes}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteContactRow(contact.id)}
                    className="text-on-surface-variant hover:text-error p-1 rounded"
                    title="Remove contact"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && promptRunId && discoveryPayload && (
        <MailmeteorPasteModal
          open={modalOpen}
          promptRunId={promptRunId}
          payload={discoveryPayload}
          linkedinUrl={discoveryPayload.linkedin_url}
          onClose={handleCancelDiscovery}
          onSubmit={handleMailmeteorSubmit}
          onNoResults={handleNoResults}
        />
      )}
    </div>
  );
}
