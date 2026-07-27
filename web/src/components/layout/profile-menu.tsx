"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { UserAvatar } from "@/components/ui/user-avatar";
import { signOut } from "@/app/actions/auth";

export function ProfileMenu({
  userEmail,
  userName,
  avatarSrc,
  isAdmin,
}: {
  userEmail?: string | null;
  userName?: string | null;
  avatarSrc?: string | null;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [logoutPending, startLogout] = useTransition();
  const { preference, resolved, cycle } = useTheme();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const themeLabel =
    preference === "system"
      ? `Theme · System (${resolved === "dark" ? "Dark" : "Light"})`
      : preference === "dark"
        ? "Theme · Dark"
        : "Theme · Light";

  const themeIcon =
    preference === "system"
      ? "contrast"
      : resolved === "dark"
        ? "dark_mode"
        : "light_mode";

  const displayName = userName?.trim() || "Me";

  return (
    <div ref={rootRef} className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-center min-w-[44px] px-1 py-1 rounded-full transition-opacity ${
          open ? "opacity-100" : "opacity-90 hover:opacity-100"
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        title="Me"
      >
        <UserAvatar src={avatarSrc} name={userName} size={28} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-[60] w-[260px] rounded-lg border border-border-hairline bg-surface shadow-[var(--shadow-card)] overflow-hidden"
        >
          <div className="flex items-center gap-3 px-3 py-3 border-b border-border-hairline">
            <UserAvatar src={avatarSrc} name={userName} size={48} />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-on-surface truncate">
                {displayName}
              </p>
              {userEmail ? (
                <p className="text-[12px] text-on-surface-variant truncate">
                  {userEmail}
                </p>
              ) : null}
            </div>
          </div>

          <div className="py-1">
            <MenuLink
              href="/onboarding"
              icon="person"
              label="View Profile"
              onNavigate={() => setOpen(false)}
            />
            <MenuLink
              href="/settings"
              icon="settings"
              label="Privacy & Settings"
              onNavigate={() => setOpen(false)}
            />
            {isAdmin ? (
              <MenuLink
                href="/admin-center"
                icon="admin_panel_settings"
                label="Admin Center"
                onNavigate={() => setOpen(false)}
              />
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => cycle()}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[14px] text-on-surface hover:bg-[var(--ghost-hover)]"
            >
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                {themeIcon}
              </span>
              <span className="flex-1">{themeLabel}</span>
            </button>
          </div>

          <div className="border-t border-border-hairline py-1">
            <button
              type="button"
              role="menuitem"
              disabled={logoutPending}
              onClick={() => {
                setOpen(false);
                startLogout(() => void signOut());
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[14px] text-on-surface hover:bg-[var(--ghost-hover)] disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                logout
              </span>
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: string;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      prefetch
      role="menuitem"
      onClick={onNavigate}
      className="flex items-center gap-3 px-3 py-2.5 text-[14px] text-on-surface no-underline hover:bg-[var(--ghost-hover)]"
    >
      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
        {icon}
      </span>
      {label}
    </Link>
  );
}
