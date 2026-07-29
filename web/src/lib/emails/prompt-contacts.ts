const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isContactUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Read contact IDs embedded in a cold-email prompt run.
 * Avoids false positives from the template's example schema ("string - must match…").
 */
export function extractExpectedContactIdsFromPrompt(
  promptText: string,
): string[] {
  const sectionMatch = promptText.match(
    /Contacts to write for[^\n]*\n+([\s\S]*?)\n\nRules:/i,
  );
  if (sectionMatch?.[1]) {
    try {
      const contacts = JSON.parse(sectionMatch[1].trim()) as unknown;
      if (Array.isArray(contacts)) {
        const ids = contacts
          .map((row) =>
            row && typeof row === "object" && "contact_id" in row
              ? String((row as { contact_id: unknown }).contact_id)
              : null,
          )
          .filter((id): id is string => Boolean(id && isContactUuid(id)));
        if (ids.length > 0) return [...new Set(ids)];
      }
    } catch {
      // fall through to UUID scan
    }
  }

  const uuidPattern =
    /"contact_id"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi;
  return [
    ...new Set(
      [...promptText.matchAll(uuidPattern)].map((match) => match[1]),
    ),
  ];
}
