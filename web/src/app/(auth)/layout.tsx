import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-canvas">
      <div className="auth-bg" aria-hidden>
        <div className="auth-grid" />
        <div className="auth-aurora auth-aurora-a" />
        <div className="auth-aurora auth-aurora-b" />
        <div className="auth-aurora auth-aurora-c" />
        <div className="auth-ring auth-ring-a" />
        <div className="auth-ring auth-ring-b" />
        <div className="auth-dot auth-dot-a" />
        <div className="auth-dot auth-dot-b" />
        <div className="auth-dot auth-dot-c" />
      </div>
      <header className="relative z-20 shrink-0 border-b border-border-hairline bg-surface/95 backdrop-blur-md pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex h-12 max-w-content-max items-center justify-between gap-3 px-margin-mobile md:h-14 md:px-margin-desktop">
          <Link
            href="/"
            className="inline-flex items-center gap-2 no-underline"
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
            <span className="text-[18px] font-semibold tracking-tight text-primary">
              JobApp OS
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-on-surface-variant no-underline transition-colors hover:bg-[var(--ghost-hover)] hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden>
                home
              </span>
              Home
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-margin-mobile py-4 pb-4">
        <div className="auth-card-in w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
