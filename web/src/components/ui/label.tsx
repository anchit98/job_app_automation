import { cn } from "@/lib/utils/cn";
import { LabelHTMLAttributes } from "react";

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1 block text-[12px] font-semibold text-on-surface-variant",
        className,
      )}
      {...props}
    />
  );
}
