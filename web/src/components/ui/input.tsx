import { cn } from "@/lib/utils/cn";
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-border-hairline bg-surface px-3 py-2 text-[14px] text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary",
          className,
        )}
        {...props}
      />
    );
  },
);
