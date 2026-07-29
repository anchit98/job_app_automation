import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-[100dvh] bg-canvas flex flex-col">
      <header className="sticky top-0 z-20 shrink-0 border-b border-border-hairline bg-surface/95 backdrop-blur-md pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex h-14 max-w-content-max items-center justify-between gap-3 px-margin-mobile md:px-margin-desktop">
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

      <div className="flex flex-1 flex-col items-center justify-center px-margin-mobile py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
