import { cn } from "@/lib/utils/cn";
import { InputHTMLAttributes, forwardRef } from "react";

/**
 * A text input, the same height as every button beside it.
 *
 * Renders `.li-field` from globals.css rather than restating the metrics as
 * utilities — see the note on `Button`. A form row holding an input and a
 * button now lines up because both are 38px by the same construction, not
 * because two sets of numbers happened to match.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn("li-field", className)} {...props} />;
  },
);
