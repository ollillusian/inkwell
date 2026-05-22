import Link from "next/link";

export type JournalView = "days" | "weeks" | "months" | "timeline";

const TABS: { id: JournalView; label: string }[] = [
  { id: "days", label: "Days" },
  { id: "timeline", label: "Timeline" },
  { id: "weeks", label: "Weeks" },
  { id: "months", label: "Months" },
];

export function JournalViewTabs({ active }: { active: JournalView }) {
  return (
    <div
      className="inline-flex rounded-full border border-ink-border bg-ink-surface/80 p-1"
      role="tablist"
      aria-label="Journal views"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={
            tab.id === "days"
              ? "/app/journal"
              : `/app/journal?view=${tab.id}`
          }
          role="tab"
          aria-selected={active === tab.id}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            active === tab.id
              ? "bg-ink-fg text-ink-bg"
              : "text-ink-muted hover:text-ink-fg"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
