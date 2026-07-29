"use client";

import { useRouter } from "next/navigation";
import { setSetupGuideCollapsed } from "@/app/actions/setup";

export function ReopenSetupGuideButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="li-btn-secondary text-[13px] w-full justify-center"
      onClick={() => {
        void setSetupGuideCollapsed(false);
        router.push("/dashboard");
      }}
    >
      Expand setup guide on Dashboard
    </button>
  );
}
