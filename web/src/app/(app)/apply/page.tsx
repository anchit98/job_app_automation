import Link from "next/link";
import { QuickApplyForm } from "@/components/pipeline/quick-apply-form";
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
        </div>
      </div>
      <QuickApplyForm
        llmEngine="openai"
        coverLetterSynced={coverLetterSynced}
      />
    </div>
  );
}
