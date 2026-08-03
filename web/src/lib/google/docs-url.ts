/**
 * Validate that input is a Google Docs *document* URL (not Sheets/Slides/Drive/PDF).
 */
export type GoogleDocsParseResult =
  | { ok: true; docId: string }
  | { ok: false; error: string };

export function parseGoogleDocsUrl(input: string): GoogleDocsParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "Paste a Google Docs link (https://docs.google.com/document/d/...).",
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
        "That looks like a Drive link. Open the file as a Google Doc and paste the docs.google.com/document/... URL.",
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
      "Enter a valid Google Docs link (https://docs.google.com/document/d/...).",
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
