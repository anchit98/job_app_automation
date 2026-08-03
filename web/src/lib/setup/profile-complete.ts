/** Shared profile-completion check for setup gate + onboarding UI. */
export function profileFieldsComplete(p: {
  full_name?: string | null;
  location?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
}): boolean {
  return Boolean(
    p.full_name?.trim() &&
      p.location?.trim() &&
      p.phone?.trim() &&
      p.linkedin_url?.trim(),
  );
}
