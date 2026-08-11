/**
 * Validate that input is a Google Docs *document* URL (not Sheets/Slides/Drive/PDF/Word).
 */
export type GoogleDocsParseResult =
  | { ok: true; docId: string }
  | { ok: false; error: string };

/** How to turn a Drive Word/.docx upload into a syncable Google Doc. */
export const GOOGLE_DOC_CONVERT_HINT =
  "Word (.doc/.docx) files on Drive are not supported. In Google Drive, right-click the file → Open with → Google Docs, then paste the new docs.google.com/document/... URL from the address bar.";

/**
 * drive.file cannot open an arbitrary Doc by pasted URL until the user
 * selects it in Google Picker (or the app created it).
 */
export const GOOGLE_DOC_SCOPE_HINT =
  "Can't open that Doc with current Google permissions. Use “Choose from Drive”, pick the Doc, then Sync — pasting a link alone is not enough.";

export function parseGoogleDocsUrl(input: string): GoogleDocsParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "Paste a Google Docs link (https://docs.google.com/document/d/...).",
    };
  }

  if (
    /\.(docx?|dotx?)(\?|#|$)/i.test(trimmed) ||
    /[?&]name=[^&]*\.(docx?|dotx?)/i.test(trimmed)
  ) {
    return { ok: false, error: GOOGLE_DOC_CONVERT_HINT };
  }

  if (
    /(?:onedrive\.live\.com|1drv\.ms|sharepoint\.com|office\.com|officeapps\.live\.com)/i.test(
      trimmed,
    )
  ) {
    return {
      ok: false,
      error:
        "Microsoft Word / OneDrive / SharePoint links are not supported. Upload the file to Google Drive, open it with Google Docs (right-click → Open with → Google Docs), then paste the docs.google.com/document/... URL.",
    };
  }

  if (/docs\.google\.com\/spreadsheets/i.test(trimmed)) {
    return {
      ok: false,
      error:
        "That looks like a Google Sheet. Paste a Google Docs (Document) link instead.",
    };
  }
  if (/docs\.google\.com\/presentation/i.test(trimmed)) {
    return {
      ok: false,
      error:
        "That looks like Google Slides. Paste a Google Docs (Document) link instead.",
    };
  }
  if (/docs\.google\.com\/forms/i.test(trimmed)) {
    return {
      ok: false,
      error:
        "That looks like a Google Form. Paste a Google Docs (Document) link instead.",
    };
  }
  if (/drive\.google\.com\//i.test(trimmed)) {
    return {
      ok: false,
      error:
        "That looks like a Google Drive file link (often a Word upload). Open it with Google Docs first (right-click → Open with → Google Docs), then paste the docs.google.com/document/... URL — not the drive.google.com link.",
    };
  }
  if (/\.pdf(\?|#|$)/i.test(trimmed)) {
    return {
      ok: false,
      error:
        "PDF links are not supported. Convert or open the file as a Google Doc, then paste that link.",
    };
  }

  const match = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/i,
  );
  if (match) {
    return { ok: true, docId: match[1] };
  }

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return {
      ok: false,
      error:
        "Paste the full Google Docs link (https://docs.google.com/document/d/...), not just the ID.",
    };
  }

  return {
    ok: false,
    error:
      "Enter a valid Google Docs link (https://docs.google.com/document/d/...). Word files on Drive must be opened with Google Docs first.",
  };
}

/** Resolve a Docs URL or a bare document ID (server-side / env IDs). */
export function resolveGoogleDocsId(input: string): GoogleDocsParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "Paste a Google Docs link (https://docs.google.com/document/d/...).",
    };
  }
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed) && !/[./]/.test(trimmed)) {
    return { ok: true, docId: trimmed };
  }
  return parseGoogleDocsUrl(trimmed);
}

/**
 * Map Google API failures to a user-facing hint.
 * Permission/scope errors must not be mislabeled as "Word file".
 */
export function explainGoogleDocFetchError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const lower = message.toLowerCase();

  // Real Word / wrong MIME — only when the API says so (not bare 403).
  if (
    /mime|docx|msword|word processing|application\/vnd\.openxmlformats|not a google doc/i.test(
      lower,
    )
  ) {
    return GOOGLE_DOC_CONVERT_HINT;
  }

  // drive.file: pasted URL to a Doc the app has never opened via Picker.
  if (
    /insufficient.*(scope|permission)|caller does not have permission|forbidden|403|permission.?denied|unauthorized|401|login required/i.test(
      lower,
    )
  ) {
    return GOOGLE_DOC_SCOPE_HINT;
  }

  if (/404|not found|invalid.*document|failedprecondition/i.test(lower)) {
    return "Google Doc not found or not a Document. Check the link, or use Choose from Drive.";
  }

  return message || "Could not open that Google Doc. Check the link and try again.";
}
