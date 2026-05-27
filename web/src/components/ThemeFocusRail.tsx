"use client";

import Link from "next/link";
import {
  firstLastStepWithTopic,
  topicSeriesAcrossSteps,
} from "@/lib/themeTopicSeries";
import type { ThemeTimelineGranularity, ThemeTimelineStep } from "@/lib/themeTimeline";
import type { ThemeGraphNode } from "@/lib/themeGraph";

type Props = {
  steps: ThemeTimelineStep[];
  node: ThemeGraphNode;
  activeIndex: number;
  granularity: ThemeTimelineGranularity;
  onClear: () => void;
};

function journalHref(
  granularity: ThemeTimelineGranularity,
  dateKey: string
): string {
  if (granularity === "week") return `/app/journal/week/${dateKey}`;
  if (granularity === "month") return `/app/journal/month/${dateKey}`;
  return `/app/journal/${dateKey}`;
}

export function ThemeFocusRail({
  steps,
  node,
  activeIndex,
  granularity,
  onClear,
}: Props) {
  const series = topicSeriesAcrossSteps(steps, node.id);
  const max = Math.max(...series.map((p) => p.weight), 1);
  const { first, last } = firstLastStepWithTopic(series);
  const activeWeight = series[activeIndex]?.weight ?? 0;

  return (
    <div className="rounded-xl border border-ink-border/70 bg-ink-bg/60 px-3 py-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-fg truncate">
            Focus: {node.label}
          </p>
          <p className="text-[10px] text-ink-muted mt-0.5">
            {activeWeight > 0
              ? `${activeWeight} ${activeWeight === 1 ? "mention" : "mentions"} this frame`
              : "Not in this frame — still on the map"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-ink-accent hover:underline shrink-0"
        >
          Clear
        </button>
      </div>

      <div
        className="flex items-end gap-px h-8 w-full"
        role="img"
        aria-label={`${node.label} across timeline`}
      >
        {series.map((p) => {
          const h = p.weight > 0 ? 4 + (p.weight / max) * 24 : 2;
          const lit = p.stepIndex === activeIndex;
          return (
            <div
              key={p.dateKey}
              className={`flex-1 min-w-0 rounded-t-sm ${
                lit ? "bg-ink-accent" : p.weight > 0 ? "bg-ink-accent/35" : "bg-ink-border/40"
              }`}
              style={{ height: `${h}px` }}
              title={`${p.shortLabel}: ${p.weight}`}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 text-[10px]">
        {first && (
          <Link
            href={journalHref(granularity, first.dateKey)}
            className="text-ink-accent hover:underline"
          >
            First seen ({first.shortLabel}) →
          </Link>
        )}
        {last && last.dateKey !== first?.dateKey && (
          <Link
            href={journalHref(granularity, last.dateKey)}
            className="text-ink-accent hover:underline"
          >
            Latest ({last.shortLabel}) →
          </Link>
        )}
      </div>
    </div>
  );
}
