"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", icon: "home", label: "Home" },
  { href: "/apply", icon: "rocket_launch", label: "Quick Apply" },
  { href: "/applications", icon: "work", label: "Jobs" },
  { href: "/onboarding", icon: "person", label: "Profile" },
  { href: "/settings", icon: "settings", label: "Settings" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/" || pathname.startsWith("/dashboard");
  }
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWorkspace = pathname.startsWith("/applications/");

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="sticky top-0 z-50 h-nav-height bg-surface border-b border-border-hairline">
        <div className="mx-auto h-full max-w-content-max px-margin-mobile md:px-margin-desktop flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 shrink-0 no-underline"
            >
              <Image
                src="/brand/logo.svg"
                alt="ApplyForge"
                width={32}
                height={32}
                className="h-8 w-8 rounded-[4px]"
                priority
              />
              <span className="hidden sm:inline text-[20px] font-semibold text-primary tracking-tight">
                ApplyForge
              </span>
            </Link>
            <div className="hidden md:flex items-center gap-2 rounded-lg bg-surface-container-low border border-transparent focus-within:border-primary px-3 py-1.5 w-[280px]">
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
                    window.location.href = q
                      ? `/applications?q=${encodeURIComponent(q)}`
                      : "/applications";
                  }
                }}
              />
            </div>
          </div>

          <nav className="flex items-center gap-1 sm:gap-2">
            {links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`
                    flex flex-col items-center justify-center min-w-[52px] sm:min-w-[64px] px-1 py-1
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
            <Link
              href="/onboarding"
              className="ml-1 hidden sm:flex items-center no-underline"
              title="Profile"
            >
              <Image
                src="/profile-sm.webp"
                alt="Profile"
                width={28}
                height={28}
                className="h-7 w-7 rounded-full border border-border-hairline object-cover"
              />
            </Link>
          </nav>
        </div>
      </header>

      <main
        className={`
          flex-1 w-full
          ${
            isWorkspace
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
