import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  formatMonthLabel,
  formatWeekRange,
  formatLocalDateLong,
  zonedLocalToUtc,
} from "@/lib/datetime";
import {
  groupEntriesByLocalDay,
  publishedEntries,
  wordCount,
} from "@/lib/journal";
import {
  groupEntriesByLocalMonth,
  groupEntriesByLocalWeek,
} from "@/lib/journalPeriod";
import {
  JournalViewTabs,
  type JournalView,
} from "@/components/JournalViewTabs";
import { ThemeTimelineSlider } from "@/components/ThemeTimelineSlider";
import { legacyScheduleFromProfile } from "@/lib/nudges";
import { formatOnDemandPromptLabel } from "@/lib/prompts/onDemandPrompt";
import type { TopicId } from "@/lib/promptEngine";
import { buildThemeTimeline } from "@/lib/themeTimeline";
import type { Entry } from "@/types/database";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ view?: string }>;
};

function parseView(raw?: string): JournalView {
  if (raw === "weeks" || raw === "months" || raw === "timeline") return raw;
  return "days";
}

function slotLabel(
  slot: string,
  labelById: Record<string, string>
): string {
  return labelById[slot] ?? formatOnDemandPromptLabel(slot) ?? slot;
}

export default async function JournalPage({ searchParams }: Props) {
  const { view: viewParam } = await searchParams;
  const view = parseView(viewParam);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: entries } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", user.id)
    .order("written_at", { ascending: false })
    .limit(500);

  const list = publishedEntries((entries ?? []) as Entry[]);
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const timeZone = profile?.timezone || "UTC";
  const schedule = legacyScheduleFromProfile(profile ?? {});
  const labelById = Object.fromEntries(
    schedule.nudges.map((n) => [n.id, n.label])
  );
  const resolveLabel = (slot: string) => slotLabel(slot, labelById);
  const profileTopics = (profile?.topics ?? []) as TopicId[];

  if (list.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="font-serif text-2xl text-ink-muted">No entries yet</p>
        <p className="mt-2 text-sm text-ink-muted">
          Your first prompt is waiting on Today.
        </p>
        <Link
          href="/app"
          className="inline-block mt-6 text-ink-accent font-medium"
        >
          Go to Today →
        </Link>
      </div>
    );
  }

  const days = groupEntriesByLocalDay(list, timeZone);
  const weeks = groupEntriesByLocalWeek(list, timeZone);
  const months = groupEntriesByLocalMonth(list, timeZone);

  const timelineSteps =
    view === "timeline"
      ? buildThemeTimeline(list, timeZone, resolveLabel, profileTopics)
      : [];

  const blurb =
    view === "timeline"
      ? "Scrub days to see how your theme map grows (last 45 days with entries)."
      : view === "weeks"
        ? "Open a week for a theme map, woven story, and entries grouped by day."
        : view === "months"
          ? "Open a month for a longer story and how themes moved across the month."
          : "Open a day for your theme map, a woven short story, and full entries.";

  return (
    <div className="space-y-6 pb-8 w-full min-w-0 max-w-full">
      <div className="space-y-4 min-w-0">
        <h1 className="font-serif text-3xl">Journal</h1>
        <JournalViewTabs active={view} />
        <p className="text-sm text-ink-muted leading-relaxed">{blurb}</p>
      </div>

      {view === "timeline" && (
        <div className="w-full min-w-0">
          <ThemeTimelineSlider steps={timelineSteps} />
        </div>
      )}

      {view === "days" && (
        <ul className="space-y-4">
          {days.map(({ dateKey, entries: dayEntries }) => {
            const [y, mo, d] = dateKey.split("-").map(Number);
            const dayDate = zonedLocalToUtc(y, mo, d, 12, 0, timeZone);
            const preview = dayEntries[0];
            const totalWords = dayEntries.reduce(
              (n, e) => n + wordCount(e.body),
              0
            );
            return (
              <li key={dateKey}>
                <Link
                  href={`/app/journal/${dateKey}`}
                  className="block rounded-2xl border border-ink-border bg-ink-surface p-5 hover:border-ink-accent/40 transition-colors"
                >
                  <p className="font-serif text-xl">
                    {formatLocalDateLong(dayDate, timeZone)}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted uppercase tracking-wide">
                    {dayEntries.length}{" "}
                    {dayEntries.length === 1 ? "entry" : "entries"} ·{" "}
                    {totalWords} words
                  </p>
                  <p className="mt-2 text-sm text-ink-muted line-clamp-2">
                    {preview.body.trim() || preview.prompt_text}
                  </p>
                  <p className="mt-2 text-xs text-ink-accent">
                    View day → story & graph
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {view === "weeks" && (
        <ul className="space-y-4">
          {weeks.map(({ weekStartKey, entries: weekEntries }) => {
            const preview = weekEntries[weekEntries.length - 1];
            const totalWords = weekEntries.reduce(
              (n, e) => n + wordCount(e.body),
              0
            );
            const dayCount = new Set(
              weekEntries.map((e) =>
                new Intl.DateTimeFormat("en-CA", {
                  timeZone,
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                }).format(new Date(e.written_at))
              )
            ).size;
            return (
              <li key={weekStartKey}>
                <Link
                  href={`/app/journal/week/${weekStartKey}`}
                  className="block rounded-2xl border border-ink-border bg-ink-surface p-5 hover:border-ink-accent/40 transition-colors"
                >
                  <p className="font-serif text-xl">
                    {formatWeekRange(weekStartKey, timeZone)}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted uppercase tracking-wide">
                    {weekEntries.length}{" "}
                    {weekEntries.length === 1 ? "entry" : "entries"} ·{" "}
                    {dayCount} {dayCount === 1 ? "day" : "days"} · {totalWords}{" "}
                    words
                  </p>
                  <p className="mt-2 text-sm text-ink-muted line-clamp-2">
                    {preview.body.trim() || preview.prompt_text}
                  </p>
                  <p className="mt-2 text-xs text-ink-accent">
                    View week → story & graph
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {view === "months" && (
        <ul className="space-y-4">
          {months.map(({ monthKey, entries: monthEntries }) => {
            const preview = monthEntries[monthEntries.length - 1];
            const totalWords = monthEntries.reduce(
              (n, e) => n + wordCount(e.body),
              0
            );
            return (
              <li key={monthKey}>
                <Link
                  href={`/app/journal/month/${monthKey}`}
                  className="block rounded-2xl border border-ink-border bg-ink-surface p-5 hover:border-ink-accent/40 transition-colors"
                >
                  <p className="font-serif text-xl">
                    {formatMonthLabel(monthKey, timeZone)}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted uppercase tracking-wide">
                    {monthEntries.length}{" "}
                    {monthEntries.length === 1 ? "entry" : "entries"} ·{" "}
                    {totalWords} words
                  </p>
                  <p className="mt-2 text-sm text-ink-muted line-clamp-2">
                    {preview.body.trim() || preview.prompt_text}
                  </p>
                  <p className="mt-2 text-xs text-ink-accent">
                    View month → story & graph
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
