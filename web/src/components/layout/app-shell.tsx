"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { PipelineKeeper } from "@/components/pipeline/pipeline-keeper";
import { ProfileMenu } from "@/components/layout/profile-menu";

const paidLinks = [
  { href: "/dashboard", icon: "home", label: "Home" },
  { href: "/apply", icon: "rocket_launch", label: "Quick Apply" },
  { href: "/applications", icon: "work", label: "Jobs" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/" || pathname.startsWith("/dashboard");
  }
  return pathname.startsWith(href);
}

export function AppShell({
  children,
  userEmail,
  userName,
  avatarSrc,
  isAdmin,
  isPaid = true,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  userName?: string | null;
  avatarSrc?: string | null;
  isAdmin?: boolean;
  isPaid?: boolean;
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
  const showApplicationSearch = isPaid && activePath === "/applications";
  const homeHref = isPaid ? "/dashboard" : "/billing";

  const navLinks = isPaid
    ? [
        ...paidLinks,
        ...(isAdmin
          ? [{ href: "/admin-center", icon: "admin_panel_settings", label: "Admin Center" }]
          : []),
      ]
    : [
        { href: "/billing", icon: "payments", label: "Billing" },
        { href: "/settings", icon: "settings", label: "Settings" },
      ];

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      {isPaid ? <PipelineKeeper /> : null}
      <header className="sticky top-0 z-50 h-nav-height bg-surface border-b border-border-hairline">
        <div className="mx-auto h-full max-w-content-max px-margin-mobile md:px-margin-desktop flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Link
              href={homeHref}
              prefetch
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
            {!isPaid ? (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-status-waiting/30 bg-status-waiting-container px-2.5 py-1 text-[11px] font-semibold text-status-waiting">
                <span className="material-symbols-outlined text-[14px]">lock</span>
                Locked until payment
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

          <nav className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            {navLinks.map((link) => {
              const active = isActive(activePath, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch
                  onClick={() => {
                    if (!isActive(pathname, link.href)) {
                      setOptimisticPath(link.href);
                    }
                  }}
                  className={`
                    flex flex-col items-center justify-center min-w-[52px] sm:min-w-[72px] px-1 py-1
                    border-b-2 transition-colors no-underline
                    ${
                      active
                        ? "border-on-surface text-on-surface"
                        : "border-transparent text-on-surface-variant hover:text-on-surface"
                    }
                  `}
                >
                  <span
                    className={`material-symbols-outlined text-[22px] ${active ? "filled" : ""}`}
                  >
                    {link.icon}
                  </span>
                  <span className="hidden sm:block text-[11px] font-semibold mt-0.5 leading-none">
                    {link.label}
                  </span>
                </Link>
              );
            })}
            {!isPaid
              ? paidLinks.map((link) => (
                  <Link
                    key={`locked-${link.href}`}
                    href="/billing"
                    prefetch
                    onClick={() => setOptimisticPath("/billing")}
                    title="Unlock with payment"
                    className="hidden md:flex flex-col items-center justify-center min-w-[72px] px-1 py-1 border-b-2 border-transparent text-on-surface-variant/50 no-underline hover:text-on-surface-variant"
                  >
                    <span className="relative material-symbols-outlined text-[22px]">
                      {link.icon}
                      <span
                        className="material-symbols-outlined absolute -right-1 -top-1 text-status-waiting"
                        style={{ fontSize: 12 }}
                      >
                        lock
                      </span>
                    </span>
                    <span className="text-[11px] font-semibold mt-0.5 leading-none">
                      {link.label}
                    </span>
                  </Link>
                ))
              : null}
            <ProfileMenu
              userEmail={userEmail}
              userName={userName}
              avatarSrc={avatarSrc}
              isAdmin={isAdmin}
              isPaid={isPaid}
            />
          </nav>
        </div>
      </header>

      <main
        className={`
          flex-1 w-full
          ${
            isWorkspace && isPaid
              ? "overflow-hidden"
              : "mx-auto max-w-content-max w-full px-margin-mobile md:px-margin-desktop py-4 md:py-5 pb-8"
          }
        `}
      >
        {children}
      </main>
    </div>
  );
}
