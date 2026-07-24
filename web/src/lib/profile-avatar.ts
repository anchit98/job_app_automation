/** Public URL for the current user's avatar, with cache-busting. */
export function profileAvatarSrc(profile: {
  has_avatar?: boolean;
  updated_at?: string;
} | null | undefined): string | null {
  if (!profile?.has_avatar) return null;
  const v = profile.updated_at
    ? `?v=${encodeURIComponent(profile.updated_at)}`
    : "";
  return `/api/profile/avatar${v}`;
}

export function initialsFromName(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}
