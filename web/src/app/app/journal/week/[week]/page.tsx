import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  formatWeekRange,
  formatWrittenAt,
} from "@/lib/datetime";
import { wordCount } from "@/lib/journal";
import { entriesToThemeGraphInput } from "@/lib/journalGraph";
import {
  dayGroupsInWeek,
  entriesForLocalWeek,
  normalizeWeekStartKey,
  weekStartFromDateKey,
} from "@/lib/journalPeriod";
import { legacyScheduleFromProfile } from "@/lib/nudges";
import { formatOnDemandPromptLabel } from "@/lib/prompts/onDemandPrompt";
import type { TopicId } from "@/lib/promptEngine";
import { buildDayThemeGraph } from "@/lib/themeGraph";
import { sanitizeStoryProse } from "@/lib/storyFormat";
import { ThemeNetworkGraph } from "@/components/ThemeNetworkGraph";
import { PeriodStoryPanel } from "@/components/PeriodStoryPanel";
import type { Entry } from "@/types/database";

type Props = {
  params: Promise<{ week: string }>;
};

function slotLabel(
  slot: string,
  labelById: Record<string, string>
): string {
  return labelById[slot] ?? formatOnDemandPromptLabel(slot) ?? slot;
}

export default async function JournalWeekPage({ params }: Props) {
  const { week: weekParam } = await params;
  if (!normalizeWeekStartKey(weekParam)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const timeZone = profile?.timezone || "UTC";
  const weekStartKey = weekStartFromDateKey(weekParam, timeZone);
  const schedule = legacyScheduleFromProfile(profile ?? {});
  const labelById = Object.fromEntries(
    schedule.nudges.map((n) => [n.id, n.label])
  );
  const resolveLabel = (slot: string) => slotLabel(slot, labelById);

  const { data: allEntries } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", user.id)
    .order("written_at", { ascending: false })
    .limit(500);

  const all = (allEntries ?? []) as Entry[];
  const weekEntries = entriesForLocalWeek(all, weekStartKey, timeZone);

  if (weekEntries.length === 0) {
    return (
      <div className="space-y-6">
        <Link href="/app/journal?view=weeks" className="text-sm text-ink-accent">
          ← Journal
        </Link>
        <p className="font-serif text-2xl text-ink-muted">No entries this week</p>
      </div>
    );
  }

  const themeGraph = buildDayThemeGraph(
    entriesToThemeGraphInput(weekEntries, timeZone, resolveLabel),
    (profile?.topics ?? []) as TopicId[],
    { momentByDay: true }
  );

  const { data: periodStory } = await supabase
    .from("period_stories")
    .select("body")
    .eq("user_id", user.id)
    .eq("period_type", "week")
    .eq("period_key", weekStartKey)
    .maybeSingle();

  const totalWords = weekEntries.reduce((n, e) => n + wordCount(e.body), 0);
  const dayGroups = dayGroupsInWeek(all, weekStartKey, timeZone);
  const title = formatWeekRange(weekStartKey, timeZone);

  return (
    <div className="space-y-10 pb-8">
      <div>
        <Link href="/app/journal?view=weeks" className="text-sm text-ink-accent">
          ← Journal
        </Link>
        <h1 className="font-serif text-3xl mt-4">{title}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {weekEntries.length}{" "}
          {weekEntries.length === 1 ? "entry" : "entries"} · {dayGroups.length}{" "}
          {dayGroups.length === 1 ? "day" : "days"} · {totalWords} words
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
          Theme map
        </h2>
        <p className="text-xs text-ink-muted -mt-1">
          Inner nodes are days; outer ring is themes. Links show how ideas moved
          through the week.
        </p>
        <ThemeNetworkGraph graph={themeGraph} />
      </section>

      <PeriodStoryPanel
        period="week"
        periodKey={weekStartKey}
        initialStory={
          periodStory?.body ? sanitizeStoryProse(periodStory.body) : null
        }
        entryCount={weekEntries.length}
      />

      <section className="space-y-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
          By day
        </h2>
        {dayGroups.map(({ dateKey, entries: dayEntries }) => (
          <div key={dateKey} className="space-y-3">
            <Link
              href={`/app/journal/${dateKey}`}
              className="text-sm font-medium text-ink-accent hover:underline"
            >
              {dayEntries.length}{" "}
              {dayEntries.length === 1 ? "entry" : "entries"} · open day →
            </Link>
            <ul className="space-y-4">
              {dayEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-2xl border border-ink-border bg-ink-surface p-5"
                >
                  <p className="text-xs text-ink-muted uppercase tracking-wide">
                    {resolveLabel(entry.prompt_slot)} ·{" "}
                    {formatWrittenAt(entry.written_at, timeZone)} ·{" "}
                    {wordCount(entry.body)} words
                  </p>
                  <p className="mt-2 font-serif text-lg text-ink-muted line-clamp-2">
                    {entry.prompt_text}
                  </p>
                  <p className="mt-2 text-sm text-ink-fg line-clamp-3 whitespace-pre-wrap">
                    {entry.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
