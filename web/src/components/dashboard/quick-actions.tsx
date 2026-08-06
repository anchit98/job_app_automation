import Link from "next/link";

const ACTIONS = [
  {
    href: "/apply",
    icon: "rocket_launch",
    title: "Start a new Apply",
    description: "Paste a JD and generate resume, letter, and outreach.",
    tone: "bg-primary-container text-primary",
  },
  {
    href: "/applications",
    icon: "work",
    title: "Browse your jobs",
    description: "Track statuses, artifacts, and follow-ups in one place.",
    tone: "bg-success-container text-success",
  },
  {
    href: "/onboarding",
    icon: "contact_page",
    title: "Update your profile",
    description: "Keep your master resume and details sharp.",
    tone: "bg-tertiary-container text-tertiary",
  },
  {
    href: "/settings",
    icon: "settings",
    title: "Privacy & settings",
    description: "Manage connections, appearance, and data.",
    tone: "bg-surface-container-low text-on-surface-variant",
  },
];

export function QuickActions() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="material-symbols-outlined text-[20px] text-primary"
          aria-hidden
        >
          bolt
        </span>
        <h2 className="li-section-title">Quick actions</h2>
      </div>
      <ul className="flex flex-col gap-2">
        {ACTIONS.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              prefetch={false}
              className="group flex items-center gap-3 rounded-xl border border-border-hairline bg-surface px-3 py-2.5 no-underline transition-all hover:border-primary/40 hover:shadow-[var(--shadow-card)]"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${action.tone}`}
                aria-hidden
              >
                <span className="material-symbols-outlined text-[20px]">
                  {action.icon}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-on-surface">
                  {action.title}
                </span>
                <span className="block text-[12px] text-on-surface-variant line-clamp-1">
                  {action.description}
                </span>
              </span>
              <span
                className="material-symbols-outlined text-[18px] text-on-surface-variant transition-all group-hover:translate-x-0.5 group-hover:text-primary"
                aria-hidden
              >
                chevron_right
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
