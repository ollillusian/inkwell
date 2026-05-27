"use client";

import { TOPIC_COLORS } from "@/lib/themeGraph";
import { isValidTopicId, type TopicId } from "@/lib/promptEngine";
import type { ThemeTimelineStep } from "@/lib/themeTimeline";

type Props = {
  steps: ThemeTimelineStep[];
  activeIndex: number;
  onSelect: (index: number) => void;
};

function cellColor(step: ThemeTimelineStep): string {
  const id = step.dominantTopicId;
  if (id && isValidTopicId(id)) {
    return TOPIC_COLORS[id as TopicId] ?? "var(--ink-muted)";
  }
  const intensity = Math.min(step.entryCount / 4, 1);
  return `color-mix(in srgb, var(--ink-accent) ${Math.round(intensity * 55)}%, var(--ink-border))`;
}

export function ThemeCalendarHeatmap({ steps, activeIndex, onSelect }: Props) {
  if (steps.length === 0) return null;

  return (
    <div
      className="flex gap-0.5 w-full min-w-0 overflow-x-auto pb-0.5 scroll-smooth"
      role="listbox"
      aria-label="Timeline overview"
    >
      {steps.map((s, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={`${s.granularity}-${s.dateKey}`}
            type="button"
            role="option"
            aria-selected={active}
            title={`${s.shortLabel} · ${s.entryCount} entries`}
            onClick={() => onSelect(i)}
            className={`h-2 flex-1 min-w-[6px] max-w-4 rounded-sm transition-all ${
              active
                ? "ring-1 ring-ink-fg ring-offset-1 ring-offset-ink-bg scale-y-125"
                : "opacity-80 hover:opacity-100"
            }`}
            style={{ background: cellColor(s) }}
          />
        );
      })}
    </div>
  );
}
