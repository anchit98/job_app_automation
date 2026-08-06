import type { Metadata } from "next";
import Link from "next/link";
import { LegalBackLink } from "@/components/layout/legal-back-link";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Contact JobApp OS for support, privacy requests, billing questions, or feedback.",
};

const SUPPORT_EMAIL = "support@jobappos.in";

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-margin-mobile py-8 md:px-margin-desktop md:py-10">
      <LegalBackLink />
      <article className="li-card p-6 md:p-8">
        <div className="space-y-2">
          <h1 className="li-page-title">Contact Us</h1>
          <p className="text-[15px] leading-7 text-on-surface">
            Questions about JobApp OS, your account, billing, or how we handle
            your data? We&apos;re happy to help.
          </p>
        </div>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">Email support</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              The fastest way to reach us is by email at{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-semibold text-primary underline underline-offset-2"
              >
                {SUPPORT_EMAIL}
              </a>
              . We aim to respond within 1–2 business days.
            </p>
            <p>
              To help us resolve your issue quickly, please include the email
              address you signed up with and a short description of the
              problem (screenshots welcome).
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">What we can help with</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <ul className="list-disc space-y-2 pl-5">
              <li>Account access, password, and login issues</li>
              <li>Billing, payments, and refunds</li>
              <li>
                Google account connection (Drive, Docs, and Gmail permissions)
              </li>
              <li>
                Privacy requests — data access, correction, or deletion, and
                revoking Google access
              </li>
              <li>Bug reports and product feedback</li>
            </ul>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">Privacy and data requests</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              For details on what data JobApp OS collects and how it is used,
              see our{" "}
              <Link
                href="/privacy-policy"
                className="font-semibold text-primary underline underline-offset-2"
              >
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link
                href="/terms"
                className="font-semibold text-primary underline underline-offset-2"
              >
                Terms of Service
              </Link>
              . Privacy requests sent to the email above are handled with
              priority.
            </p>
            <p>
              You can also revoke JobApp OS&apos;s access to your Google
              account at any time from your{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline underline-offset-2"
              >
                Google Account permissions
              </a>{" "}
              page.
            </p>
          </div>
        </section>
      </article>
    </div>
  );
}
