import type { TimelineEvent } from "@/lib/tracker/timeline";

interface ApplicationTimelineProps {
  events: TimelineEvent[];
}

export function ApplicationTimeline({ events }: ApplicationTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-[14px] text-on-surface-variant">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <div className="relative border-l border-outline-variant ml-3 space-y-6">
      {events.map((event) => (
        <div key={event.id} className="relative pl-6">
          <div
            className={`absolute w-3 h-3 rounded-full -left-[6.5px] top-1 ${
              event.kind === "prompt"
                ? "bg-secondary-container border border-secondary"
                : "bg-primary border border-primary"
            }`}
          />
          <p className="text-[14px] font-medium text-on-surface">{event.label}</p>
          {event.detail && (
            <p className="text-[12px] text-on-surface-variant mt-0.5">
              {event.detail}
            </p>
          )}
          <p className="text-[11px] text-on-surface-variant mt-1">
            {new Date(event.created_at).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
