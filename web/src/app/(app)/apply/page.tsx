import Link from "next/link";
import { QuickApplyForm } from "@/components/pipeline/quick-apply-form";

export default function QuickApplyPage() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/applications"
            className="li-meta inline-flex items-center gap-1 hover:text-primary no-underline"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to jobs
          </Link>
          <h1 className="li-page-title mt-1">Quick Apply</h1>
          <p className="li-meta mt-0.5">
            Paste JD + contacts — resume, cover letter, and Gmail drafts run via JobApp Bridge.
          </p>
        </div>
      </div>
      <QuickApplyForm />
    </div>
  );
}
