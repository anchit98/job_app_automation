"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { clearAllPendingPrompts } from "@/app/actions/tracker";

export function ClearPendingPromptsButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (count <= 0) return null;

  return (
    <button
      type="button"
      disabled={pending}
      className="mt-2 text-[13px] font-semibold text-primary hover:underline disabled:opacity-50"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (
          !window.confirm(
            `Clear ${count} pending AI prompt${count === 1 ? "" : "s"}? In-progress stages may need a new Quick Apply.`,
          )
        ) {
          return;
        }
        startTransition(async () => {
          await clearAllPendingPrompts();
          router.refresh();
        });
      }}
    >
      {pending ? "Clearing…" : "Clear all pending"}
    </button>
  );
}
