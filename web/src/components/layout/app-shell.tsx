"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { PipelineKeeper } from "@/components/pipeline/pipeline-keeper";
import { ProfileMenu } from "@/components/layout/profile-menu";

/**
 * The app's main navigation.
 *
 * Every account sees all of it. It used to be conditional on `isPaid`, from
 * when an unpaid account could reach nothing but /billing — there is no
 * paywall any more, so the only thing that still hides a destination is setup
 * not being finished, which is about whether the page can work rather than
 * about money.
 */
const mainLinks = [
  { href: "/dashboard", icon: "dashboard", label: "Dashboard" },
  { href: "/apply", icon: "rocket_launch", label: "Apply" },
  { href: "/applications", icon: "work", label: "Jobs" },
  { href: "/builder", icon: "draw", label: "Builder" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/" || pathname.startsWith("/dashboard");
  }
  if (href === "/applications") {
    return pathname === "/applications" || pathname.startsWith("/applications/");
  }
  if (href === "/apply") {
    return pathname === "/apply" || pathname.startsWith("/apply/");
  }
  if (href === "/builder") {
    return pathname === "/builder" || pathname.startsWith("/builder/");
  }
  if (href === "/onboarding") {
    return pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  userEmail,
  userName,
  avatarSrc,
  isAdmin,
  setupReady = true,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  userName?: string | null;
  avatarSrc?: string | null;
  isAdmin?: boolean;
  /** False until Google + profile + master resume are ready */
  setupReady?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isWorkspace = pathname.startsWith("/applications/");
  const [, startSearchNav] = useTransition();
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null);

  useEffect(() => {
    setOptimisticPath(null);
  }, [pathname]);

  const activePath = optimisticPath ?? pathname;
  const onBilling =
    pathname === "/billing" || pathname.startsWith("/billing/");
  const showApplicationSearch = setupReady && activePath === "/applications";
  const homeHref = setupReady ? "/dashboard" : "/onboarding";

  const setupLockedHrefs = new Set(["/dashboard", "/apply", "/applications"]);

  const navLinks = [
    ...mainLinks,
    ...(isAdmin
      ? [{ href: "/admin-center", icon: "admin_panel_settings", label: "Admin" }]
      : []),
    ...(!setupReady
      ? [{ href: "/onboarding", icon: "checklist", label: "Setup" }]
      : []),
  ];

  return (
    <div
      className={`app-shell bg-canvas flex flex-col ${
        onBilling
          ? "app-shell--flow min-h-0 flex-1 md:min-h-0 md:overflow-hidden"
          : "max-md:overflow-hidden md:min-h-[100dvh]"
      }`}
    >
      {!pathname.startsWith("/admin-center") &&
      !pathname.startsWith("/settings") &&
      !pathname.startsWith("/billing") ? (
        <PipelineKeeper />
      ) : null}
      <header className="z-50 shrink-0 bg-surface border-b border-border-hairline pt-[env(safe-area-inset-top,0px)] md:pt-0">
        <div className="mx-auto h-nav-height max-w-content-max px-margin-mobile md:px-margin-desktop flex items-center justify-between gap-2 md:gap-4">
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            <Link
              href={homeHref}
              prefetch={false}
              onClick={() => setOptimisticPath(homeHref)}
              className="flex items-center gap-2 shrink-0 no-underline"
            >
              <Image
                src="/brand/jobapp-os-logo.png"
                alt="JobApp OS"
                width={56}
                height={33}
                className="h-8 w-auto"
                priority
                unoptimized
              />
              <span className="hidden sm:inline text-[20px] font-semibold text-primary tracking-tight">
                JobApp OS
              </span>
            </Link>
            {!setupReady ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary max-md:px-2 max-md:py-0.5 max-md:text-[10px]">
                <span className="material-symbols-outlined text-[14px] max-md:text-[12px]">
                  checklist
                </span>
                <span className="sm:hidden">Setup</span>
                <span className="hidden sm:inline">Finish one-time setup</span>
              </span>
            ) : null}
            {showApplicationSearch ? (
              <div className="hidden md:flex items-center gap-2 rounded-lg bg-surface-container-low border border-transparent focus-within:border-primary px-3 py-1.5 w-full max-w-[320px]">
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">
                  search
                </span>
                <input
                  type="search"
                  placeholder="Search applications"
                  className="bg-transparent border-0 outline-none text-[14px] w-full text-on-surface placeholder:text-on-surface-variant"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const q = (e.target as HTMLInputElement).value.trim();
                      const href = q
                        ? `/applications?q=${encodeURIComponent(q)}`
                        : "/applications";
                      setOptimisticPath("/applications");
                      startSearchNav(() => {
                        router.push(href);
                      });
                    }
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <nav className="hidden md:flex items-center gap-0.5 sm:gap-1">
              {navLinks.map((link) => {
                const lockedBySetup =
                  !setupReady && setupLockedHrefs.has(link.href);
                const href = lockedBySetup ? "/onboarding" : link.href;
                const active = isActive(activePath, link.href);
                return (
                  <Link
                    key={link.href}
                    href={href}
                    prefetch={false}
                    title={
                      lockedBySetup
                        ? "Finish one-time setup first"
                        : undefined
                    }
                    onClick={() => {
                      if (!isActive(pathname, href)) {
                        setOptimisticPath(href);
                      }
                    }}
                    className={`
                      flex flex-col items-center justify-center min-w-[72px] px-1 py-1
                      border-b-2 transition-colors no-underline
                      ${
                        active
                          ? "border-on-surface text-on-surface"
                          : lockedBySetup
                            ? "border-transparent text-on-surface-variant/50"
                            : "border-transparent text-on-surface-variant hover:text-on-surface"
                      }
                    `}
                  >
                    <span
                      className={`relative material-symbols-outlined text-[22px] ${active ? "filled" : ""}`}
                    >
                      {link.icon}
                      {lockedBySetup ? (
                        <span
                          className="material-symbols-outlined absolute -right-1 -top-1 text-primary"
                          style={{ fontSize: 12 }}
                        >
                          lock
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[11px] font-semibold mt-0.5 leading-none">
                      {link.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
            <ProfileMenu
              userEmail={userEmail}
              userName={userName}
              avatarSrc={avatarSrc}
              isAdmin={isAdmin}
            />
          </div>
        </div>
      </header>

      <main
        className={`
          w-full min-w-0
          ${
            isWorkspace
              ? "flex-1 overflow-hidden min-h-0"
              : onBilling
                // `md:overflow-y-auto` here is necessary but not sufficient:
                // `.app-shell > main { overflow: visible }` in globals.css is
                // a more specific selector and wins. The scrolling is actually
                // turned on by the `.app-shell--flow > main` rule there, which
                // matches at equal specificity and comes later in the file.
                ? "relative flex flex-col w-full px-margin-mobile md:px-margin-desktop py-3 md:py-4 pb-3 md:flex-1 md:min-h-0 md:overflow-y-auto"
                : "flex-1 mx-auto max-w-content-max w-full px-margin-mobile md:px-margin-desktop py-4 md:py-5 pb-8 max-md:min-h-0 max-md:overflow-y-auto max-md:py-3 max-md:pb-3"
          }
        `}
      >
        {children}
      </main>

      <nav
        className="md:hidden shrink-0 z-50 border-t border-border-hairline bg-surface pb-[env(safe-area-inset-bottom,0px)]"
        aria-label="Primary"
      >
        <div className="mx-auto flex h-14 max-w-content-max items-stretch justify-around px-1">
          {navLinks.map((link) => {
            const lockedBySetup =
              !setupReady && setupLockedHrefs.has(link.href);
            const href = lockedBySetup ? "/onboarding" : link.href;
            const active = isActive(activePath, link.href);
            return (
              <Link
                key={`mobile-${link.href}`}
                href={href}
                prefetch={false}
                title={
                  lockedBySetup ? "Finish one-time setup first" : undefined
                }
                onClick={() => {
                  if (!isActive(pathname, href)) {
                    setOptimisticPath(href);
                  }
                }}
                className={`
                  flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 no-underline
                  ${active ? "text-primary" : lockedBySetup ? "text-on-surface-variant/50" : "text-on-surface-variant"}
                `}
              >
                <span
                  className={`relative material-symbols-outlined text-[24px] ${active ? "filled" : ""}`}
                >
                  {link.icon}
                  {lockedBySetup ? (
                    <span
                      className="material-symbols-outlined absolute -right-1 -top-0.5 text-primary"
                      style={{ fontSize: 11 }}
                    >
                      lock
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate text-[10px] font-semibold leading-none">
                  {link.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
