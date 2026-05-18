import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  formatLocalDateLong,
  formatMinutesLocal,
  localDayUtcBounds,
} from "@/lib/datetime";
import { getDailyPrompt, profileVoice } from "@/lib/prompts/getDailyPrompt";
import type { TopicId } from "@/lib/promptEngine";
import {
  currentOpenNudge,
  legacyScheduleFromProfile,
  nextUpcomingNudge,
  resolvedNudgesForDay,
} from "@/lib/nudges";
import { HumanOnlyBanner } from "@/components/HumanOnlyBanner";

export async function TodayPrompt({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  const topics = (profile?.topics ?? []) as TopicId[];
  const timeZone = profile?.timezone || "UTC";
  const schedule = legacyScheduleFromProfile(profile ?? {});
  const fired = (profile?.nudges_fired ?? []) as string[];
  const now = new Date();
  const resolved = resolvedNudgesForDay(
    schedule,
    userId,
    now,
    fired,
    timeZone
  );
  const active = currentOpenNudge(resolved, timeZone, now);
  const upcoming = nextUpcomingNudge(resolved, timeZone, now);
  const target = active ?? upcoming ?? resolved[0];

  if (!target) {
    return (
      <p className="text-ink-muted">No nudges enabled. Add some in Settings.</p>
    );
  }

  const atLabel = formatMinutesLocal(
    target.effectiveMinutes,
    timeZone,
    now
  );
  const voice = profileVoice(profile ?? {});

  const { prompt, source } = await getDailyPrompt(
    supabase,
    userId,
    topics,
    target.id,
    {
      label: target.label,
      kind: target.kind,
      topicHint: target.topicHint,
      effectiveMinutes: target.effectiveMinutes,
      timeZone,
      voice,
    },
    now
  );

  const { start, end } = localDayUtcBounds(timeZone, now);
  const { data: todayEntry } = await supabase
    .from("entries")
    .select("id")
    .eq("user_id", userId)
    .eq("prompt_slot", target.id)
    .eq("is_draft", false)
    .gte("written_at", start)
    .lte("written_at", end)
    .maybeSingle();

  const baseMinutes =
    parseInt(target.baseTime.split(":")[0], 10) * 60 +
    parseInt(target.baseTime.split(":")[1], 10);
  const showJitter =
    schedule.spontaneous &&
    target.kind === "daily" &&
    Math.abs(target.effectiveMinutes - baseMinutes) > 2;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-ink-muted tracking-wide uppercase">
          {target.label}
          {active ? " · now" : ` · today at ${atLabel}`}
          {" · "}
          {formatLocalDateLong(now, timeZone)}
        </p>
        {showJitter && (
          <p className="mt-1 text-xs text-ink-muted">
            Base time {target.baseTime} · today&apos;s nudge at {atLabel} (local)
          </p>
        )}
        <h1 className="font-serif text-3xl mt-2 leading-snug">{prompt}</h1>
        {source === "llm" && (
          <p className="mt-2 text-xs text-ink-muted">
            Shaped by your themes and voice from onboarding.
          </p>
        )}
      </div>

      <HumanOnlyBanner compact />

      {todayEntry ? (
        <div className="rounded-2xl border border-ink-border bg-ink-surface px-5 py-4">
          <p className="text-sm text-ink-muted">
            You already wrote for this nudge today.
          </p>
          <Link
            href="/app/journal"
            className="inline-block mt-3 text-sm font-medium text-ink-accent"
          >
            View journal →
          </Link>
        </div>
      ) : (
        <Link
          href={`/app/write?nudge=${encodeURIComponent(target.id)}`}
          className="flex w-full justify-center rounded-full bg-ink-fg text-ink-bg py-4 font-medium hover:opacity-90 transition-opacity"
        >
          Start writing
        </Link>
      )}

      {upcoming && active && upcoming.id !== active.id && (
        <p className="text-xs text-ink-muted">
          Next: {upcoming.label} at{" "}
          {formatMinutesLocal(upcoming.effectiveMinutes, timeZone, now)}
        </p>
      )}
    </div>
  );
}
