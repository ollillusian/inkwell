"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import {
  timelineEmphasisIds,
  type ThemeTimelineStats,
  type ThemeTimelineStep,
} from "@/lib/themeTimeline";
import { ThemeNetworkGraph } from "@/components/ThemeNetworkGraph";

type Props = {
  steps: ThemeTimelineStep[];
};

function listSnippet(items: string[], max = 2): string {
  if (items.length === 0) return "";
  const head = items.slice(0, max).join(", ");
  const rest = items.length - max;
  return rest > 0 ? `${head}, +${rest} more` : head;
}

function dayNarrative(step: ThemeTimelineStep): string {
  const c = step.change;
  if (!c) return "Your theme map for this day.";
  if (c.firstDay) {
    return `First day: ${step.stats.topics} themes, ${step.stats.links} links, ${step.entryCount} ${step.entryCount === 1 ? "entry" : "entries"}.`;
  }
  const bits: string[] = [];
  if (c.newTopics.length > 0) {
    bits.push(`picked up ${listSnippet(c.newTopics)}`);
  }
  if (c.topicsAgain.length > 0) {
    bits.push(`kept ${listSnippet(c.topicsAgain)}`);
  }
  if (c.newPhrases.length > 0) {
    bits.push(`new phrase "${c.newPhrases[0]}"`);
  }
  if (c.strongerTopics.length > 0 && bits.length < 2) {
    bits.push(`${c.strongerTopics[0]} grew`);
  }
  if (bits.length === 0) {
    return "Quiet day — links shifted more than themes.";
  }
  return bits.join(" · ");
}

function statDelta(curr: number, prev: number | undefined): string | null {
  if (prev === undefined) return null;
  const d = curr - prev;
  if (d === 0) return null;
  return d > 0 ? `+${d}` : `${d}`;
}

function filmstripDayLabel(shortLabel: string): string {
  const parts = shortLabel.replace(",", "").trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0].slice(0, 3)} ${parts[parts.length - 1]}`;
  }
  return shortLabel.slice(0, 6);
}

function StatPill({
  label,
  value,
  delta,
}: {
  label: string;
  value: number;
  delta: string | null;
}) {
  return (
    <div className="rounded-lg border border-ink-border/60 bg-ink-bg/50 px-2 py-1.5 min-w-0">
      <p className="text-[9px] uppercase tracking-wide text-ink-muted truncate">
        {label}
      </p>
      <p className="font-serif text-base leading-tight mt-0.5 tabular-nums">
        {value}
        {delta && (
          <span
            className={`ml-1 text-[10px] font-sans ${
              delta.startsWith("+") ? "text-ink-accent" : "text-ink-muted"
            }`}
          >
            {delta}
          </span>
        )}
      </p>
    </div>
  );
}

function ChangeChip({
  label,
  tone,
}: {
  label: string;
  tone: "new" | "carry" | "strong";
}) {
  const toneClass =
    tone === "new"
      ? "border-ink-accent/40 bg-ink-accent/10 text-ink-fg"
      : tone === "carry"
        ? "border-ink-border bg-ink-surface text-ink-muted"
        : "border-ink-border bg-ink-bg text-ink-fg";
  return (
    <li
      className={`max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] ${toneClass}`}
      title={label}
    >
      {label}
    </li>
  );
}

export function ThemeTimelineSlider({ steps }: Props) {
  const [index, setIndex] = useState(() => Math.max(0, steps.length - 1));
  const [playing, setPlaying] = useState(false);
  const [highlightNew, setHighlightNew] = useState(true);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const step = steps[index];
  const maxIndex = Math.max(0, steps.length - 1);
  const prevStep = index > 0 ? steps[index - 1] : undefined;

  const linkScale = useMemo(() => {
    const max = Math.max(...steps.map((s) => s.stats.links), 1);
    return steps.map((s) => s.stats.links / max);
  }, [steps]);

  const emphasisIds = useMemo(
    () => (step && highlightNew ? timelineEmphasisIds(step) : []),
    [highlightNew, step]
  );

  const pulseIds = useMemo(() => {
    const c = step?.change;
    if (!c || c.firstDay || !highlightNew) return [];
    return [...c.newTopicIds, ...c.newPhraseIds, ...c.newMomentIds];
  }, [step, highlightNew]);

  const go = useCallback(
    (next: number) => setIndex(Math.min(maxIndex, Math.max(0, next))),
    [maxIndex]
  );

  useEffect(() => {
    const el = filmstripRef.current?.querySelector<HTMLElement>(
      `[data-day-index="${index}"]`
    );
    el?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [index]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i >= maxIndex ? 0 : i + 1));
    }, 900);
    return () => window.clearInterval(id);
  }, [playing, maxIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        go(0);
      } else if (e.key === "End") {
        e.preventDefault();
        go(maxIndex);
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, maxIndex]);

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchRef.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) go(index + 1);
    else go(index - 1);
  };

  if (!step) {
    return (
      <p className="text-sm text-ink-muted">No days with entries to show yet.</p>
    );
  }

  const prevStats: ThemeTimelineStats | undefined = prevStep?.stats;
  const c = step.change;
  const hasChanges =
    c &&
    !c.firstDay &&
    (c.newTopics.length > 0 ||
      c.topicsAgain.length > 0 ||
      c.newPhrases.length > 0 ||
      c.strongerTopics.length > 0);

  return (
    <div
      className="timeline-root flex flex-col gap-2"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Header: date + nav + play */}
      <div className="flex items-center justify-between gap-2 min-w-0 px-0.5">
        <div className="min-w-0 flex-1">
          <p
            className="font-serif text-lg sm:text-xl truncate"
            title={step.dateLabel}
          >
            {step.weekday}, {step.shortLabel}
          </p>
          <p className="text-xs text-ink-muted truncate mt-0.5">
            {dayNarrative(step)}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={index <= 0}
            onClick={() => go(index - 1)}
            className="rounded-md border border-ink-border w-7 h-7 text-xs flex items-center justify-center disabled:opacity-30"
            aria-label="Previous day"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className={`rounded-md w-7 h-7 text-[10px] flex items-center justify-center border transition-colors ${
              playing
                ? "bg-ink-accent text-ink-bg border-ink-accent"
                : "border-ink-border hover:border-ink-accent/50"
            }`}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button
            type="button"
            disabled={index >= maxIndex}
            onClick={() => go(index + 1)}
            className="rounded-md border border-ink-border w-7 h-7 text-xs flex items-center justify-center disabled:opacity-30"
            aria-label="Next day"
          >
            ›
          </button>
        </div>
      </div>

      {/* Filmstrip + slider — directly above graph */}
      <div className="w-full min-w-0">
        <div
          ref={filmstripRef}
          className="timeline-filmstrip flex gap-0.5 overflow-x-auto pb-1 scroll-smooth"
          role="tablist"
          aria-label="Days in timeline"
        >
          {steps.map((s, i) => {
            const active = i === index;
            const h = 8 + linkScale[i]! * 14;
            return (
              <button
                key={s.dateKey}
                type="button"
                data-day-index={i}
                role="tab"
                aria-selected={active}
                aria-label={`${s.shortLabel}, ${s.stats.links} links`}
                onClick={() => go(i)}
                className={`flex flex-col items-center justify-end shrink-0 w-8 rounded px-0.5 pt-1 pb-0.5 transition-colors ${
                  active
                    ? "bg-ink-fg text-ink-bg"
                    : "bg-ink-bg/50 text-ink-muted hover:bg-ink-surface border border-ink-border/30"
                }`}
              >
                <span
                  className={`w-1 rounded-full mb-0.5 ${
                    active ? "bg-ink-bg" : "bg-ink-accent/50"
                  }`}
                  style={{ height: `${h}px` }}
                  aria-hidden
                />
                <span className="text-[7px] leading-none text-center w-full truncate">
                  {filmstripDayLabel(s.shortLabel)}
                </span>
              </button>
            );
          })}
        </div>
        <input
          type="range"
          min={0}
          max={maxIndex}
          value={index}
          onChange={(e) => go(Number(e.target.value))}
          className="timeline-range w-full h-1 rounded-full appearance-none bg-ink-border/30 accent-ink-accent cursor-pointer mt-0.5"
          aria-label="Scrub through days"
        />
      </div>

      {/* Network graph — the main event */}
      <div className="w-full min-w-0">
        <ThemeNetworkGraph
          graph={step.graph}
          emphasisIds={emphasisIds}
          pulseIds={pulseIds}
          compact
        />
      </div>

      {/* Stats + vs yesterday — below graph */}
      <div className="flex flex-col gap-2 w-full min-w-0 px-0.5">
        <div className="flex items-center gap-2 w-full min-w-0">
          <div className="grid grid-cols-3 gap-1.5 flex-1 min-w-0">
            <StatPill
              label="Entries"
              value={step.entryCount}
              delta={statDelta(step.entryCount, prevStep?.entryCount)}
            />
            <StatPill
              label="Themes"
              value={step.stats.topics}
              delta={statDelta(step.stats.topics, prevStats?.topics)}
            />
            <StatPill
              label="Links"
              value={step.stats.links}
              delta={statDelta(step.stats.links, prevStats?.links)}
            />
          </div>
          <Link
            href={`/app/journal/${step.dateKey}`}
            className="text-xs text-ink-accent hover:underline shrink-0 whitespace-nowrap"
          >
            Open →
          </Link>
        </div>

        {hasChanges && (
          <div className="w-full min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-wide text-ink-muted mb-1">
              vs yesterday
            </p>
            <ul className="flex flex-wrap gap-1 min-w-0">
              {c.newTopics.map((t) => (
                <ChangeChip key={`n-${t}`} label={t} tone="new" />
              ))}
              {c.topicsAgain.map((t) => (
                <ChangeChip key={`c-${t}`} label={t} tone="carry" />
              ))}
              {c.strongerTopics.map((t) => (
                <ChangeChip key={`s-${t}`} label={`${t} ↑`} tone="strong" />
              ))}
              {c.newPhrases.map((t) => (
                <ChangeChip key={`p-${t}`} label={`"${t}"`} tone="new" />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
