"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ThemeTimelineStep } from "@/lib/themeTimeline";
import { ThemeNetworkGraph } from "@/components/ThemeNetworkGraph";

type Props = {
  steps: ThemeTimelineStep[];
};

function ChangeList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-ink-muted">
        <span className="font-medium text-ink-fg">{title}:</span> {empty}
      </p>
    );
  }
  return (
    <div>
      <p className="text-xs font-medium text-ink-fg">{title}</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="rounded-full border border-ink-border bg-ink-bg px-2 py-0.5 text-[10px] text-ink-muted"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ThemeTimelineSlider({ steps }: Props) {
  const [index, setIndex] = useState(() => Math.max(0, steps.length - 1));

  const step = steps[index];
  const maxIndex = Math.max(0, steps.length - 1);

  const sparkHeights = useMemo(() => {
    const max = Math.max(...steps.map((s) => s.stats.links), 1);
    return steps.map((s) => 8 + (s.stats.links / max) * 24);
  }, [steps]);

  if (!step) {
    return (
      <p className="text-sm text-ink-muted">No days with entries to show yet.</p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-ink-border bg-ink-surface/80 px-4 py-4 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Timeline
            </p>
            <p className="font-serif text-xl mt-1">{step.dateLabel}</p>
            <p className="text-xs text-ink-muted mt-1">
              Day {index + 1} of {steps.length} · {step.entryCount}{" "}
              {step.entryCount === 1 ? "entry" : "entries"} · {step.stats.topics}{" "}
              themes · {step.stats.links} links
            </p>
          </div>
          <Link
            href={`/app/journal/${step.dateKey}`}
            className="text-sm text-ink-accent hover:underline shrink-0"
          >
            Open full day →
          </Link>
        </div>

        <div className="flex items-end gap-0.5 h-8" aria-hidden>
          {sparkHeights.map((h, i) => (
            <div
              key={steps[i]!.dateKey}
              className={`flex-1 rounded-t-sm min-w-[3px] transition-colors ${
                i === index ? "bg-ink-accent" : "bg-ink-border/80"
              }`}
              style={{ height: `${h}px` }}
            />
          ))}
        </div>

        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={maxIndex}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            className="w-full accent-ink-accent"
            aria-label="Scrub through days to see how your theme map changes"
          />
          <div className="flex justify-between text-[10px] text-ink-muted">
            <span>{steps[0]?.dateLabel}</span>
            <span>{steps[maxIndex]?.dateLabel}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={index <= 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="rounded-full border border-ink-border px-3 py-1.5 text-xs disabled:opacity-40"
          >
            ← Earlier
          </button>
          <button
            type="button"
            disabled={index >= maxIndex}
            onClick={() => setIndex((i) => Math.min(maxIndex, i + 1))}
            className="rounded-full border border-ink-border px-3 py-1.5 text-xs disabled:opacity-40"
          >
            Later →
          </button>
        </div>
      </section>

      {step.change && (
        <section className="rounded-2xl border border-ink-border bg-ink-surface/60 px-4 py-4 space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
            How this day built on the last
          </h2>
          {step.change.firstDay ? (
            <p className="text-sm text-ink-muted leading-relaxed">
              First day in this span — everything you see in the map was pulled
              from that day&apos;s entries (themes from your words, moments from
              each nudge, phrases that repeat in your writing).
            </p>
          ) : (
            <div className="space-y-3">
              <ChangeList
                title="New themes"
                items={step.change.newTopics}
                empty="none new"
              />
              <ChangeList
                title="Themes again from yesterday"
                items={step.change.topicsAgain}
                empty="none carried over"
              />
              <ChangeList
                title="New phrases"
                items={step.change.newPhrases}
                empty="none"
              />
              <ChangeList
                title="New nudge moments"
                items={step.change.newMoments}
                empty="none"
              />
              {step.change.strongerTopics.length > 0 && (
                <ChangeList
                  title="Themes that showed up more"
                  items={step.change.strongerTopics}
                  empty=""
                />
              )}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
          Network for this day
        </h2>
        <p className="text-xs text-ink-muted leading-relaxed">
          Same map as the day view: themes from your text, moments per nudge,
          dashed links for recurring phrases. Pan and zoom on the graph below.
        </p>
        <ThemeNetworkGraph graph={step.graph} />
      </section>
    </div>
  );
}
