/**
 * PARKED - written, tested, and deliberately not wired up yet.
 *
 * This is the first piece of "paste a LinkedIn URL, get the email": the rest
 * of that feature (a per-domain pattern cache, and a verification provider
 * that works from a host where outbound port 25 is blocked) is not built. On
 * its own this module changes nothing - nothing imports it - and it is kept so
 * the work is not lost when that feature is picked back up.
 *
 * Covered by scripts/check-linkedin-url.ts.
 *
 * ---
 *
 * Read a person's name out of a LinkedIn profile URL.
 *
 * The pattern generator needs a first and last name; the user has a profile
 * URL. That URL's slug is usually the name with a random suffix LinkedIn adds
 * to keep slugs unique — "priya-sharma-8a2b1c" — so most of the time the name
 * is sitting right there and asking the user to retype it is busywork.
 *
 * Not all of the time, though. A slug with no separator ("srishtihanda") can
 * only be split with a name dictionary, and guessing "srishti handa" vs
 * "srish tihanda" wrong produces a plausible-looking address that bounces. So
 * this returns null rather than a guess, and the caller asks.
 *
 * Client-safe: pure string handling, no network, no LinkedIn access.
 */

/** The suffix LinkedIn appends for uniqueness — "8a2b1c", "0123456789". */
function isSlugSuffix(token: string): boolean {
  if (!token) return true;
  // Any digit in a trailing token means it is an id, not part of a name.
  if (/\d/.test(token)) return true;
  // A lone letter is an initial, which is part of the name — keep it.
  return false;
}

/** Roman-numeral and generational suffixes are name, not id. */
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "phd", "md"]);

export interface LinkedInProfile {
  /** Canonical profile URL, or null when the input was not one. */
  url: string;
  /** The slug — "priya-sharma-8a2b1c". */
  slug: string;
  /**
   * "Priya Sharma", or null when the slug cannot be split with confidence.
   * A null here means ask the user, never guess.
   */
  name: string | null;
}

/**
 * Parse any shape of profile URL a user might paste.
 *
 * Handles the locale subdomains ("in.linkedin.com"), tracking query strings,
 * a missing scheme, and a bare slug pasted on its own.
 */
export function parseLinkedInProfile(input: string): LinkedInProfile | null {
  const raw = input.trim();
  if (!raw) return null;

  let slug: string | null = null;

  const match = raw.match(
    /(?:^|\/\/)(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/([^/?#\s]+)/i,
  );
  if (match) {
    slug = match[1];
  } else if (/^[a-z0-9À-ɏ-]+$/i.test(raw) && !raw.includes(".")) {
    // A bare slug, pasted without the rest of the URL.
    slug = raw;
  }
  if (!slug) return null;

  try {
    slug = decodeURIComponent(slug);
  } catch {
    // A malformed escape is not worth failing the whole parse over.
  }
  slug = slug.replace(/\/+$/, "").toLowerCase();
  if (!slug) return null;

  return {
    url: `https://www.linkedin.com/in/${slug}/`,
    slug,
    name: nameFromSlug(slug),
  };
}

/** "priya-sharma-8a2b1c" → "Priya Sharma". Null when it cannot be split. */
export function nameFromSlug(slug: string): string | null {
  const tokens = slug.split("-").filter(Boolean);
  if (tokens.length === 0) return null;

  // Trailing id segments, from the right, but never the last name itself.
  const kept = [...tokens];
  while (kept.length > 2 && isSlugSuffix(kept[kept.length - 1])) {
    kept.pop();
  }
  // With exactly two tokens left, only drop the second if it is clearly an id
  // — otherwise "john-smith" would lose "smith" the moment it were "smith2".
  if (kept.length === 2 && /^\d+$/.test(kept[1])) kept.pop();

  const words = kept.filter((token) => !/\d/.test(token));
  // One word is a name we cannot split: "srishtihanda", or a first name alone.
  if (words.length < 2) return null;

  return words
    .map((word) =>
      NAME_SUFFIXES.has(word)
        ? word.toUpperCase()
        : word
            .split("'")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join("'"),
    )
    .join(" ");
}
