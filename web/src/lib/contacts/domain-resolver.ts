export interface DomainSuggestion {
  name: string;
  domain: string;
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .replace(/\.+$/, "");
}

/**
 * Resolve company domain via Clearbit's free autocomplete API.
 * Falls back to a naive slug guess when the API returns nothing.
 */
export async function resolveCompanyDomain(
  companyName: string,
): Promise<{ domain: string | null; suggestions: DomainSuggestion[] }> {
  const query = companyName.trim();
  if (!query) {
    return { domain: null, suggestions: [] };
  }

  try {
    const url = `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return { domain: guessDomainFromName(query), suggestions: [] };
    }
    const data = (await response.json()) as DomainSuggestion[];
    const suggestions = Array.isArray(data)
      ? data
          .filter((item) => item?.domain)
          .map((item) => ({
            name: item.name,
            domain: normalizeDomain(item.domain),
          }))
      : [];
    return {
      domain: suggestions[0]?.domain ?? guessDomainFromName(query),
      suggestions,
    };
  } catch {
    return { domain: guessDomainFromName(query), suggestions: [] };
  }
}

function guessDomainFromName(companyName: string): string | null {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
  if (slug.length < 2) return null;
  return `${slug}.com`;
}
