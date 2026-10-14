"use client";

/**
 * One input per item, with its own remove control and an add button below.
 *
 * Ported from the bullet/skill rows in ResumeBuilderV2's Builder.jsx. A single
 * textarea split on newlines looks equivalent but is not: long text wraps, so
 * "one line" stops matching "one bullet", and blank lines are ambiguous. An
 * explicit array keeps what the user sees identical to what the PDF renders.
 *
 * `variant="tag"` lays the inputs out inline for short values like skills.
 */
import { Plus, Trash2 } from "lucide-react";

const INPUT_CLASS =
  "w-full rounded-lg border border-border-hairline bg-surface px-3 py-2 text-[14px] text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary";

export function StringListEditor({
  label,
  values,
  onChange,
  placeholder,
  addLabel = "Add",
  variant = "row",
}: {
  label?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  variant?: "row" | "tag";
}) {
  // Always render at least one input so there is somewhere to start typing.
  const items = values.length > 0 ? values : [""];

  function update(index: number, value: string) {
    onChange(items.map((v, i) => (i === index ? value : v)));
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {label ? (
        <span className="block text-[13px] font-medium text-on-surface-variant">
          {label}
        </span>
      ) : null}

      <div
        className={
          variant === "tag" ? "flex flex-wrap items-center gap-2" : "space-y-2"
        }
      >
        {items.map((value, index) => (
          <div
            key={index}
            className={
              variant === "tag"
                ? "flex items-center gap-1"
                : "flex items-start gap-2"
            }
          >
            <input
              className={INPUT_CLASS}
              style={
                variant === "tag"
                  ? { padding: "6px 10px", fontSize: 12, width: 150 }
                  : undefined
              }
              value={value}
              placeholder={placeholder}
              onChange={(e) => update(index, e.target.value)}
            />
            {/* Mirrors the original: the last remaining row keeps no delete
                control, so a section can never be left with zero inputs. */}
            {items.length > 1 ? (
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remove item ${index + 1}`}
                title="Remove"
                className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
              >
                <Trash2 size={variant === "tag" ? 12 : 14} />
              </button>
            ) : null}
          </div>
        ))}

        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-2.5 py-1.5 text-[12px] font-semibold text-primary hover:bg-[var(--ghost-hover)]"
        >
          <Plus size={12} />
          {addLabel}
        </button>
      </div>
    </div>
  );
}
