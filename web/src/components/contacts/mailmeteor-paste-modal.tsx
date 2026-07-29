"use client";

import { useState, useTransition } from "react";
import type { EmailDiscoveryPayload } from "@/lib/db/types";
import {
  tryParseMailmeteorJson,
  type MailmeteorResult,
} from "@/lib/contacts/validate";

interface MailmeteorPasteModalProps {
  open: boolean;
  promptRunId: string;
  payload: EmailDiscoveryPayload;
  linkedinUrl: string;
  onClose: () => void;
  onSubmit: (result: MailmeteorResult) => Promise<{
    ok: boolean;
    error?: string;
    validation_errors?: { path: string; message: string }[];
  }>;
  onNoResults: () => void;
}

export function MailmeteorPasteModal({
  open,
  promptRunId,
  payload,
  linkedinUrl,
  onClose,
  onSubmit,
  onNoResults,
}: MailmeteorPasteModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState(payload.name ?? "");
  const [position, setPosition] = useState(payload.role ?? "");
  const [email, setEmail] = useState("");
  const [validationStatus, setValidationStatus] = useState<"Valid" | "Risky">(
    "Valid",
  );
  const [notes, setNotes] = useState("");
  const [rawPaste, setRawPaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    { path: string; message: string }[] | null
  >(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  async function copyAndOpen() {
    try {
      await navigator.clipboard.writeText(linkedinUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
    window.open(
      "https://mailmeteor.com/tools/linkedin-email-finder",
      "_blank",
      "noopener,noreferrer",
    );
    setStep(2);
  }

  function applyRawPaste() {
    const parsed = tryParseMailmeteorJson(rawPaste);
    if (parsed) {
      setName(parsed.name);
      setPosition(parsed.position ?? "");
      setEmail(parsed.email);
      setValidationStatus(
        parsed.validation_status.toLowerCase() === "risky" ? "Risky" : "Valid",
      );
      setNotes(parsed.notes ?? "");
      setError(null);
      return;
    }
    setError("Could not parse JSON. Fill in the fields manually.");
  }

  function handleConfirm() {
    setError(null);
    setValidationErrors(null);
    const result: MailmeteorResult = {
      name,
      position: position || null,
      email,
      validation_status: validationStatus,
      notes: notes || null,
    };

    startTransition(async () => {
      setStep(3);
      const response = await onSubmit(result);
      if (!response.ok) {
        setStep(2);
        setError(response.error ?? "Failed to save contact");
        setValidationErrors(response.validation_errors ?? null);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/60 p-4">
      <div
        className="bg-surface-container-high border border-outline-variant rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mailmeteor-modal-title"
      >
        <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between shrink-0">
          <div>
            <h2 id="mailmeteor-modal-title" className="text-[18px] font-medium text-on-surface">
              Find email via Mailmeteor
            </h2>
            <p className="text-[12px] text-on-surface-variant mt-0.5">
              Run ID: {promptRunId.slice(0, 8)}…
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {step === 1 && (
            <>
              <p className="text-[14px] text-on-surface-variant">
                Copy the LinkedIn URL, open Mailmeteor, paste the profile link, and run the lookup.
              </p>
              <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">
                  LinkedIn URL
                </p>
                <p className="text-[13px] text-on-surface break-all font-mono">{linkedinUrl}</p>
              </div>
              <button
                type="button"
                onClick={copyAndOpen}
                className="w-full bg-primary text-on-primary text-[14px] font-medium px-6 py-2.5 rounded-full hover:opacity-90 transition-colors"
              >
                {copied ? "Copied - opening Mailmeteor…" : "Copy URL & open Mailmeteor"}
              </button>
            </>
          )}

          {step >= 2 && (
            <>
              <div className="flex items-center gap-2 text-[12px] text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-primary">link</span>
                <span className="truncate">{linkedinUrl}</span>
              </div>

              <div>
                <label className="text-[12px] font-medium text-on-surface-variant block mb-1">
                  Paste JSON (optional)
                </label>
                <textarea
                  value={rawPaste}
                  onChange={(e) => setRawPaste(e.target.value)}
                  placeholder='{"name":"Jane Doe","email":"jane@acme.com","validation_status":"Valid"}'
                  className="w-full h-20 bg-surface-container-low border border-outline-variant rounded-lg p-3 text-[13px] font-mono text-on-surface resize-none"
                />
                <button
                  type="button"
                  onClick={applyRawPaste}
                  className="mt-2 text-[13px] text-primary hover:underline"
                >
                  Apply pasted JSON
                </button>
              </div>

              <div className="grid gap-3">
                <div>
                  <label className="text-[12px] font-medium text-on-surface-variant block mb-1">
                    Name (from Mailmeteor)
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-[14px] text-on-surface"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-on-surface-variant block mb-1">
                    Position / title
                  </label>
                  <input
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-[14px] text-on-surface"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-on-surface-variant block mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-[14px] text-on-surface"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-on-surface-variant block mb-1">
                    Mailmeteor validation
                  </label>
                  <select
                    value={validationStatus}
                    onChange={(e) =>
                      setValidationStatus(e.target.value as "Valid" | "Risky")
                    }
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-[14px] text-on-surface"
                  >
                    <option value="Valid">Valid</option>
                    <option value="Risky">Risky</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-on-surface-variant block mb-1">
                    Notes (optional)
                  </label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-[14px] text-on-surface"
                  />
                </div>
              </div>

              <p className="text-[12px] text-on-surface-variant">
                Confirm the name matches the LinkedIn profile before saving.
              </p>

              {error && (
                <p className="rounded-lg bg-error-container p-3 text-[13px] text-on-error-container">
                  {error}
                </p>
              )}
              {validationErrors && validationErrors.length > 0 && (
                <ul className="rounded-lg bg-error-container p-3 text-[13px] text-on-error-container space-y-1">
                  {validationErrors.map((item) => (
                    <li key={item.path}>
                      {item.path}: {item.message}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-8 text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] animate-spin mb-2">
                progress_activity
              </span>
              <p className="text-[14px]">Saving contact…</p>
            </div>
          )}
        </div>

        {step === 2 && (
          <div className="px-6 py-4 border-t border-outline-variant flex flex-wrap gap-2 justify-between shrink-0">
            <button
              type="button"
              onClick={onNoResults}
              className="text-[13px] text-on-surface-variant hover:text-on-surface px-3 py-2 rounded-full hover:bg-surface-container"
            >
              No results from Mailmeteor
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="text-[14px] text-on-surface-variant px-4 py-2 rounded-full hover:bg-surface-container"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={pending || !name.trim() || !email.trim()}
                className="bg-primary text-on-primary text-[14px] font-medium px-6 py-2 rounded-full hover:opacity-90 disabled:opacity-50"
              >
                Save contact
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
