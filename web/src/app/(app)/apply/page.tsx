import Link from "next/link";
import { QuickApplyForm } from "@/components/pipeline/quick-apply-form";
import { FreshJobsBanner } from "@/components/dashboard/fresh-jobs-hack";
import { getMasterCoverLetter } from "@/app/actions/cover-letter";

export default async function QuickApplyPage() {
  const masterCoverLetter = await getMasterCoverLetter().catch(() => null);
  const coverLetterSynced = Boolean(
    masterCoverLetter?.doc_id && masterCoverLetter?.doc_layout,
  );

  return (
    <div className="qa-ambient space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/applications"
            className="li-meta inline-flex items-center gap-1 hover:text-primary no-underline"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to jobs
          </Link>
          <h1 className="li-page-title mt-1">Apply</h1>
          <p className="li-meta mt-0.5">
            Paste a JD — contacts are optional. AI generates your package on the
            server. Without contacts, cold email and Gmail drafts are skipped.
          </p>
        </div>
      </div>
      <FreshJobsBanner />
      <QuickApplyForm
        llmEngine="openai"
        coverLetterSynced={coverLetterSynced}
      />
    </div>
  );
}
