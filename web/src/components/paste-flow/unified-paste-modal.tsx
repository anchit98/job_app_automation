"use client";

import { useState, useTransition } from "react";
import { submitPasteBack } from "@/app/actions/prompts";
import { FabricationReview } from "@/components/resume/fabrication-review";
import type { FabricationFlag } from "@/lib/resume/fabrication";
import type { StatusAdvanceOutcome } from "@/lib/applications/auto-status";
import { CHATGPT_PASTE_HINT } from "@/lib/prompt/chatgpt-kickoff";

interface UnifiedPasteModalProps {
  title: string;
  promptRunId: string;
  promptText: string;
  lengthWarning?: string | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (
    parsed: unknown,
    meta?: { status_advance?: StatusAdvanceOutcome },
  ) => void;
  chatgptUrl?: string;
  /** Label for copy-only action (e.g. "Copy resume prompt"). */
  copyPromptLabel?: string;
  /** Extra hint under copy buttons (defaults to paste-not-upload guidance). */
  chatgptHint?: string;
  // Specific handler for resume fabrication/keywords if needed
  customSubmit?: (raw: string, acceptedFlagIds?: string[]) => Promise<{
    ok: boolean;
    error?: string;
    repair_prompt?: string;
    validation_errors?: any[];
    structural_errors?: FabricationFlag[];
    fabrication_flags?: FabricationFlag[];
    unresolved_flags?: FabricationFlag[];
    parsed?: unknown;
  }>;
}

export function UnifiedPasteModal({
  title,
  promptRunId,
  promptText,
  lengthWarning,
  open,
  onClose,
  onSuccess,
  chatgptUrl = "https://chat.openai.com/",
  copyPromptLabel = "Copy prompt",
  chatgptHint = CHATGPT_PASTE_HINT,
  customSubmit,
}: UnifiedPasteModalProps) {
  const [step, setStep] = useState<2 | 3 | 4>(2);
  const [copied, setCopied] = useState(false);
  const [copiedOnly, setCopiedOnly] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [repairPrompt, setRepairPrompt] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ path: string; message: string }[] | null>(null);
  const [fabricationFlags, setFabricationFlags] = useState<FabricationFlag[]>([]);
  const [acceptedFlagIds, setAcceptedFlagIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function toggleFlag(id: string) {
    setAcceptedFlagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function copyPromptOnly() {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopiedOnly(true);
      setTimeout(() => setCopiedOnly(false), 2000);
    } catch {
      setCopiedOnly(false);
    }
  }

  async function copyAndOpen() {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
    window.open(chatgptUrl, "_blank", "noopener,noreferrer");
    setStep(3);
  }

  function handleSubmit() {
    setError(null);
    setRepairPrompt(null);
    setValidationErrors(null);
    
    startTransition(async () => {
      setStep(4);
      let result: any;
      
      if (customSubmit) {
        result = await customSubmit(raw, acceptedFlagIds);
      } else {
        result = await submitPasteBack(promptRunId, raw);
      }

      if (!result.ok) {
        setError(result.error || "Validation failed");
        if (result.repair_prompt) setRepairPrompt(result.repair_prompt);
        if (result.validation_errors) setValidationErrors(result.validation_errors);
        
        if (result.structural_errors?.length) {
           // Structural failures use the repair prompt — do not show accept-checkboxes.
           setFabricationFlags([]);
           setStep(3);
           return;
        }
        
        // Fabrication flags are auto-approved server-side; never gate on checkboxes.
        setFabricationFlags([]);

        setStep(3); // Go back to paste step to show errors
        return;
      }

      onSuccess(result.parsed, { status_advance: result.status_advance });
      setFabricationFlags([]);
      setAcceptedFlagIds([]);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-surface-container-high w-full max-w-2xl rounded-2xl border border-outline-variant shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-highest">
          <h2 className="text-[24px] leading-[32px] text-on-surface">{title}</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors p-2 rounded-full hover:bg-surface-variant">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 pt-6 pb-2 shrink-0">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-[2px] bg-surface-variant -z-10"></div>
            <div className={`absolute left-6 top-1/2 -translate-y-1/2 h-[2px] bg-primary -z-10 transition-all duration-300 ${step === 2 ? 'w-[10%]' : step === 3 ? 'w-[50%]' : 'w-[90%]'}`}></div>
            
            <div className="flex flex-col items-center gap-2 bg-surface-container-high px-2">
              <div className="w-8 h-8 rounded-full bg-success-container text-on-success-container flex items-center justify-center border border-success-container">
                <span className="material-symbols-outlined text-[18px]">check</span>
              </div>
              <span className="text-[11px] font-medium text-on-surface-variant">Prepare</span>
            </div>
            
            <div className="flex flex-col items-center gap-2 bg-surface-container-high px-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-[14px] border ${step >= 2 ? (step > 2 ? 'bg-success-container text-on-success-container border-success-container' : 'bg-primary text-on-primary border-primary') : 'bg-surface-variant text-on-surface-variant border-outline-variant'}`}>
                {step > 2 ? <span className="material-symbols-outlined text-[18px]">check</span> : "2"}
              </div>
              <span className={`text-[11px] font-medium ${step === 2 ? 'text-primary' : 'text-on-surface-variant'}`}>Copy & Run</span>
            </div>
            
            <div className="flex flex-col items-center gap-2 bg-surface-container-high px-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-[14px] border ${step >= 3 ? (step > 3 ? 'bg-success-container text-on-success-container border-success-container' : 'bg-primary text-on-primary border-primary') : 'bg-surface-variant text-on-surface-variant border-outline-variant'}`}>
                {step > 3 ? <span className="material-symbols-outlined text-[18px]">check</span> : "3"}
              </div>
              <span className={`text-[11px] font-medium ${step === 3 ? 'text-primary' : 'text-on-surface-variant'}`}>Paste Results</span>
            </div>

            <div className="flex flex-col items-center gap-2 bg-surface-container-high px-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-[14px] border ${step >= 4 ? 'bg-primary text-on-primary border-primary' : 'bg-surface-variant text-on-surface-variant border-outline-variant'}`}>
                4
              </div>
              <span className={`text-[11px] font-medium ${step === 4 ? 'text-primary' : 'text-on-surface-variant'}`}>Review</span>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto min-h-[300px]">
          {step === 2 && (
            <>
              <p className="text-[16px] leading-[24px] text-on-surface-variant">
                Copy the prompt below and paste it into the ChatGPT message box as plain text.
              </p>

              <div className="rounded-lg border border-primary/30 bg-primary-container/10 px-4 py-3 text-[13px] text-on-surface-variant leading-relaxed">
                {chatgptHint}
              </div>
              
              {lengthWarning && (
                <div className="bg-error-container/20 border border-error-container text-on-error-container p-3 rounded-lg text-sm">
                  {lengthWarning}
                </div>
              )}

              <div className="bg-surface-container rounded-lg border border-outline-variant p-4 relative group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-primary">Generated Prompt</span>
                  <button
                    type="button"
                    onClick={copyPromptOnly}
                    className="text-[12px] font-medium text-primary hover:underline flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    {copiedOnly ? "Copied!" : copyPromptLabel}
                  </button>
                </div>
                <div className="text-[14px] text-on-surface line-clamp-4 italic opacity-80 font-mono">
                  {promptText}
                </div>
                <div className="absolute bottom-4 left-4 right-4 h-8 bg-gradient-to-t from-surface-container to-transparent pointer-events-none"></div>
              </div>
              
              <div className="flex flex-col items-center space-y-4 pt-4">
                <div className="w-full flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={copyPromptOnly}
                    className="flex-1 bg-surface-container-high text-on-surface hover:bg-surface-variant transition-colors py-3 px-6 rounded-full flex items-center justify-center gap-2 border border-outline-variant"
                  >
                    <span className="material-symbols-outlined text-[18px]">content_copy</span>
                    <span className="text-[14px] font-medium">
                      {copiedOnly ? "Copied!" : copyPromptLabel}
                    </span>
                  </button>
                  <button 
                    onClick={copyAndOpen}
                    className="flex-1 bg-primary-container text-on-primary-container hover:bg-primary hover:text-on-primary transition-colors py-3 px-6 rounded-full flex items-center justify-center gap-3 shadow-sm group"
                  >
                    <span className="material-symbols-outlined group-hover:scale-110 transition-transform">content_copy</span>
                    <span className="text-[14px] font-bold">Copy & open ChatGPT</span>
                    <span className="material-symbols-outlined text-[18px] opacity-70">open_in_new</span>
                  </button>
                </div>
                <p className="text-[12px] text-on-surface-variant text-center max-w-[90%]">
                  After ChatGPT returns JSON, come back here and paste the full response on the next step.
                </p>
                <button 
                  onClick={() => setStep(3)}
                  className="text-[12px] text-primary hover:underline mt-2"
                >
                  Skip to paste
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-[14px] text-on-surface-variant">
                Paste the full JSON response from ChatGPT below.
              </p>
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder='{"experience": [...]}'
                className="w-full h-48 resize-none bg-surface-container-highest text-on-surface border border-outline-variant rounded-lg p-4 font-mono text-[12px] focus:outline-none focus:border-primary transition-colors"
              />
              
              {error && (
                <div className="bg-error-container text-on-error-container p-4 rounded-lg border border-error">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-[18px]">error</span>
                    <span className="text-[14px] font-bold">Validation Error</span>
                  </div>
                  <p className="text-[12px] mb-2">{error}</p>
                  
                  {validationErrors && validationErrors.length > 0 && (
                    <ul className="list-disc pl-5 text-[12px] mb-3 space-y-1">
                      {validationErrors.map((e, i) => (
                        <li key={i}>{e.path}: {e.message}</li>
                      ))}
                    </ul>
                  )}
                  
                  {repairPrompt && (
                    <div className="mt-4 pt-4 border-t border-error/30">
                      <p className="text-[12px] font-medium mb-2">Repair prompt (copy & run in same thread):</p>
                      <div className="bg-surface-container-highest/50 p-2 rounded border border-error/20 mb-3 relative">
                         <div className="text-[10px] font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">{repairPrompt}</div>
                      </div>
                      <button 
                        onClick={() => navigator.clipboard.writeText(repairPrompt)}
                        className="bg-on-error-container text-error-container px-3 py-1.5 rounded-full text-[12px] font-medium hover:opacity-90"
                      >
                        Copy repair prompt
                      </button>
                    </div>
                  )}
                </div>
              )}

              {fabricationFlags.length > 0 && (
                <div className="mt-4">
                  <FabricationReview
                    flags={fabricationFlags}
                    acceptedIds={acceptedFlagIds}
                    onToggle={toggleFlag}
                  />
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center justify-center h-full py-8 space-y-6">
               <div className="relative">
                 <svg className="animate-spin h-16 w-16 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
                 <span className="material-symbols-outlined absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[24px] text-primary">cloud_upload</span>
               </div>
               <div className="text-center">
                 <h3 className="text-[18px] font-medium text-on-surface mb-2">Processing & Uploading</h3>
                 <p className="text-[14px] text-on-surface-variant">Validating response and generating artifacts to Google Drive...</p>
               </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-outline-variant flex justify-between items-center bg-surface-container-highest shrink-0">
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface font-medium text-[14px] px-4 py-2 rounded-full hover:bg-surface-variant transition-colors" disabled={pending}>
            Cancel
          </button>
          
          <div className="flex gap-2">
            {step === 2 && (
              <button 
                onClick={() => setStep(3)}
                className="text-primary hover:bg-surface-variant font-medium text-[14px] px-4 py-2 rounded-full transition-colors flex items-center gap-1"
              >
                Skip to paste
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            )}
            
            {step === 3 && (
              <button 
                onClick={handleSubmit}
                disabled={!raw.trim() || pending}
                className="bg-primary text-on-primary hover:opacity-90 font-medium text-[14px] px-6 py-2 rounded-full transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                Submit & Validate
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
