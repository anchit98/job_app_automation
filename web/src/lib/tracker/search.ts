import type { ApplicationStatus } from "@/lib/applications/status";

export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 25;

export interface ApplicationSearchFilters {
  q?: string;
  status?: ApplicationStatus | "interview_stage";
  company?: string;
  role?: string;
  contact?: string;
  dateFrom?: string;
  dateTo?: string;
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
}

export interface ApplicationSearchResult {
  items: ApplicationListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Clean plain text for Postgres plainto_tsquery (no FTS5 quote syntax). */
export function buildFtsMatchQuery(q: string): string {
  const terms = q
    .trim()
    .replace(/[^\w\s@.-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (!terms.length) return "";
  return terms.join(" ");
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

  return {
    q: pick("q"),
    status: pick("status") as ApplicationSearchFilters["status"],
    company: pick("company"),
    role: pick("role"),
    contact: pick("contact"),
    dateFrom: pick("dateFrom"),
    dateTo: pick("dateTo"),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize)
      ? Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE,
  };
}
