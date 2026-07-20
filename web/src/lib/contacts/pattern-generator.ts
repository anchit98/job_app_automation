export interface NameParts {
  firstName: string;
  lastName: string;
}

export function parseNameParts(fullName: string): NameParts | null {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z'-]/g, ""));
  if (parts.length < 2) return null;

  const firstName = parts[0].toLowerCase();
  const lastName = parts[parts.length - 1].toLowerCase();
  if (!firstName || !lastName) return null;

  return { firstName, lastName };
}

export function generateEmailPatterns(
  nameParts: NameParts,
  domain: string,
): string[] {
  const { firstName, lastName } = nameParts;
  const f = firstName[0];
  const patterns = [
    `${firstName}.${lastName}@${domain}`,
    `${firstName}@${domain}`,
    `${f}.${lastName}@${domain}`,
    `${firstName}${lastName}@${domain}`,
    `${firstName}_${lastName}@${domain}`,
  ];
  return [...new Set(patterns)];
}
