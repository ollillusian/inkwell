import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  formatLocalDateLong,
  formatLocalTime,
  formatMinutesLocal,
  formatMinutesUntil,
  localDayUtcBounds,
} from "@/lib/datetime";
import { nudgeEntryStatusForDay } from "@/lib/entryStatus";
import { getDailyPrompt, profileVoice } from "@/lib/prompts/getDailyPrompt";
import type { TopicId } from "@/lib/promptEngine";
import {
  currentOpenNudge,
  lastPassedNudge,
  legacyScheduleFromProfile,
  nextUpcomingNudge,
  nudgeTimingState,
  resolvedNudgesForDay,
} from "@/lib/nudges";
import { timezoneLabel } from "@/lib/timezones";
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
  const target =
    active ??
    upcoming ??
    lastPassedNudge(resolved, timeZone, now) ??
    resolved[0];

  if (!target) {
    return (
      <p className="text-ink-muted">No nudges enabled. Add some in Settings.</p>
    );
  }

  const timing = active
    ? ("open" as const)
    : upcoming?.id === target.id
      ? ("upcoming" as const)
      : nudgeTimingState(target, timeZone, now);

  const atLabel = formatMinutesLocal(target.effectiveMinutes, timeZone, now);
  const untilLabel = formatMinutesUntil(now, target.effectiveMinutes, timeZone);
  const nowLabel = formatLocalTime(now, timeZone);
  const tzLabel = timezoneLabel(timeZone);
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
  const { publishedId, draftId } = await nudgeEntryStatusForDay(
    supabase,
    userId,
    target.id,
    start,
    end
  );

  const writeHref = `/app/write?nudge=${encodeURIComponent(target.id)}`;

  const baseMinutes =
    parseInt(target.baseTime.split(":")[0], 10) * 60 +
    parseInt(target.baseTime.split(":")[1], 10);
  const showJitter =
    schedule.spontaneous &&
    target.kind === "daily" &&
    Math.abs(target.effectiveMinutes - baseMinutes) > 2;

  const statusLine =
    timing === "open"
      ? " · now"
      : timing === "upcoming"
        ? ` · up next at ${atLabel} (${untilLabel})`
        : ` · earlier today at ${atLabel}`;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-ink-muted tracking-wide uppercase">
          {target.label}
          {statusLine}
          {" · "}
          {formatLocalDateLong(now, timeZone)}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Your time now: {nowLabel} ({tzLabel})
        </p>
        {timing === "upcoming" && (
          <p className="mt-2 text-sm text-ink-muted leading-relaxed">
            This nudge isn&apos;t open yet — you can still use{" "}
            <span className="text-ink-fg">Nudge me now</span> above anytime.
          </p>
        )}
        {showJitter && (
          <p className="mt-1 text-xs text-ink-muted">
            Base time {target.baseTime} · today&apos;s nudge at {atLabel} (local)
          </p>
        )}
        <h1
          className={`font-serif mt-2 leading-snug ${
            timing === "upcoming" ? "text-3xl text-ink-fg/90" : "text-3xl"
          }`}
        >
          {prompt}
        </h1>
        {source === "llm" && (
          <p className="mt-2 text-xs text-ink-muted">
            Shaped by your themes and voice from onboarding.
          </p>
        )}
      </div>

      <HumanOnlyBanner compact />

      {publishedId ? (
        <div className="rounded-2xl border border-ink-border bg-ink-surface px-5 py-4">
          <p className="text-sm text-ink-muted">
            You saved an entry for this nudge today.
          </p>
          <Link
            href="/app/journal"
            className="inline-block mt-3 text-sm font-medium text-ink-accent"
          >
            View journal →
          </Link>
        </div>
      ) : timing === "upcoming" ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-ink-muted">
            Opens at {atLabel} ({untilLabel})
          </p>
          <Link
            href={writeHref}
            className="flex w-full justify-center rounded-full border border-ink-border px-4 py-3.5 text-sm font-medium text-ink-fg hover:bg-ink-surface transition-colors"
          >
            Write early anyway
          </Link>
        </div>
      ) : draftId ? (
        <div className="rounded-2xl border border-ink-border bg-ink-surface px-5 py-4 space-y-3">
          <p className="text-sm text-ink-muted">
            You have an unsaved draft for this nudge — not in your journal yet.
          </p>
          <Link
            href={writeHref}
            className="flex w-full justify-center rounded-full bg-ink-fg text-ink-bg py-3.5 font-medium hover:opacity-90 transition-opacity"
          >
            Continue draft
          </Link>
        </div>
      ) : (
        <Link
          href={writeHref}
          className="flex w-full justify-center rounded-full bg-ink-fg text-ink-bg py-4 font-medium hover:opacity-90 transition-opacity"
        >
          Start writing
        </Link>
      )}

      {upcoming && active && upcoming.id !== active.id && (
        <p className="text-xs text-ink-muted">
          Next: {upcoming.label} at{" "}
          {formatMinutesLocal(upcoming.effectiveMinutes, timeZone, now)} (
          {formatMinutesUntil(now, upcoming.effectiveMinutes, timeZone)})
        </p>
      )}
    </div>
  );
}
