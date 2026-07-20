import type { Application } from "@/lib/db/types";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isLikelyDuplicate(
  candidate: { company?: string | null; role?: string | null },
  existing: Application,
): boolean {
  const cCompany = normalize(candidate.company);
  const cRole = normalize(candidate.role);
  const eCompany = normalize(existing.company);
  const eRole = normalize(existing.role);

  if (cCompany && cRole && cCompany === eCompany && cRole === eRole) {
    return true;
  }

  if (cCompany && cRole && eCompany && eRole) {
    const companyMatch =
      eCompany.includes(cCompany) || cCompany.includes(eCompany);
    const roleMatch = eRole.includes(cRole) || cRole.includes(eRole);
    if (companyMatch && roleMatch) return true;
  }

  return false;
}
