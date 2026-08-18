"use client";

/**
 * Professional field picker — ported from ResumeBuilderV2's SelectField.jsx.
 *
 * Shown as the builder's first step because the field decides which sections
 * appear and in what order. The free-plan field lock from the original is gone:
 * metering now lives in one place (lib/billing/entitlements).
 */
import {
  ArrowRight,
  Briefcase,
  Code,
  DollarSign,
  GraduationCap,
  Heart,
  Megaphone,
  Palette,
  Scale,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ProfessionalField } from "@/lib/builder/types";

const FIELDS: Array<{
  key: ProfessionalField;
  Icon: LucideIcon;
  label: string;
  desc: string;
  color: string;
}> = [
  { key: "tech", Icon: Code, label: "Technology", desc: "Software, DevOps, Data Science, AI/ML", color: "#3b82f6" },
  { key: "sales", Icon: TrendingUp, label: "Sales", desc: "B2B, B2C, Account Management, BDR", color: "#10b981" },
  { key: "marketing", Icon: Megaphone, label: "Marketing", desc: "Digital, Content, SEO, Brand Strategy", color: "#f59e0b" },
  { key: "finance", Icon: DollarSign, label: "Finance", desc: "Banking, Accounting, Investment, Audit", color: "#06b6d4" },
  { key: "healthcare", Icon: Heart, label: "Healthcare", desc: "Doctor, Nurse, Pharma, Research", color: "#f43f5e" },
  { key: "education", Icon: GraduationCap, label: "Education", desc: "Teacher, Professor, Researcher", color: "#8b5cf6" },
  { key: "design", Icon: Palette, label: "Design", desc: "UI/UX, Graphic, Product, Motion", color: "#ec4899" },
  { key: "legal", Icon: Scale, label: "Legal", desc: "Lawyer, Paralegal, Compliance", color: "#64748b" },
  { key: "hr", Icon: Users, label: "Human Resources", desc: "Recruitment, L&D, People Ops", color: "#a855f7" },
  { key: "general", Icon: Briefcase, label: "General", desc: "Any profession, all-purpose CV", color: "#60a5fa" },
];

export function FieldPicker({
  selected,
  onSelect,
  title = "Which industry are you in?",
  subtitle = "This decides which sections appear on your CV and in what order.",
}: {
  selected?: ProfessionalField;
  onSelect: (field: ProfessionalField) => void;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="li-section-title">{title}</h2>
        <p className="text-[13px] text-on-surface-variant mt-1">{subtitle}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {FIELDS.map(({ key, Icon, label, desc, color }) => {
          const active = selected === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-pressed={active}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                active
                  ? "border-primary bg-primary/10"
                  : "border-outline-variant hover:bg-[var(--ghost-hover)]"
              }`}
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{ color, backgroundColor: `${color}1f` }}
              >
                <Icon size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-on-surface">
                  {label}
                </span>
                <span className="block text-[12px] text-on-surface-variant truncate">
                  {desc}
                </span>
              </span>
              {active ? (
                <span className="text-[11px] font-bold uppercase tracking-wide text-primary">
                  Selected
                </span>
              ) : (
                <ArrowRight size={16} className="text-on-surface-variant" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
