import type { Metadata } from "next";
import { LegalBackLink } from "@/components/layout/legal-back-link";

export const metadata: Metadata = {
  title: "Terms of Service | JobApp OS",
  description: "Terms of Service for JobApp OS.",
};

const updatedAt = "August 3, 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-margin-mobile py-8 md:px-margin-desktop md:py-10">
      <LegalBackLink />
      <article className="li-card p-6 md:p-8">
        <div className="space-y-2">
          <h1 className="li-page-title">Terms of Service</h1>
          <p className="text-[14px] text-on-surface-variant">
            Last updated: {updatedAt}
          </p>
          <p className="text-[15px] leading-7 text-on-surface">
            These Terms of Service govern access to and use of JobApp OS. By
            creating an account, connecting third-party services, or otherwise
            using the platform, you agree to these Terms.
          </p>
        </div>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">1. Service Overview</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              JobApp OS is a job application automation platform. Users paste a
              job description; the service helps generate tailored resumes and
              cover letters, store materials via Google Drive and Google Docs,
              prepare Gmail drafts for outreach and follow-ups, and track
              applications in a dashboard.
            </p>
            <p>
              Generations run server-side using AI (OpenAI). Certain features
              depend on Google authorization, a completed Profile setup
              (Google connection, required profile fields, and master resume),
              and billing access where applicable. Outreach email is created as{" "}
              <strong className="font-semibold">Gmail drafts only</strong> —
              JobApp OS does not auto-send cold emails or follow-ups on your
              behalf. Feature availability may change over time.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">2. Eligibility and Accounts</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              You may use the service only if you can form a binding agreement
              under applicable law. You are responsible for maintaining the
              security of your account credentials and for all activity that
              occurs under your account.
            </p>
            <p>
              You must provide accurate information when registering and keep
              your Profile information reasonably up to date. We may suspend or
              disable accounts that are fraudulent, abusive, deceptive, or in
              violation of these Terms.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">3. Acceptable Use</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>You agree not to use JobApp OS to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>violate any law, regulation, or third-party right;</li>
              <li>submit false, unlawful, infringing, or deceptive content;</li>
              <li>abuse, disrupt, reverse engineer, or overload the platform;</li>
              <li>attempt unauthorized access to other accounts or systems;</li>
              <li>send spam, malware, or harmful automated communications;</li>
              <li>
                misrepresent identity, qualifications, or job application
                content;
              </li>
              <li>use the platform in a way that harms the service or other users.</li>
            </ul>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">4. User Content and Responsibility</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              You retain responsibility for the content you submit, upload,
              generate, store, or send through the service, including resumes,
              cover letters, job descriptions, contact records, notes, and
              emails. You represent that you have the rights needed to use that
              content and that it does not violate law or third-party rights.
            </p>
            <p>
              You are solely responsible for reviewing any AI-generated or
              drafted content before relying on it or sending it to employers,
              contacts, or third parties. JobApp OS does not guarantee factual
              accuracy, completeness, compliance, interview success, or hiring
              outcomes.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">5. Google and Third-Party Integrations</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              JobApp OS may connect to Google Drive, Google Docs, Gmail, OpenAI,
              and other third-party services when you authorize those
              integrations or when the operator configures them for Apply.
              Your use of those services remains subject to their own terms and
              policies.
            </p>
            <p>
              If a third-party service changes, revokes access, rate-limits
              usage, or becomes unavailable, certain JobApp OS features may stop
              working temporarily or permanently without liability to us.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">6. Billing, Access, and Refunds</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              Some features or account states may require payment before access
              is granted. Where manual payment review is used, activation may be
              delayed until an administrator verifies the payment reference and
              approves access. Launch offer details (such as one-time pricing,
              lifetime access messaging, or included application volume) are
              described on the live billing and marketing pages and may change.
            </p>
            <p>
              After paid access is granted, Dashboard and Apply may remain
              locked until required Profile setup is complete (Connect Google,
              required profile fields, and master resume). Profile settings can
              be updated anytime thereafter.
            </p>
            <p>
              Unless expressly stated otherwise on the live service, fees are
              non-refundable once access has been granted, except where required
              by law. Pricing, plan details, and access rules may be changed by
              updating the service or related billing materials.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">7. Intellectual Property</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              The JobApp OS service, branding, interface design, software, and
              related materials are protected by applicable intellectual
              property laws. Except for limited rights needed to use the
              service, these Terms do not grant you ownership of the platform or
              its underlying technology.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">8. Suspension and Termination</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              We may suspend, restrict, or terminate access if you violate these
              Terms, create risk for the service or others, fail to satisfy
              payment requirements, or if continued operation of the service is
              no longer feasible.
            </p>
            <p>
              You may stop using the service at any time and may delete your
              account where that functionality is made available.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">9. Disclaimers</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              JobApp OS is provided on an &quot;as is&quot; and &quot;as available&quot; basis
              to the fullest extent permitted by law. We disclaim warranties of
              merchantability, fitness for a particular purpose,
              non-infringement, uninterrupted availability, and error-free
              operation.
            </p>
            <p>
              We do not guarantee that the platform will always be available,
              that generated content will be accurate, or that using the service
              will result in interviews, offers, or other career outcomes.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">10. Limitation of Liability</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              To the maximum extent permitted by law, JobApp OS and its
              operators will not be liable for indirect, incidental, special,
              consequential, exemplary, or punitive damages, or for loss of
              data, profits, goodwill, opportunities, or business interruption.
            </p>
            <p>
              To the extent liability cannot be excluded, total liability
              relating to the service will not exceed the amount you paid to use
              JobApp OS during the three months preceding the event giving rise
              to the claim, or the minimum amount required by law if greater.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">11. Indemnity</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              You agree to indemnify and hold harmless JobApp OS and its
              operators from claims, losses, liabilities, damages, and expenses
              arising from your use of the service, your content, your breach of
              these Terms, or your violation of law or third-party rights.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">12. Changes to the Service or Terms</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              We may update the service or these Terms at any time. If changes
              are material, we may provide notice through the app, website, or
              other reasonable means. Continued use after the effective date of
              updated Terms constitutes acceptance of the revised Terms.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">13. Governing Law and Disputes</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              These Terms are governed by the laws applicable in the operator&apos;s
              principal place of business, unless local consumer protection law
              requires otherwise. Any dispute relating to the service will be
              resolved in the appropriate courts or forums of that jurisdiction,
              subject to applicable law.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">14. Contact</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              Questions about these Terms should be sent through the support or
              contact channel published by JobApp OS on the live service or
              company website.
            </p>
          </div>
        </section>
      </article>
    </div>
  );
}
