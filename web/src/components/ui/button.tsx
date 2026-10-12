import { cn } from "@/lib/utils/cn";
import { ButtonHTMLAttributes, forwardRef } from "react";

/**
 * The app has one button, and this is it.
 *
 * It used to restate the styling in Tailwind utilities while `.li-btn-*` in
 * globals.css said the same thing in CSS. The two only agreed on height by
 * accident — through `body { line-height: 20px }` — and disagreed the moment
 * either side was touched, which is how a row mixing a `<Button>` with a
 * `.li-btn-secondary` ended up 2px out of alignment.
 *
 * So this renders the shared classes rather than a parallel set of utilities.
 * Anything that needs a button and cannot use this component (a `<Link>`, an
 * anchor) applies the same class directly and comes out identical.
 */
const VARIANT_CLASS = {
  primary: "li-btn-primary",
  secondary: "li-btn-secondary",
  ghost: "li-btn-ghost",
  danger: "li-btn-danger",
} as const;

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: keyof typeof VARIANT_CLASS;
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
        VARIANT_CLASS[variant],
        "transition disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
