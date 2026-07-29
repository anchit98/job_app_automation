"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LandingGallery } from "@/components/marketing/landing-gallery";
import { LandingAgentVisual } from "@/components/marketing/landing-agent-visual";

const navLinks = [
  { href: "#about", label: "About" },
  { href: "#features", label: "Features" },
  { href: "#benefits", label: "Why JobApp OS" },
  { href: "#ai", label: "AI" },
  { href: "#gallery", label: "Gallery" },
  { href: "#pricing", label: "Pricing" },
];

const heroChips = [
  { icon: "verified", label: "Fully customizable" },
  { icon: "smart_toy", label: "ChatGPT in the loop" },
  { icon: "drafts", label: "Draft-only outreach" },
];

const features = [
  {
    icon: "rocket_launch",
    title: "Quick Apply",
    body: "Paste a job description with company and role. JobApp OS runs a guided pipeline for resume, cover letter, contacts, cold emails, and Gmail drafts.",
  },
  {
    icon: "extension",
    title: "JobApp Bridge",
    body: "The Chrome extension opens ChatGPT, pastes each prompt, and posts structured replies back so you can skip the copy-paste grind.",
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
    body: "Pipeline metrics, pending prompts, and due follow-ups sit on one screen so you always know what needs attention next.",
  },
];

const benefits = [
  {
    icon: "hub",
    title: "Stop juggling ten tools",
    body: "LinkedIn, ChatGPT, Docs, Gmail, trackers, and reminders collapse into one personal application OS.",
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

const aiPoints = [
  {
    icon: "psychology",
    title: "ChatGPT in the loop",
    body: "JobApp OS composes structured prompts from your profile and the job description, then validates ChatGPT responses before they enter your pipeline.",
  },
  {
    icon: "sync_alt",
    title: "Bridge automation",
    body: "JobApp Bridge moves prompts and replies between the app and ChatGPT so the agent can run stages end to end.",
  },
  {
    icon: "build",
    title: "Repair when output breaks",
    body: "If a response fails validation, the system generates a repair prompt instead of silently accepting bad data.",
  },
  {
    icon: "key_off",
    title: "No API key required",
    body: "You bring your ChatGPT access. The agent orchestrates the workflow around the tools you already use.",
  },
];

const aboutSteps = [
  {
    step: "01",
    icon: "record_voice_over",
    title: "Teach it your voice",
    body: "Connect Google, set your profile, and lock in master resume and cover letter sources.",
  },
  {
    step: "02",
    icon: "play_circle",
    title: "Run Quick Apply",
    body: "Paste the JD. The agent walks resume, cover letter, contacts, emails, and drafts in sequence.",
  },
  {
    step: "03",
    icon: "insights",
    title: "Track and follow up",
    body: "Monitor status, enqueue follow-ups, and keep every company conversation in one tracker.",
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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-in");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add("is-in");
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
      className={`mk-reveal ${className}`}
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
      className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}
    >
      <p
        className={`mk-eyebrow inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--primary)] ${
          align === "center" ? "justify-center" : ""
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

export function LandingPage() {
  const year = new Date().getFullYear();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="marketing-page bg-[var(--canvas)] text-[var(--on-surface)]">
      <header
        className={`marketing-nav sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "border-b border-[var(--border-hairline)] bg-[var(--surface)]/85 shadow-[0_8px_30px_-18px_rgba(0,0,0,0.25)] backdrop-blur-xl"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-2.5 no-underline">
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
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="mk-nav-link">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
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
        </div>
      </header>

      <main id="top">
        <section className="marketing-hero relative overflow-hidden">
          <div className="marketing-hero-grid" aria-hidden />
          <span className="marketing-aurora marketing-aurora-a" aria-hidden />
          <span className="marketing-aurora marketing-aurora-b" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-16 lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-8 lg:pb-28 lg:pt-24">
            <div className="lg:col-span-6">
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
                <p className="mt-5 max-w-xl text-[16px] leading-7 text-[var(--on-surface-variant)] sm:text-[18px] sm:leading-8">
                  Tailor resumes, cover letters, and outreach for every role,
                  then track the full pipeline in one place.
                </p>
              </Reveal>
              <Reveal delay={260}>
                <div className="mt-8 flex flex-wrap items-center gap-3">
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
                <div className="mt-7 flex flex-wrap items-center gap-2.5">
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
                  Limited time: lifetime access from{" "}
                  <span className="font-bold text-[var(--primary)]">₹299</span>{" "}
                  after activation.
                </p>
              </Reveal>
            </div>
            <Reveal delay={200} className="lg:col-span-6">
              <LandingAgentVisual />
            </Reveal>
          </div>
        </section>

        <section
          id="about"
          className="marketing-section border-t border-[var(--border-hairline)]"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="About"
              title="A career operations agent you can shape"
              lead="Job hunting usually means bouncing between ChatGPT, documents, Gmail, and spreadsheets for every role. JobApp OS is built as a fully customizable assistant that turns a pasted job description into a tracked application package: tailored materials, draft outreach, and follow-ups that stay under your control."
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-3">
              {aboutSteps.map((item, index) => (
                <Reveal key={item.step} delay={index * 110}>
                  <article className="marketing-panel mk-step-card h-full rounded-2xl p-6">
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
                  <article className="marketing-panel h-full rounded-2xl p-6">
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
                  <article className="marketing-panel flex h-full gap-5 rounded-2xl p-6">
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

        <section id="ai" className="marketing-section">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-12 lg:items-start">
              <div className="lg:col-span-5 lg:sticky lg:top-24">
                <SectionHeading
                  eyebrow="How AI is leveraged"
                  title="AI that prepares. You that decide."
                  lead="JobApp OS treats ChatGPT as the reasoning engine inside a structured agent workflow. Prompts are composed from your materials, responses are validated, and outbound mail stays draft-only until you send it from Gmail."
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:col-span-7">
                {aiPoints.map((point, index) => (
                  <Reveal key={point.title} delay={(index % 2) * 110}>
                    <article className="marketing-panel h-full rounded-2xl p-6">
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
              <div className="marketing-pricing relative overflow-hidden rounded-[28px] px-6 py-12 sm:px-10 sm:py-14">
                <div className="marketing-pricing-glow" aria-hidden />
                <div className="relative grid gap-10 lg:grid-cols-12 lg:items-center">
                  <div className="lg:col-span-7">
                    <p className="mk-offer-badge">
                      <span className="material-symbols-outlined text-[15px]">
                        bolt
                      </span>
                      Limited time offer
                    </p>
                    <h2 className="marketing-display mt-5 text-[30px] font-bold leading-[1.12] tracking-tight sm:text-[38px]">
                      Lifetime access for serious applicants
                    </h2>
                    <p className="mt-4 max-w-xl text-[16px] leading-7 text-[var(--on-surface-variant)]">
                      Activate JobApp OS with a one-time payment. Includes
                      lifetime access and one-time setup support so you can
                      connect Google, load your master docs, and get the Bridge
                      running.
                    </p>
                    <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                      {[
                        "Lifetime access",
                        "One-time setup support",
                        "All pipeline stages",
                        "JobApp Bridge included",
                      ].map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-2.5 text-[14px] font-semibold"
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
                    <div className="mk-price-card rounded-2xl p-7 text-center">
                      <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--on-surface-variant)]">
                        Lifetime access
                      </p>
                      <div className="mt-4 flex items-end justify-center gap-3">
                        <span className="text-[26px] font-semibold text-[var(--on-surface-variant)] line-through decoration-[var(--error)]/60 decoration-2">
                          ₹699
                        </span>
                        <span className="marketing-display marketing-gradient-text text-[58px] font-extrabold leading-none">
                          ₹299
                        </span>
                      </div>
                      <p className="mt-3 text-[13px] leading-5 text-[var(--on-surface-variant)]">
                        One-time payment. Lifetime access. One-time setup
                        support included.
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
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border-hairline)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="max-w-sm lg:col-span-5">
            <div className="flex items-center gap-2.5">
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
              Applications customized for you. A personalized job application AI
              agent you can fully customize.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--on-surface-variant)]">
                Product
              </p>
              <ul className="mt-4 space-y-2.5 text-[14px]">
                <li>
                  <a href="#features" className="mk-footer-link">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="mk-footer-link">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#gallery" className="mk-footer-link">
                    Gallery
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
                Policies
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
              </ul>
            </div>
          </div>
        </div>
        <div className="border-t border-[var(--border-hairline)]">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-[13px] text-[var(--on-surface-variant)] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p>© {year} JobApp OS. All rights reserved.</p>
            <p>Applications customized for you.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
