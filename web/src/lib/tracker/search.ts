import type { ApplicationStatus } from "@/lib/applications/status";

export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Sort orders offered on the Jobs page.
 *
 * `recent` is the default because a tracker is mostly used to answer "what
 * moved?", and `updated_at` changes on every pipeline step, status change and
 * email — which is exactly what "recent activity" means to the user.
 */
export const APPLICATION_SORTS = ["recent", "applied", "name"] as const;

export type ApplicationSort = (typeof APPLICATION_SORTS)[number];

export const APPLICATION_SORT_LABELS: Record<ApplicationSort, string> = {
  recent: "Recent activity",
  applied: "Date of application",
  name: "Name (A–Z)",
};

export const DEFAULT_SORT: ApplicationSort = "recent";

export function isApplicationSort(value: string): value is ApplicationSort {
  return (APPLICATION_SORTS as readonly string[]).includes(value);
}

export interface ApplicationSearchFilters {
  q?: string;
  status?: ApplicationStatus | "interview_stage";
  company?: string;
  role?: string;
  contact?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: ApplicationSort;
  page?: number;
  pageSize?: number;
}

export interface ApplicationListItem {
  id: string;
  company: string | null;
  role: string | null;
  status: ApplicationStatus;
  jd_parsed: boolean;
  created_at: string;
  updated_at: string;
  resume_version_count: number;
  latest_resume_version: number | null;
  is_incomplete: boolean;
  /** True when the application has at least one contact with an email. */
  has_contact?: boolean;
  /** Earliest due follow-up for this application, if any. */
  due_follow_up?: {
    id: string;
    sequence: 1 | 2;
    due_at: string;
    contact_name: string | null;
  } | null;
  pipeline?: {
    pipeline_id: string;
    status: string;
    current_stage: string | null;
    error: string | null;
    can_resume: boolean;
  } | null;
}

export interface ApplicationSearchResult {
  items: ApplicationListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** More than this and the query is a paste, not a search. */
const MAX_SEARCH_TOKENS = 8;

/**
 * Split a search box into the terms that must each be found.
 *
 * Punctuation is dropped rather than escaped: nobody searching a job tracker
 * means `%` or `_` literally, and leaving them in turns a typo into a LIKE
 * wildcard that silently matches everything. Single characters go too — one
 * letter matches every row and tells the user nothing.
 */
export function buildSearchTokens(q: string): string[] {
  return [
    ...new Set(
      q
        .toLowerCase()
        .replace(/[^\w\s@.+#-]/g, " ")
        .split(/\s+/)
        // Trim only the punctuation people type as punctuation. `+` and `#`
        // stay: they are the whole difference between "c", "C++" and "C#".
        .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ""))
        .filter((t) => t.length >= 2),
    ),
  ].slice(0, MAX_SEARCH_TOKENS);
}

/** @deprecated Kept for callers still passing text to plainto_tsquery. */
export function buildFtsMatchQuery(q: string): string {
  return buildSearchTokens(q).join(" ");
}

export function parseApplicationSearchParams(
  params: Record<string, string | string[] | undefined>,
): ApplicationSearchFilters {
  const pick = (key: string) => {
    const v = params[key];
    return typeof v === "string" ? v : undefined;
  };

  const page = Number.parseInt(pick("page") ?? "1", 10);
  const pageSize = Number.parseInt(
    pick("pageSize") ?? String(DEFAULT_PAGE_SIZE),
    10,
  );

  const sort = pick("sort");

  return {
    q: pick("q"),
    status: pick("status") as ApplicationSearchFilters["status"],
    company: pick("company"),
    role: pick("role"),
    contact: pick("contact"),
    dateFrom: pick("dateFrom"),
    dateTo: pick("dateTo"),
    sort: sort && isApplicationSort(sort) ? sort : DEFAULT_SORT,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize)
      ? Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE,
  };
}
