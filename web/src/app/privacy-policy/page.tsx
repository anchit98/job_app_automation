import type { Metadata } from "next";
import { LegalBackLink } from "@/components/layout/legal-back-link";

export const metadata: Metadata = {
  title: "Privacy Policy | JobApp OS",
  description: "Privacy Policy for JobApp OS.",
};

const updatedAt = "August 3, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-margin-mobile py-8 md:px-margin-desktop md:py-10">
      <LegalBackLink />
      <article className="li-card p-6 md:p-8">
        <div className="space-y-2">
          <h1 className="li-page-title">Privacy Policy</h1>
          <p className="text-[14px] text-on-surface-variant">
            Last updated: {updatedAt}
          </p>
          <p className="text-[15px] leading-7 text-on-surface">
            This Privacy Policy explains how JobApp OS collects, uses, stores,
            and protects information when you use the service. JobApp OS is a
            job application automation web app: it helps users create tailored
            resumes and cover letters, store materials in Google Drive and
            Google Docs, prepare Gmail drafts for outreach and follow-ups, and
            track applications in one place.
          </p>
        </div>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">1. Information We Collect</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              We collect information you provide directly, information created
              while you use the service, and limited technical information
              needed to keep the service secure and operational.
            </p>
            <div>
              <p className="font-semibold">Account and identity data</p>
              <p>
                When you create an account, we may collect your email address,
                hashed password, display name, and account status information
                such as admin access, password reset state, and billing access
                state.
              </p>
            </div>
            <div>
              <p className="font-semibold">Profile and application data</p>
              <p>
                We collect the information you choose to store in JobApp OS,
                including profile details (such as name, location, phone, and
                LinkedIn URL), contact information, master resume content,
                cover letter content, job descriptions, application records,
                outreach drafts, follow-up notes, and workflow output generated
                through the platform. Profile and master-document settings can
                be updated anytime on the Profile page.
              </p>
            </div>
            <div>
              <p className="font-semibold">Google integration data</p>
              <p>
                If you connect Google, we store encrypted Google OAuth tokens
                and the granted scopes needed to access Google Drive, Google
                Docs, and Gmail on your behalf. These tokens are tied to your
                individual account and are not shared with other users. We use
                this access to create and update application documents, export
                PDFs, and create Gmail drafts — not to sell your Google data or
                use it for advertising.
              </p>
            </div>
            <div>
              <p className="font-semibold">AI generation data</p>
              <p>
                When you run Apply, selected job description text, profile and
                master-document context, and related workflow inputs may be sent
                to our server-side AI provider (OpenAI) to generate tailored
                resumes, cover letters, and outreach drafts. Generated outputs
                are validated and stored in your JobApp OS account and, where
                applicable, written to your Google Drive or Gmail drafts.
              </p>
            </div>
            <div>
              <p className="font-semibold">Billing and payment review data</p>
              <p>
                If the platform uses manual UPI or similar payment verification,
                we may collect payment references, submitted claim details,
                review status, and related audit history used to approve or
                reject access.
              </p>
            </div>
            <div>
              <p className="font-semibold">Operational and security data</p>
              <p>
                We may collect audit logs, session records, timestamps, error
                states, browser requests, and integration status details to
                operate the service, troubleshoot failures, investigate abuse,
                and protect accounts.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">2. How We Use Information</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>We use collected information to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>create and manage user accounts and sessions;</li>
              <li>store and display your job search workflow data;</li>
              <li>connect to your Google account when you authorize it;</li>
              <li>
                generate, save, and manage job application artifacts (including
                Drive/Docs files and Gmail drafts);
              </li>
              <li>
                create Gmail drafts for outreach and follow-ups (users send
                manually from Gmail);
              </li>
              <li>
                send limited admin-originated transactional emails (for example
                password reset or payment-claim notices) when configured;
              </li>
              <li>
                schedule follow-up reminders using India Standard Time (IST /
                Asia/Kolkata) business-day rules;
              </li>
              <li>process billing claims and manage access permissions;</li>
              <li>provide account recovery, support, and administrative tools;</li>
              <li>monitor reliability, debug incidents, and improve the service;</li>
              <li>enforce platform rules, prevent abuse, and maintain security.</li>
            </ul>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">3. Legal Bases and User Control</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              We process information to provide the service you request, to
              maintain the security and integrity of the platform, to comply
              with legal obligations, and where applicable based on your
              consent, such as when you connect a Google account.
            </p>
            <p>
              You may update profile and master-document settings, disconnect
              Google, change your password, or delete your account through the
              app where those controls are available. Disconnecting Google stops
              future access but does not automatically delete historical content
              previously created or stored in the app or in your Google account
              unless separately removed.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">4. Google API and Third-Party Services</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              JobApp OS relies on third-party infrastructure and APIs,
              including hosting, database, Google services, and server-side AI
              generation (OpenAI). When you use the Google integration, your
              data may be transmitted to Google in order to access or create
              Google Drive, Google Docs, and Gmail resources that you authorize.
            </p>
            <p>
              <strong className="font-semibold">Google user data use.</strong>{" "}
              With your consent, JobApp OS uses Google APIs to: create and
              update documents in Google Drive and Google Docs for resumes and
              cover letters; export PDFs; create Gmail drafts for cold outreach
              and follow-ups (including attaching Drive PDFs when ready); and,
              for follow-up threading, look up related Gmail threads where the
              readonly scope is granted. Outreach email is never auto-sent —
              drafts remain in your Gmail until you review and send them.
              Limited admin features may use Gmail send for transactional
              notices you expect from the service (such as password recovery).
            </p>
            <p>
              JobApp OS&apos;s use and transfer to any other app of information
              received from Google APIs will adhere to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                className="text-primary font-semibold underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <p>
              JobApp OS uses AI on the server to generate tailored resumes,
              cover letters, and outreach from the materials you store in the
              app. Generated content is validated before it enters your
              application pipeline. Your use of the service remains subject to
              these policies; third-party providers remain subject to their own
              terms.
            </p>
            <p>
              JobApp OS does not sell your personal information. We use Google
              user data only to provide or improve user-facing features that are
              directly relevant to the job-application functionality you
              request.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">5. Data Sharing</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>We may share information only in limited circumstances:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                with infrastructure or service providers needed to run JobApp OS
                (including OpenAI for Apply generations);
              </li>
              <li>with Google, when you explicitly authorize Google integration;</li>
              <li>with admins managing billing, support, fraud review, or operations;</li>
              <li>if required by law, regulation, subpoena, or legal process;</li>
              <li>to investigate abuse, fraud, or security incidents.</li>
            </ul>
            <p>
              We do not share user data with unrelated third parties for
              advertising or resale purposes.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">6. Data Retention</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              We retain information for as long as reasonably necessary to
              provide the service, maintain system integrity, resolve disputes,
              comply with legal obligations, and enforce agreements.
            </p>
            <p>
              Some records such as audit logs, payment review history, and
              operational metadata may remain for a limited period after account
              deletion where needed for security, fraud prevention, billing
              reconciliation, backup restoration, or legal compliance.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">7. Security</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              We use reasonable administrative, technical, and organizational
              measures to protect information. These measures may include hashed
              passwords, signed sessions, encrypted Google tokens, access
              controls, and server-side validation.
            </p>
            <p>
              No method of transmission or storage is completely secure. You are
              responsible for maintaining the confidentiality of your account
              credentials and for using the service on trusted devices and
              networks.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">8. International Use</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              Depending on where the service and infrastructure are hosted, your
              information may be processed or stored in jurisdictions outside
              your place of residence. Product dates, metrics day bounds, and
              follow-up business-day scheduling use India Standard Time (IST /
              Asia/Kolkata). By using the service, you acknowledge that such
              transfers and timezone handling may occur where legally permitted.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">9. Children&apos;s Privacy</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              JobApp OS is not intended for children under the age required to
              consent to data processing in their jurisdiction. If you believe a
              child has provided personal information without proper consent,
              contact the operator so appropriate steps can be taken.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">10. Changes to This Policy</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              We may update this Privacy Policy from time to time to reflect
              changes to the service, legal requirements, or operational needs.
              Continued use of the service after an update becomes effective
              constitutes acknowledgment of the revised policy.
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="li-section-title">11. Contact</h2>
          <div className="space-y-4 text-[15px] leading-7 text-on-surface">
            <p>
              Questions, privacy requests, or complaints should be directed to
              the support or contact channel published by JobApp OS on the live
              service or company website.
            </p>
          </div>
        </section>
      </article>
    </div>
  );
}
