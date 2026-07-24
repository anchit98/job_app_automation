"use client";

import { initialsFromName } from "@/lib/profile-avatar";

const SIZE_CLASS: Record<number, string> = {
  28: "h-7 w-7 text-[11px]",
  32: "h-8 w-8 text-[12px]",
  48: "h-12 w-12 text-[16px]",
  56: "h-14 w-14 text-[18px]",
  64: "h-16 w-16 text-[20px]",
};

export function UserAvatar({
  src,
  name,
  size = 32,
  className = "",
}: {
  src?: string | null;
  name?: string | null;
  size?: 28 | 32 | 48 | 56 | 64;
  className?: string;
}) {
  const dim = SIZE_CLASS[size] ?? SIZE_CLASS[32];
  if (src) {
    return (
      // Dynamic user uploads; next/image remote patterns not needed for same-origin API.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`${dim} rounded-full object-cover border border-border-hairline shrink-0 ${className}`}
      />
    );
  }

  return (
    <span
      className={`${dim} inline-flex items-center justify-center rounded-full border border-border-hairline bg-primary-container text-primary font-semibold shrink-0 ${className}`}
      aria-hidden
    >
      {initialsFromName(name)}
    </span>
  );
}
