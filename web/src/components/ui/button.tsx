import { cn } from "@/lib/utils/cn";
import { ButtonHTMLAttributes, forwardRef } from "react";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
  }
>(function Button(
  { className, variant = "primary", disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-semibold transition disabled:opacity-50",
        variant === "primary" &&
          "bg-primary text-on-primary hover:bg-[#004182] border border-transparent",
        variant === "secondary" &&
          "bg-transparent text-primary border border-primary hover:bg-primary/10",
        variant === "ghost" &&
          "bg-transparent text-on-surface border border-transparent hover:bg-black/[0.04]",
        variant === "danger" &&
          "bg-error text-on-error hover:bg-error/90 border border-transparent",
        className,
      )}
      {...props}
    />
  );
});
