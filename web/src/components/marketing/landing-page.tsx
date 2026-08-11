"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LandingGallery } from "@/components/marketing/landing-gallery";
import { LandingAgentVisual } from "@/components/marketing/landing-agent-visual";

type NavItem = { href: string; label: string };
type NavEntry = NavItem | { label: string; items: NavItem[] };

const navEntries: NavEntry[] = [
  {
    label: "Product",
    items: [
      { href: "#how-it-works", label: "How it works" },
      { href: "#features", label: "Features" },
      { href: "#google-access", label: "Google access" },
      { href: "#gallery", label: "Screenshots" },
    ],
  },
  {
    label: "Why JobApp OS",
    items: [
      { href: "#benefits", label: "Benefits" },
      { href: "#tips", label: "Insider tips" },
      { href: "#ai", label: "How AI is used" },
    ],
  },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  {
    label: "Support",
    items: [
      { href: "/contact", label: "Contact Us" },
      { href: "/privacy-policy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
];

const heroChips = [
  { icon: "verified", label: "Fully customizable" },
  { icon: "cloud", label: "Runs in the cloud" },
  { icon: "drafts", label: "Draft-only outreach" },
];

const features = [
  {
    icon: "rocket_launch",
    title: "Apply",
    body: "Paste a job description with company and role. JobApp OS runs the full pipeline in the cloud: resume, cover letter, contacts, cold emails, and Gmail drafts.",
  },
  {
    icon: "auto_awesome",
    title: "Server-side AI",
    body: "Generations run automatically on JobApp OS servers. Paste a job description and the agent completes each stage without leaving the app.",
  },
  {
    icon: "work",
    title: "Jobs tracker",
    body: "Every application stays in one place with status, contacts, versions, notes, and search when the volume climbs.",
  },
  {
    icon: "mail",
    title: "Gmail drafts and follow-ups",
    body: "Outreach lands as drafts you send when ready. Scheduled follow-ups enqueue on your timeline without auto-sending.",
  },
  {
    icon: "tune",
    title: "Fully customizable agent",
    body: "Shape your profile, master resume, cover letter, and prompt templates so every run sounds like you, not a generic template.",
  },
  {
    icon: "monitoring",
    title: "Dashboard command center",
    body: "Pipeline metrics, application status, and due follow-ups sit on one screen so you always know what needs attention next.",
  },
];

const benefits = [
  {
    icon: "hub",
    title: "Stop juggling ten tools",
    body: "LinkedIn, documents, Gmail, trackers, and reminders collapse into one personal application OS.",
  },
  {
    icon: "auto_fix_high",
    title: "Every application is tailored",
    body: "Resumes and outreach bend to each job description while staying anchored to your real experience.",
  },
  {
    icon: "verified_user",
    title: "You stay in control",
    body: "Emails are drafts. Sends stay manual. The agent prepares the work; you approve what goes out.",
  },
  {
    icon: "stacked_line_chart",
    title: "Built for serious volume",
    body: "When you apply to many roles, tracking, follow-ups, and consistency matter as much as the first draft.",
  },
];

const insiderTips = [
  {
    icon: "bolt",
    tag: "Speed hack",
    title: "Catch jobs posted in the last hour",
    body: "A hidden LinkedIn filter surfaces roles posted in the last 60 minutes. Apply first with a tailored resume before hundreds of applicants pile in — early applicants get shortlisted far more often.",
    points: ["One-click filter on your dashboard", "Newest roles, sorted first"],
  },
  {
    icon: "alternate_email",
    tag: "Outreach hack",
    title: "Find any recruiter's email — free",
    body: "No contact at the company? Find talent partners on LinkedIn and turn their profile into a verified work email in seconds, no signup needed. Cold-emailing 2–3 decision makers per role strengthens every application.",
    points: ["Guided inside the Apply flow", "Drafts written for you"],
  },
];

const aiPoints = [
  {
    icon: "psychology",
    title: "AI in the workflow",
    body: "JobApp OS composes structured prompts from your profile and the job description, then validates AI responses before they enter your pipeline.",
  },
  {
    icon: "bolt",
    title: "Runs end to end for you",
    body: "Paste a JD and start Apply. Stages complete automatically on the server while you watch progress or leave the tab open.",
  },
  {
    icon: "build",
    title: "Repair when output breaks",
    body: "If a response fails validation, the system generates a repair pass instead of silently accepting bad data.",
  },
  {
    icon: "lock",
    title: "Grounded in your materials",
    body: "Outputs stay anchored to your master resume and cover letter. Metrics and claims are checked so the agent does not invent experience.",
  },
];

const faqs = [
  {
    q: "What does JobApp OS access in my Google account?",
    a: "With your consent, JobApp OS uses Google Drive and Google Docs only for files you choose or that the app creates (tailored resumes, cover letters, PDFs), and uses Gmail to create outreach drafts — not to send mail for you. You can revoke access anytime in your Google Account settings. See our Privacy Policy for full details.",
  },
  {
    q: "Will emails ever be sent without my approval?",
    a: "Never. Everything lands in your Gmail as a draft — cold emails and follow-ups included. You review, edit if you like, and hit send yourself. JobApp OS does not send cold outreach or follow-ups for you.",
  },
  {
    q: "Will the AI invent experience I don't have?",
    a: "No. Every resume and cover letter is anchored to your master resume, and outputs pass fabrication checks before they enter your pipeline. The AI rephrases and reprioritizes your real experience — it doesn't create fake claims or metrics.",
  },
  {
    q: "Do I need my own AI subscription or API keys?",
    a: "No. Generation runs on JobApp OS servers and is included in the one-time price. You don't need ChatGPT Plus, API keys, or any other AI account.",
  },
  {
    q: "Are the generated resumes ATS-friendly?",
    a: "Yes. Resumes are clean, single-page, text-based PDFs built from Google Docs — no graphics, tables, or columns that trip up applicant tracking systems. Keywords from the job description are worked into your real experience.",
  },
  {
    q: "How long does one application take?",
    a: "A few minutes end to end. Text generation finishes first, PDFs upload to Drive automatically, and Gmail drafts are created once documents are ready — you can watch each stage live on the pipeline page.",
  },
  {
    q: "Is cold-emailing recruiters allowed?",
    a: "Yes. You're sending a personal, one-to-one note from your own Gmail to a publicly listed professional — that's networking, not spam. Drafts are personalized per contact, and since you send manually, you stay in full control of tone and timing.",
  },
  {
    q: "What happens if a step fails mid-run?",
    a: "The pipeline validates every AI response and automatically runs a repair pass if something is malformed. If a stage still fails, it's marked clearly on the pipeline page and you can retry just that stage — no need to start over.",
  },
];

const workflowSteps = [
  {
    step: "01",
    icon: "person_add",
    title: "Sign up",
    body: "Create your JobApp OS account with your email — it takes under a minute.",
  },
  {
    step: "02",
    icon: "link",
    title: "Connect your Google account",
    body: "Grant permission for Google Drive, Docs, and Gmail drafts so documents and outreach can be prepared for you.",
  },
  {
    step: "03",
    icon: "description",
    title: "Set up your master resume",
    body: "Fill in your profile and sync your master resume and cover letter from Google Docs — the source of truth for every application.",
  },
  {
    step: "04",
    icon: "content_paste",
    title: "Paste a job description",
    body: "Add the company, role, and full job description to start an Apply run.",
  },
  {
    step: "05",
    icon: "auto_awesome",
    title: "AI generates your application",
    body: "A tailored resume, cover letter, and personalized outreach emails are generated, validated, and saved to your Drive as PDFs.",
  },
  {
    step: "06",
    icon: "send",
    title: "Review, send, and track",
    body: "Check the Gmail drafts, send them yourself, and track every application, reply, and follow-up on the dashboard.",
  },
];

const googleAccessPoints = [
  {
    icon: "folder_open",
    title: "Google Drive & Docs",
    body: "Creates a JobApp OS folder in your Drive and builds your tailored resume and cover letter as Google Docs there, then exports the PDFs you attach to applications.",
  },
  {
    icon: "drafts",
    title: "Gmail — drafts only",
    body: "Writes outreach and follow-up emails as drafts in your Gmail, attaching the finished PDFs. Nothing is ever sent automatically — you review and press send yourself.",
  },
  {
    icon: "mark_email_read",
    title: "Reply tracking, scoped tightly",
    body: "Where you grant read access, JobApp OS only looks up the application threads it created for you, so follow-ups land in the right conversation. Unrelated email is never read.",
  },
  {
    icon: "verified_user",
    title: "You stay in control",
    body: "Access is used only after you grant permission and only for these features. Your data is never sold or shared with third parties, and you can revoke access anytime in your Google Account settings.",
  },
];

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -48px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`mk-reveal ${inView ? "is-in" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  align?: "left" | "center";
}) {
  return (
    <Reveal
      className={
        align === "center"
          ? "mx-auto max-w-3xl text-center"
          : "mx-auto max-w-3xl text-center sm:mx-0 sm:text-left"
      }
    >
      <p
        className={`mk-eyebrow inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--primary)] ${
          align === "center" ? "justify-center" : "justify-center sm:justify-start"
        }`}
      >
        <span className="mk-eyebrow-line" aria-hidden />
        {eyebrow}
      </p>
      <h2 className="marketing-display mt-3 text-[30px] font-bold leading-[1.12] tracking-tight text-[var(--on-surface)] sm:text-[38px]">
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 text-[16px] leading-7 text-[var(--on-surface-variant)] sm:text-[17px]">
          {lead}
        </p>
      ) : null}
    </Reveal>
  );
}

function FaqList() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mx-auto mt-10 max-w-3xl space-y-3">
      {faqs.map((faq, index) => {
        const open = openIndex === index;
        return (
          <Reveal key={faq.q} delay={Math.min(index, 4) * 60}>
            <div
              className={`overflow-hidden rounded-2xl border transition-colors duration-200 ${
                open
                  ? "border-[color-mix(in_srgb,var(--primary)_35%,var(--border-hairline))] bg-[var(--surface)] shadow-[0_14px_34px_-26px_color-mix(in_srgb,var(--primary)_45%,transparent)]"
                  : "border-[var(--border-hairline)] bg-[var(--surface)] hover:border-[color-mix(in_srgb,var(--primary)_25%,var(--border-hairline))]"
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : index)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span
                  className={`text-[15px] font-bold leading-6 transition-colors ${
                    open ? "text-[var(--primary)]" : "text-[var(--on-surface)]"
                  }`}
                >
                  {faq.q}
                </span>
                <span
                  className={`material-symbols-outlined shrink-0 text-[20px] transition-transform duration-200 ${
                    open
                      ? "rotate-180 text-[var(--primary)]"
                      : "text-[var(--on-surface-variant)]"
                  }`}
                  aria-hidden
                >
                  expand_more
                </span>
              </button>
              <div
                className={`grid transition-all duration-300 ease-out ${
                  open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                    {faq.a}
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

export function LandingPage() {
  const year = new Date().getFullYear();
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  useEffect(() => {
    if (!openDropdown) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenDropdown(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openDropdown]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 12);
      setShowTop(y > 420);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="marketing-page bg-[var(--canvas)] text-[var(--on-surface)]">
      <header
        className={`marketing-nav sticky top-0 z-50 transition-all duration-300 ${
          scrolled || menuOpen
            ? "border-b border-[var(--border-hairline)] bg-[var(--surface)]/85 shadow-[0_8px_30px_-18px_rgba(0,0,0,0.25)] backdrop-blur-xl"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a
            href="#top"
            className="flex items-center gap-2.5 no-underline"
            onClick={closeMenu}
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
            <span className="marketing-display text-[18px] font-bold tracking-tight text-[var(--primary)]">
              JobApp OS
            </span>
          </a>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Page">
            {navEntries.map((entry) =>
              "items" in entry ? (
                <div key={entry.label} className="relative">
                  <button
                    type="button"
                    className="mk-nav-link inline-flex items-center gap-0.5 bg-transparent"
                    aria-haspopup="menu"
                    aria-expanded={openDropdown === entry.label}
                    onClick={() =>
                      setOpenDropdown((open) =>
                        open === entry.label ? null : entry.label,
                      )
                    }
                  >
                    {entry.label}
                    <span
                      className={`material-symbols-outlined text-[17px] transition-transform duration-200 ${
                        openDropdown === entry.label ? "rotate-180" : ""
                      }`}
                      aria-hidden
                    >
                      expand_more
                    </span>
                  </button>
                  {openDropdown === entry.label ? (
                    <>
                      <button
                        type="button"
                        aria-label="Close menu"
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={() => setOpenDropdown(null)}
                        tabIndex={-1}
                      />
                      <div
                        role="menu"
                        className="absolute left-0 top-[calc(100%+8px)] z-50 w-52 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] py-1.5 shadow-[0_18px_44px_-18px_rgba(0,0,0,0.35)]"
                      >
                        {entry.items.map((item) => {
                          const itemClass =
                            "block px-4 py-2.5 text-[13px] font-semibold text-[var(--on-surface)] no-underline transition-colors hover:bg-[var(--ghost-hover)] hover:text-[var(--primary)]";
                          return item.href.startsWith("/") ? (
                            <Link
                              key={item.href}
                              href={item.href}
                              role="menuitem"
                              className={itemClass}
                              onClick={() => setOpenDropdown(null)}
                            >
                              {item.label}
                            </Link>
                          ) : (
                            <a
                              key={item.href}
                              href={item.href}
                              role="menuitem"
                              className={itemClass}
                              onClick={() => setOpenDropdown(null)}
                            >
                              {item.label}
                            </a>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : entry.href.startsWith("/") ? (
                <Link key={entry.href} href={entry.href} className="mk-nav-link">
                  {entry.label}
                </Link>
              ) : (
                <a key={entry.href} href={entry.href} className="mk-nav-link">
                  {entry.label}
                </a>
              ),
            )}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <Link
              href="/login"
              className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-[var(--on-surface)] no-underline transition-colors hover:bg-[var(--ghost-hover)]"
            >
              Log in
            </Link>
            <Link href="/signup" className="mk-btn mk-btn-primary px-4 py-2 text-[13px]">
              Sign up
              <span className="material-symbols-outlined mk-btn-arrow text-[16px]">
                arrow_forward
              </span>
            </Link>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--on-surface)] transition-colors hover:bg-[var(--ghost-hover)] lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="material-symbols-outlined text-[24px]" aria-hidden>
              {menuOpen ? "close" : "menu"}
            </span>
          </button>
        </div>

        {menuOpen ? (
          <div
            id="mobile-nav-menu"
            className="border-t border-[var(--border-hairline)] bg-[var(--surface)] lg:hidden"
          >
            <nav
              className="mx-auto flex max-w-6xl flex-col gap-0.5 px-4 py-3 sm:px-6"
              aria-label="Mobile"
            >
              {navEntries.map((entry) =>
                "items" in entry ? (
                  <div key={entry.label}>
                    <p className="px-3 pb-1 pt-3 text-[11.5px] font-bold uppercase tracking-[0.14em] text-[var(--on-surface-variant)]">
                      {entry.label}
                    </p>
                    {entry.items.map((item) => {
                      const itemClass =
                        "block rounded-lg py-2.5 pl-6 pr-3 text-[15px] font-semibold text-[var(--on-surface)] no-underline transition-colors hover:bg-[var(--ghost-hover)]";
                      return item.href.startsWith("/") ? (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={itemClass}
                          onClick={closeMenu}
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <a
                          key={item.href}
                          href={item.href}
                          className={itemClass}
                          onClick={closeMenu}
                        >
                          {item.label}
                        </a>
                      );
                    })}
                  </div>
                ) : entry.href.startsWith("/") ? (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    className="rounded-lg px-3 py-2.5 text-[15px] font-semibold text-[var(--on-surface)] no-underline transition-colors hover:bg-[var(--ghost-hover)]"
                    onClick={closeMenu}
                  >
                    {entry.label}
                  </Link>
                ) : (
                  <a
                    key={entry.href}
                    href={entry.href}
                    className="rounded-lg px-3 py-2.5 text-[15px] font-semibold text-[var(--on-surface)] no-underline transition-colors hover:bg-[var(--ghost-hover)]"
                    onClick={closeMenu}
                  >
                    {entry.label}
                  </a>
                ),
              )}
              <div className="mt-2 flex flex-col gap-2 border-t border-[var(--border-hairline)] pt-3">
                <Link
                  href="/login"
                  className="rounded-lg px-3 py-2.5 text-center text-[15px] font-semibold text-[var(--on-surface)] no-underline transition-colors hover:bg-[var(--ghost-hover)]"
                  onClick={closeMenu}
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="mk-btn mk-btn-primary w-full justify-center px-4 py-2.5 text-[14px]"
                  onClick={closeMenu}
                >
                  Sign up
                  <span className="material-symbols-outlined mk-btn-arrow text-[16px]">
                    arrow_forward
                  </span>
                </Link>
              </div>
            </nav>
          </div>
        ) : null}
      </header>

      <main id="top">
        <section className="marketing-hero relative overflow-hidden">
          <div className="marketing-hero-grid" aria-hidden />
          <span className="marketing-aurora marketing-aurora-a" aria-hidden />
          <span className="marketing-aurora marketing-aurora-b" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-16 lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-8 lg:pb-28 lg:pt-24">
            <div className="text-center sm:text-left lg:col-span-6">
              <Reveal>
                <p className="mk-hero-badge">
                  <span className="marketing-pulse-dot" aria-hidden />
                  Your personalized job application AI agent
                </p>
              </Reveal>
              <Reveal delay={90}>
                <h1 className="marketing-display mt-5 text-[44px] font-extrabold leading-[1.02] tracking-[-0.02em] sm:text-[60px] lg:text-[68px]">
                  <span className="marketing-gradient-text">JobApp OS</span>
                  <span className="mt-2 block text-[26px] font-bold leading-[1.15] tracking-[-0.01em] text-[var(--on-surface)] sm:text-[34px] lg:text-[38px]">
                    Applications customized for you
                  </span>
                </h1>
              </Reveal>
              <Reveal delay={180}>
                <p className="mx-auto mt-5 max-w-xl text-[16px] leading-7 text-[var(--on-surface-variant)] sm:mx-0 sm:text-[18px] sm:leading-8">
                  JobApp OS is a job application automation web app. Paste a
                  job description to generate tailored resumes and cover
                  letters, store them in your Google Drive and Google Docs,
                  prepare Gmail drafts for outreach and follow-ups, and track
                  every application in one dashboard. You review and send all
                  emails yourself.
                </p>
              </Reveal>
              <Reveal delay={260}>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                  <Link
                    href="/signup"
                    className="mk-btn mk-btn-primary min-h-13 px-7 text-[15px]"
                  >
                    Sign up free
                    <span className="material-symbols-outlined mk-btn-arrow text-[18px]">
                      arrow_forward
                    </span>
                  </Link>
                  <Link
                    href="/login"
                    className="mk-btn mk-btn-outline min-h-13 px-7 text-[15px]"
                  >
                    Log in
                  </Link>
                </div>
              </Reveal>
              <Reveal delay={340}>
                <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
                  {heroChips.map((chip) => (
                    <span key={chip.label} className="mk-chip">
                      <span className="material-symbols-outlined text-[15px]">
                        {chip.icon}
                      </span>
                      {chip.label}
                    </span>
                  ))}
                </div>
              </Reveal>
              <Reveal delay={420}>
                <p className="mt-6 text-[13px] font-medium text-[var(--on-surface-variant)]">
                  Launch offer for the first 100 buyers:{" "}
                  <span className="price-display font-bold text-[var(--primary)]">₹299</span>
                  {" "}· lifetime access · 60 applications included.
                </p>
              </Reveal>
            </div>
            <Reveal delay={200} className="lg:col-span-6">
              <LandingAgentVisual />
            </Reveal>
          </div>
        </section>

        <section
          id="how-it-works"
          className="marketing-section border-t border-[var(--border-hairline)]"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="How it works"
              title="From sign-up to sent application"
              lead="JobApp OS helps job seekers automate applications end to end: tailor resumes and cover letters from a pasted job description, save materials to Google Drive/Docs, prepare Gmail drafts for recruiters, schedule follow-up reminders, and track every role in one place — while you stay in control of what gets sent."
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {workflowSteps.map((item, index) => (
                <Reveal key={item.step} delay={(index % 3) * 110}>
                  <article className="marketing-panel mk-step-card h-full rounded-2xl p-6 text-center sm:text-left">
                    <div className="flex items-center justify-between">
                      <span className="mk-icon-tile">
                        <span className="material-symbols-outlined text-[22px]">
                          {item.icon}
                        </span>
                      </span>
                      <span className="marketing-display mk-step-number text-[40px] font-extrabold leading-none">
                        {item.step}
                      </span>
                    </div>
                    <h3 className="mt-5 text-[18px] font-bold">{item.title}</h3>
                    <p className="mt-2 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                      {item.body}
                    </p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="marketing-section">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Features"
              title="Everything your application agent needs"
              align="center"
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, index) => (
                <Reveal key={feature.title} delay={(index % 3) * 110}>
                  <article className="marketing-panel h-full rounded-2xl p-6 text-center sm:text-left">
                    <span className="mk-icon-tile">
                      <span className="material-symbols-outlined text-[22px]">
                        {feature.icon}
                      </span>
                    </span>
                    <h3 className="mt-4 text-[17px] font-bold">{feature.title}</h3>
                    <p className="mt-2 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                      {feature.body}
                    </p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section
          id="google-access"
          className="marketing-section border-t border-[var(--border-hairline)] bg-[var(--surface-container-low)]"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Google permissions"
              title="Why connect your Google account?"
              lead="JobApp OS uses your Google account only after you grant permission, and only to power the features below. Nothing is emailed on your behalf, and your data is never shared with third parties."
              align="center"
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2">
              {googleAccessPoints.map((point, index) => (
                <Reveal key={point.title} delay={(index % 2) * 110}>
                  <article className="marketing-panel flex h-full flex-col items-center gap-5 rounded-2xl p-6 text-center sm:flex-row sm:items-start sm:text-left">
                    <span className="mk-icon-tile shrink-0">
                      <span className="material-symbols-outlined text-[22px]">
                        {point.icon}
                      </span>
                    </span>
                    <div>
                      <h3 className="text-[17px] font-bold">{point.title}</h3>
                      <p className="mt-2 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                        {point.body}
                      </p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
            <Reveal delay={120}>
              <p className="mt-8 text-center text-[14px] text-[var(--on-surface-variant)]">
                Full details on what we access, why, and how it&apos;s protected
                are in our{" "}
                <Link
                  href="/privacy-policy"
                  className="font-semibold text-[var(--primary)] no-underline hover:underline"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </Reveal>
          </div>
        </section>

        <section
          id="benefits"
          className="marketing-section mk-benefits border-y border-[var(--border-hairline)]"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Why you should have one"
              title="Why a personalized application agent wins"
              align="center"
            />
            <div className="mt-12 grid gap-5 lg:grid-cols-2">
              {benefits.map((benefit, index) => (
                <Reveal key={benefit.title} delay={(index % 2) * 110}>
                  <article className="marketing-panel flex h-full flex-col items-center gap-5 rounded-2xl p-6 text-center sm:flex-row sm:items-stretch sm:text-left">
                    <span className="mk-icon-tile shrink-0">
                      <span className="material-symbols-outlined text-[22px]">
                        {benefit.icon}
                      </span>
                    </span>
                    <div>
                      <h3 className="text-[18px] font-bold">{benefit.title}</h3>
                      <p className="mt-2 text-[15px] leading-7 text-[var(--on-surface-variant)]">
                        {benefit.body}
                      </p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="tips" className="marketing-section">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Insider tips"
              title="Hacks that get you seen before everyone else"
              lead="JobApp OS doesn't just automate paperwork — it coaches you with proven job-hunt tactics, built right into the dashboard and Apply flow."
              align="center"
            />
            <div className="mt-12 grid gap-5 lg:grid-cols-2">
              {insiderTips.map((tip, index) => (
                <Reveal key={tip.title} delay={(index % 2) * 110}>
                  <article className="marketing-panel h-full rounded-2xl p-6 text-center sm:text-left">
                    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <span className="mk-icon-tile">
                        <span className="material-symbols-outlined text-[22px]">
                          {tip.icon}
                        </span>
                      </span>
                      <span className="mk-chip text-[12px]">
                        <span className="material-symbols-outlined text-[14px]">
                          tips_and_updates
                        </span>
                        {tip.tag}
                      </span>
                    </div>
                    <h3 className="mt-5 text-[18px] font-bold">{tip.title}</h3>
                    <p className="mt-2 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                      {tip.body}
                    </p>
                    <ul className="mt-4 space-y-2">
                      {tip.points.map((point) => (
                        <li
                          key={point}
                          className="flex items-center justify-center gap-2 text-[13.5px] font-semibold sm:justify-start"
                        >
                          <span className="material-symbols-outlined text-[17px] text-[var(--success)]">
                            check_circle
                          </span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="ai" className="marketing-section">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-12 lg:items-start">
              <div className="lg:col-span-5 lg:sticky lg:top-24">
                <SectionHeading
                  eyebrow="How AI is leveraged"
                  title="AI that prepares. You that decide."
                  lead="JobApp OS treats AI as the reasoning engine inside a structured agent workflow. Generations run on the server from your materials, responses are validated, and outbound mail stays draft-only until you send it from Gmail."
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:col-span-7">
                {aiPoints.map((point, index) => (
                  <Reveal key={point.title} delay={(index % 2) * 110}>
                    <article className="marketing-panel h-full rounded-2xl p-6 text-center sm:text-left">
                      <span className="mk-icon-tile">
                        <span className="material-symbols-outlined text-[22px]">
                          {point.icon}
                        </span>
                      </span>
                      <h3 className="mt-4 text-[16px] font-bold">{point.title}</h3>
                      <p className="mt-2 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                        {point.body}
                      </p>
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          id="gallery"
          className="marketing-section border-t border-[var(--border-hairline)] bg-[var(--surface-container-low)]"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Gallery"
              title="See the agent at work"
              lead="Explore the screens that matter most when you are moving many applications at once."
              align="center"
            />
            <Reveal delay={140}>
              <div className="mt-10">
                <LandingGallery />
              </div>
            </Reveal>
          </div>
        </section>

        <section id="pricing" className="marketing-section">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="marketing-pricing relative overflow-hidden rounded-[24px] px-5 py-10 sm:rounded-[28px] sm:px-10 sm:py-14">
                <div className="marketing-pricing-glow" aria-hidden />
                <div className="relative grid gap-10 lg:grid-cols-12 lg:items-center">
                  <div className="text-center sm:text-left lg:col-span-7">
                    <p className="mk-offer-badge">
                      <span className="material-symbols-outlined text-[15px]">
                        bolt
                      </span>
                      Limited launch offer · first 100 buyers
                    </p>
                    <h2 className="marketing-display mt-5 text-[30px] font-bold leading-[1.12] tracking-tight sm:text-[38px]">
                      Lifetime access. 60 applications included.
                    </h2>
                    <p className="mx-auto mt-4 max-w-xl text-[16px] leading-7 text-[var(--on-surface-variant)] sm:mx-0">
                      One payment unlocks JobApp OS forever — profile, tracker,
                      drafts, and the full Apply pipeline. This launch price
                      includes 60 tailored applications; tiers and top-ups come
                      later as usage grows.
                    </p>
                    <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                      {[
                        "Lifetime product access",
                        "60 Apply runs included",
                        "Resume, cover letter & cold emails",
                        "One-time setup support",
                      ].map((item) => (
                        <li
                          key={item}
                          className="flex items-center justify-center gap-2.5 text-[14px] font-semibold sm:justify-start"
                        >
                          <span className="material-symbols-outlined text-[18px] text-[var(--success)]">
                            check_circle
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="lg:col-span-5">
                    <div className="mk-price-card rounded-2xl p-6 text-center sm:p-7">
                      <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--on-surface-variant)]">
                        First 100 buyers
                      </p>
                      <div className="mt-4 flex items-center justify-center gap-3">
                        <span className="text-[26px] font-semibold text-[var(--on-surface-variant)] line-through decoration-[var(--error)]/60 decoration-2 price-display">
                          ₹699
                        </span>
                        <span className="price-display marketing-gradient-text text-[52px] font-bold leading-none sm:text-[58px]">
                          ₹299
                        </span>
                      </div>
                      <p className="mt-3 text-[13px] leading-5 text-[var(--on-surface-variant)]">
                        One-time. Lifetime access. 60 applications included.
                      </p>
                      <Link
                        href="/signup"
                        className="mk-btn mk-btn-primary mt-7 min-h-13 w-full text-[15px]"
                      >
                        Claim the offer
                        <span className="material-symbols-outlined mk-btn-arrow text-[18px]">
                          arrow_forward
                        </span>
                      </Link>
                      <Link
                        href="/login"
                        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg text-[14px] font-semibold text-[var(--primary)] no-underline transition-colors hover:bg-[var(--secondary-hover)]"
                      >
                        Already have an account? Log in
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <aside className="mx-auto mt-6 max-w-3xl overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--primary)_28%,var(--border-hairline))] bg-[linear-gradient(118deg,color-mix(in_srgb,var(--primary-container)_70%,var(--surface))_0%,var(--surface)_52%,color-mix(in_srgb,var(--tertiary-container)_40%,var(--surface))_100%)] px-5 py-5 text-center shadow-[0_14px_34px_-26px_color-mix(in_srgb,var(--primary)_40%,transparent)] sm:px-7 sm:py-6 sm:text-left">
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4">
                  <span className="mk-icon-tile shrink-0">
                    <span className="material-symbols-outlined text-[22px]">
                      lightbulb
                    </span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold leading-snug text-[var(--on-surface)] sm:text-[16px]">
                      Why not just DIY?
                    </p>
                    <p className="mt-1.5 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                      Doing this alone means rewriting resumes, cover letters,
                      and outreach for every role, plus juggling Docs, Gmail,
                      and a tracker. JobApp OS turns a pasted JD into tailored
                      docs and draft emails in minutes — so you apply earlier,
                      more often, and with less busywork.
                    </p>
                  </div>
                </div>
              </aside>
            </Reveal>
          </div>
        </section>

        <section
          id="faq"
          className="marketing-section border-t border-[var(--border-hairline)]"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="FAQ"
              title="Questions people usually ask"
              lead="Short answers to the doubts that come up before signing up."
              align="center"
            />
            <FaqList />
            <Reveal delay={120}>
              <p className="mt-8 text-center text-[14px] text-[var(--on-surface-variant)]">
                Still curious?{" "}
                <Link
                  href="/signup"
                  className="font-semibold text-[var(--primary)] no-underline hover:underline"
                >
                  Sign up free
                </Link>{" "}
                and see the pipeline run for yourself.
              </p>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border-hairline)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="mx-auto max-w-sm text-center sm:mx-0 sm:text-left lg:col-span-5">
            <div className="flex items-center justify-center gap-2.5 sm:justify-start">
              <Image
                src="/brand/jobapp-os-logo.png"
                alt=""
                width={48}
                height={28}
                className="h-7 w-auto"
                unoptimized
              />
              <span className="marketing-display text-[18px] font-bold text-[var(--primary)]">
                JobApp OS
              </span>
            </div>
            <p className="mt-4 text-[14px] leading-6 text-[var(--on-surface-variant)]">
              JobApp OS — job application automation for tailored resumes and
              cover letters, Google Drive/Docs storage, Gmail drafts, and
              application tracking.{" "}
              <Link
                href="/privacy-policy"
                className="font-semibold text-[var(--primary)] underline underline-offset-2"
              >
                Privacy Policy
              </Link>
              {" · "}
              <Link
                href="/terms"
                className="font-semibold text-[var(--primary)] underline underline-offset-2"
              >
                Terms
              </Link>
              {" · "}
              <Link
                href="/contact"
                className="font-semibold text-[var(--primary)] underline underline-offset-2"
              >
                Contact Us
              </Link>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 text-center sm:grid-cols-3 sm:text-left lg:col-span-7">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--on-surface-variant)]">
                Product
              </p>
              <ul className="mt-4 space-y-2.5 text-[14px]">
                <li>
                  <a href="#how-it-works" className="mk-footer-link">
                    How it works
                  </a>
                </li>
                <li>
                  <a href="#features" className="mk-footer-link">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#google-access" className="mk-footer-link">
                    Google access
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="mk-footer-link">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#gallery" className="mk-footer-link">
                    Screenshots
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--on-surface-variant)]">
                Account
              </p>
              <ul className="mt-4 space-y-2.5 text-[14px]">
                <li>
                  <Link href="/signup" className="mk-footer-link">
                    Sign up
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="mk-footer-link">
                    Log in
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--on-surface-variant)]">
                Legal & support
              </p>
              <ul className="mt-4 space-y-2.5 text-[14px]">
                <li>
                  <Link href="/privacy-policy" className="mk-footer-link">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="mk-footer-link">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="mk-footer-link">
                    Contact Us
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="border-t border-[var(--border-hairline)]">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-5 text-center text-[13px] text-[var(--on-surface-variant)] sm:flex-row sm:items-center sm:justify-between sm:text-left sm:px-6 lg:px-8">
            <p>© {year} JobApp OS. All rights reserved.</p>
            <p>Applications customized for you.</p>
          </div>
        </div>
      </footer>

      <button
        type="button"
        className={`mk-back-top ${showTop ? "is-visible" : ""}`}
        onClick={scrollToTop}
        aria-label="Back to top"
        tabIndex={showTop ? 0 : -1}
      >
        <span className="material-symbols-outlined text-[22px]" aria-hidden>
          arrow_upward
        </span>
      </button>
    </div>
  );
}
