"use client";

import { useState } from "react";

export function CopyUpiButton({ upiId }: { upiId: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="li-btn-secondary text-[13px] justify-center md:w-auto"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(upiId);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : "Copy UPI ID"}
    </button>
  );
}
