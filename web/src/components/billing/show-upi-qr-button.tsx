"use client";

import { useEffect, useId, useState } from "react";

const QR_SRC = "/billing/upi-qr.png";

export function ShowUpiQrButton({
  amountInr,
  planLabel,
}: {
  amountInr: string;
  planLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="li-btn-secondary text-[13px] justify-center md:w-auto"
        onClick={() => setOpen(true)}
      >
        Show QR
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[color-mix(in_srgb,var(--inverse-surface)_72%,transparent)] p-4 backdrop-blur-[6px] af-loader-fade"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative w-[min(92vw,340px)] overflow-hidden rounded-2xl bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.28)] ring-1 ring-black/5 af-upi-qr-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="relative px-6 pt-7 pb-5 text-center"
              style={{
                background:
                  "linear-gradient(165deg, color-mix(in srgb, var(--primary) 92%, #062a52) 0%, var(--primary) 48%, color-mix(in srgb, var(--primary) 78%, #1a8cff) 100%)",
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(255,255,255,0.35), transparent 55%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(0,0,0,0.18), transparent 60%)",
                }}
              />
              <div className="relative flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/jobapp-os-logo.png"
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-xl bg-white/95 p-1.5 shadow-sm"
                />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">
                    JobApp OS
                  </p>
                  <h2
                    id={titleId}
                    className="mt-1 text-[20px] font-semibold leading-tight text-white"
                  >
                    Pay with QR
                  </h2>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-5 px-6 py-6">
              <div className="text-center">
                <p className="text-[12px] font-medium text-on-surface-variant">
                  {planLabel}
                </p>
                <p className="mt-1 text-[34px] font-semibold tracking-tight text-on-surface leading-none">
                  ₹{amountInr}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] dark:bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={QR_SRC}
                  alt="UPI payment QR code"
                  width={240}
                  height={240}
                  className="h-auto w-[min(68vw,240px)] select-none"
                  draggable={false}
                />
              </div>

              <p className="text-center text-[13px] leading-snug text-on-surface-variant">
                Scan with PhonePe, GPay, Paytm, or any UPI app
              </p>
            </div>

            <div className="border-t border-border-hairline px-6 py-3.5 text-center">
              <button
                type="button"
                className="text-[13px] font-semibold text-primary hover:underline"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
