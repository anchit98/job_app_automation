/**
 * Which files a user may hand us as a resume or cover letter from their device.
 *
 * Only PDF and .docx. The legacy binary .doc format is out: Drive converts it
 * unevenly and the structure repair in pdf-doc-normalize assumes one of the two
 * modern layouts. Keeping the rule here (rather than inline in the input) means
 * the `accept` attribute, the client-side guard and the server check can never
 * drift apart — `accept` only filters the OS dialog's default view, so both
 * other checks are load-bearing.
 *
 * Client-safe: no server imports, so the upload UI can use it directly.
 */
export const PDF_MIME = "application/pdf";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** `accept` for <input type="file"> — extensions first, then the MIME types. */
export const DOCUMENT_UPLOAD_ACCEPT = `.pdf,.docx,${PDF_MIME},${DOCX_MIME}`;

export const UNSUPPORTED_UPLOAD_MESSAGE =
  "Only PDF (.pdf) and Word (.docx) files are supported. Convert your file and try again.";

/**
 * What an imported resume does and does not keep.
 *
 * Every generated resume is typeset from one ATS-friendly template, whatever
 * the master arrived as — so a user who uploads a designed CV gets their words
 * back in our layout, not theirs. That is deliberate, and it surprised people,
 * so it is said up front rather than discovered after the first Apply.
 *
 * Split into paragraphs so the callout can render them; the middle one is the
 * reason, and the last is the way out.
 */
export const UPLOAD_FORMAT_DISCLAIMER = {
  heading: "Your uploaded layout is not kept",
  paragraphs: [
    "If you upload your own resume, the final tailored resume may not look exactly like your uploaded format. Every generated output uses our standard resume format.",
    "That format follows an industry-standard, ATS-friendly structure designed to work well with Applicant Tracking Systems.",
  ],
  /** Rendered with a link on "CV Builder" — see the onboarding callout. */
  remedyBefore:
    "If the output format is not what you want, rebuild your resume in our ",
  remedyLinkLabel: "CV Builder",
  remedyAfter:
    " (recommended) or any other builder you like, then upload it again. For the best results, use our standard CV format.",
} as const;

/** One-line form, for the message shown after an import finishes. */
export const UPLOAD_FORMAT_NOTE =
  "Note: tailored resumes are typeset in our standard ATS-friendly format, not your uploaded layout.";

/** Old Word binaries get a fix-it message instead of the generic refusal. */
const LEGACY_DOC_MESSAGE =
  "Old Word format (.doc) is not supported. Open it in Word or Google Docs and save as .docx or PDF, then upload again.";

export function isSupportedUploadName(fileName: string): boolean {
  return /\.(pdf|docx)$/i.test(fileName.trim());
}

/**
 * Validate a picked file. Browsers report an empty or wrong `type` often enough
 * (drag-and-drop, some Windows builds) that the extension is authoritative and
 * the MIME type is only used when there is no usable extension.
 */
export function checkDocumentUpload(file: {
  name: string;
  type: string;
}): { ok: true } | { ok: false; error: string } {
  const name = (file.name ?? "").trim();
  if (/\.doc$/i.test(name)) return { ok: false, error: LEGACY_DOC_MESSAGE };
  if (isSupportedUploadName(name)) return { ok: true };
  // No recognisable extension — fall back to what the browser declared.
  if (!/\.[a-z0-9]+$/i.test(name)) {
    if (file.type === PDF_MIME || file.type === DOCX_MIME) return { ok: true };
  }
  return { ok: false, error: UNSUPPORTED_UPLOAD_MESSAGE };
}
