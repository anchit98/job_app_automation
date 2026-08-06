"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] route error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-[22px] font-bold text-on-surface">
        This page couldn&apos;t load
      </h1>
      <p className="text-[15px] text-on-surface-variant">
        A temporary server issue interrupted this view. Your session is usually
        fine — try again.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="li-btn-primary"
      >
        Try again
      </button>
    </div>
  );
}
