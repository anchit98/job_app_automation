export const JD_SOFT_CAP = 50_000;
const TRUNCATION_MARKER = "\n\n[…truncated]";

export function truncateJdIfNeeded(jd: string): {
  text: string;
  truncated: boolean;
} {
  if (jd.length <= JD_SOFT_CAP) {
    return { text: jd, truncated: false };
  }
  const budget = JD_SOFT_CAP - TRUNCATION_MARKER.length;
  return {
    text: `${jd.slice(0, budget)}${TRUNCATION_MARKER}`,
    truncated: true,
  };
}
