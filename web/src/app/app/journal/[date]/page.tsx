import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  entriesForLocalDate,
  entryLocalDateKey,
  wordCount,
} from "@/lib/journal";
import type { Entry } from "@/types/database";
import {
  formatLocalDateLong,
  formatWrittenAt,
  zonedLocalToUtc,
} from "@/lib/datetime";
import { legacyScheduleFromProfile } from "@/lib/nudges";
import { formatOnDemandPromptLabel } from "@/lib/prompts/onDemandPrompt";
import type { TopicId } from "@/lib/promptEngine";
import { buildDayThemeGraph } from "@/lib/themeGraph";
import { sanitizeStoryProse } from "@/lib/storyFormat";
import { ThemeNetworkGraph } from "@/components/ThemeNetworkGraph";
import { DayStoryPanel } from "@/components/DayStoryPanel";

type Props = {
  params: Promise<{ date: string }>;
};

function slotLabel(
  slot: string,
  labelById: Record<string, string>
): string {
  return labelById[slot] ?? formatOnDemandPromptLabel(slot) ?? slot;
}

export default async function JournalDayPage({ params }: Props) {
  const { date: dateKey } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) notFound();

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
  const dayEntries = entriesForLocalDate(all, dateKey, timeZone);
  const draftCount = all.filter(
    (e) => e.is_draft === true && entryLocalDateKey(e.written_at, timeZone) === dateKey
  ).length;

  if (dayEntries.length === 0) {
    return (
      <div className="space-y-6">
        <Link href="/app/journal" className="text-sm text-ink-accent">
          ← Journal
        </Link>
        <p className="font-serif text-2xl text-ink-muted">No entries this day</p>
        {draftCount > 0 && (
          <p className="text-sm text-ink-muted leading-relaxed">
            You have {draftCount} unsaved draft
            {draftCount === 1 ? "" : "s"} for this day. Open the prompt on Today
            and tap &quot;Save to journal&quot; to publish them.
          </p>
        )}
      </div>
    );
  }

  const [y, mo, d] = dateKey.split("-").map(Number);
  const dayDate = zonedLocalToUtc(y, mo, d, 12, 0, timeZone);
  const themeGraph = buildDayThemeGraph(
    dayEntries.map((e) => ({
      id: e.id,
      topics_snapshot: e.topics_snapshot,
      prompt_slot: e.prompt_slot,
      nudgeLabel: resolveLabel(e.prompt_slot),
    })),
    (profile?.topics ?? []) as TopicId[]
  );

  const { data: dayStory } = await supabase
    .from("day_stories")
    .select("body")
    .eq("user_id", user.id)
    .eq("story_date", dateKey)
    .maybeSingle();

  const totalWords = dayEntries.reduce((n, e) => n + wordCount(e.body), 0);

  return (
    <div className="space-y-10 pb-8">
      <div>
        <Link href="/app/journal" className="text-sm text-ink-accent">
          ← Journal
        </Link>
        <h1 className="font-serif text-3xl mt-4">
          {formatLocalDateLong(dayDate, timeZone)}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {dayEntries.length} {dayEntries.length === 1 ? "entry" : "entries"} ·{" "}
          {totalWords} words
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
          Theme map
        </h2>
        <ThemeNetworkGraph graph={themeGraph} />
      </section>

      <DayStoryPanel
        dateKey={dateKey}
        initialStory={
          dayStory?.body ? sanitizeStoryProse(dayStory.body) : null
        }
        entryCount={dayEntries.length}
      />

      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
          Entries
        </h2>
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
              <p className="mt-2 font-serif text-lg text-ink-muted">
                {entry.prompt_text}
              </p>
              <p className="mt-3 text-ink-fg leading-relaxed whitespace-pre-wrap">
                {entry.body}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
