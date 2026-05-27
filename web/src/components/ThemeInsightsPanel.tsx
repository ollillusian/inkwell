"use client";

import { useCallback, useMemo, useState } from "react";
import { buildThemeTimeline, type ThemeTimelineGranularity } from "@/lib/themeTimeline";
import type { TopicId } from "@/lib/promptEngine";
import type { Entry } from "@/types/database";
import { ThemeTimelineSlider } from "@/components/ThemeTimelineSlider";

type TimelineEntry = Pick<
  Entry,
  "id" | "topics_snapshot" | "prompt_slot" | "written_at" | "body"
>;

type Props = {
  entries: TimelineEntry[];
  timeZone: string;
  labelById: Record<string, string>;
  profileTopics: TopicId[];
};

const GRAINS: { id: ThemeTimelineGranularity; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export function ThemeInsightsPanel({
  entries,
  timeZone,
  labelById,
  profileTopics,
}: Props) {
  const [granularity, setGranularity] =
    useState<ThemeTimelineGranularity>("day");

  const resolveLabel = useCallback(
    (slot: string) => labelById[slot] ?? slot,
    [labelById]
  );

  const steps = useMemo(
    () =>
      buildThemeTimeline(
        entries as Entry[],
        timeZone,
        resolveLabel,
        profileTopics,
        { granularity }
      ),
    [entries, timeZone, resolveLabel, profileTopics, granularity]
  );

  return (
    <div className="space-y-2 w-full min-w-0">
      <div
        className="flex rounded-lg border border-ink-border/60 p-0.5 bg-ink-bg/40 w-fit"
        role="tablist"
        aria-label="Timeline grain"
      >
        {GRAINS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={granularity === g.id}
            onClick={() => setGranularity(g.id)}
            className={`rounded-md px-3 py-1 text-xs transition-colors ${
              granularity === g.id
                ? "bg-ink-fg text-ink-bg"
                : "text-ink-muted hover:text-ink-fg"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>
      <ThemeTimelineSlider key={granularity} steps={steps} />
    </div>
  );
}
