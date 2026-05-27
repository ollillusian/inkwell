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
import { ThemeCalendarHeatmap } from "@/components/ThemeCalendarHeatmap";
import { ThemeFocusRail } from "@/components/ThemeFocusRail";
import { ThemeNetworkGraph } from "@/components/ThemeNetworkGraph";
import { useTimelineInsight } from "@/hooks/useTimelineInsight";
import type { ThemeGraphNode } from "@/lib/themeGraph";
import {
  directorsCutInputFromSteps,
  frameInsightInputFromStep,
} from "@/lib/themeInsightPayload";
import { detectTimelineEras, eraLabelAtStep } from "@/lib/themeEras";
import {
  buildThemeMatrixCsv,
  downloadSvgAsPng,
  downloadSvgElement,
  downloadTextFile,
} from "@/lib/themeExport";
import {
  compareTimelineGraphs,
  timelineEmphasisIds,
  type ThemeTimelineGranularity,
  type ThemeTimelineStats,
  type ThemeTimelineStep,
} from "@/lib/themeTimeline";

type Props = {
  steps: ThemeTimelineStep[];
};

const PLAY_MS: Record<number, number> = {
  0.75: 1200,
  1: 900,
  1.5: 600,
};

function priorPeriodLabel(g: ThemeTimelineGranularity): string {
  if (g === "week") return "vs prior week";
  if (g === "month") return "vs prior month";
  return "vs prior day";
}

function filmstripLabel(shortLabel: string, granularity: ThemeTimelineGranularity): string {
  if (granularity === "month") return shortLabel.slice(0, 8);
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
  tone: "new" | "carry" | "strong" | "gone";
}) {
  const toneClass =
    tone === "new"
      ? "border-ink-accent/40 bg-ink-accent/10 text-ink-fg"
      : tone === "carry"
        ? "border-ink-border bg-ink-surface text-ink-muted"
        : tone === "gone"
          ? "border-ink-border/60 bg-ink-bg/30 text-ink-muted line-through"
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

function statDelta(curr: number, prev: number | undefined): string | null {
  if (prev === undefined) return null;
  const d = curr - prev;
  if (d === 0) return null;
  return d > 0 ? `+${d}` : `${d}`;
}

export function ThemeTimelineSlider({ steps }: Props) {
  const [index, setIndex] = useState(() => Math.max(0, steps.length - 1));
  const [playing, setPlaying] = useState(false);
  const [highlightNew, setHighlightNew] = useState(true);
  const [playSpeed, setPlaySpeed] = useState<0.75 | 1 | 1.5>(1);
  const [loop, setLoop] = useState(true);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIndex, setCompareIndex] = useState(0);
  const [focusTopicId, setFocusTopicId] = useState<string | null>(null);
  const [aiCaption, setAiCaption] = useState<string | null>(null);
  const [directorsCut, setDirectorsCut] = useState<string | null>(null);
  const [useAiCaption, setUseAiCaption] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const graphHostRef = useRef<HTMLDivElement>(null);
  const { fetchInsight, state: insightState, error: insightError } =
    useTimelineInsight();

  const step = steps[index];
  const granularity = step?.granularity ?? "day";
  const maxIndex = Math.max(0, steps.length - 1);
  const prevStep = index > 0 ? steps[index - 1] : undefined;
  const compareStep = steps[compareIndex];

  useEffect(() => {
    setIndex((i) => Math.min(maxIndex, Math.max(0, i)));
    setCompareIndex((c) => Math.min(maxIndex, Math.max(0, c)));
  }, [maxIndex, steps]);

  useEffect(() => {
    if (index > 0) setCompareIndex(index - 1);
  }, [index]);

  const linkScale = useMemo(() => {
    const max = Math.max(...steps.map((s) => s.stats.links), 1);
    return steps.map((s) => s.stats.links / max);
  }, [steps]);

  const emphasisIds = useMemo(() => {
    if (!step || !highlightNew) return [];
    if (compareMode && compareStep) {
      const diff = compareTimelineGraphs(compareStep.graph, step.graph);
      return [
        ...diff.newTopicIds,
        ...diff.newPhraseIds,
        ...diff.newMomentIds,
        ...diff.strongerTopicIds,
      ];
    }
    return timelineEmphasisIds(step);
  }, [compareMode, compareStep, highlightNew, step]);

  const pulseIds = useMemo(() => {
    if (!step || !highlightNew) return [];
    const c = compareMode && compareStep
      ? compareTimelineGraphs(compareStep.graph, step.graph)
      : step.change;
    if (!c) return [];
    if (!compareMode && step.change?.firstDay) return [];
    if (step.beat === "surge") {
      return [
        ...c.newTopicIds,
        ...c.newPhraseIds,
        ...c.newMomentIds,
        ...c.strongerTopicIds,
      ];
    }
    return [...c.newTopicIds, ...c.newPhraseIds, ...c.newMomentIds];
  }, [compareMode, compareStep, highlightNew, step]);

  const compareDiff = useMemo(() => {
    if (!compareMode || !step || !compareStep || compareIndex === index) {
      return null;
    }
    return compareTimelineGraphs(compareStep.graph, step.graph);
  }, [compareMode, compareIndex, compareStep, index, step]);

  const goneTopics = useMemo(() => {
    if (!compareDiff || !compareStep) return [];
    const curr = new Set(
      step!.graph.nodes.filter((n) => n.kind === "topic").map((n) => n.id)
    );
    return compareStep.graph.nodes
      .filter((n) => n.kind === "topic" && !curr.has(n.id))
      .map((n) => n.label);
  }, [compareDiff, compareStep, step]);

  const focusNode: ThemeGraphNode | null = useMemo(() => {
    if (!focusTopicId || !step) return null;
    return step.graph.nodes.find((n) => n.id === focusTopicId) ?? null;
  }, [focusTopicId, step]);

  const eras = useMemo(() => detectTimelineEras(steps), [steps]);

  const displayCaption =
    useAiCaption && aiCaption ? aiCaption : step?.caption ?? "";

  useEffect(() => {
    setAiCaption(null);
    setUseAiCaption(false);
  }, [index, steps]);

  useEffect(() => {
    setDirectorsCut(null);
  }, [steps]);

  const loadAiCaption = useCallback(async () => {
    if (!step) return;
    const key = `frame:${step.granularity}:${step.dateKey}`;
    const text = await fetchInsight(key, {
      kind: "frame",
      input: frameInsightInputFromStep(step),
    });
    if (text) {
      setAiCaption(text);
      setUseAiCaption(true);
    }
  }, [fetchInsight, step]);

  const loadDirectorsCut = useCallback(async () => {
    if (steps.length === 0) return;
    const eraTitles = eras.map((e) => e.label);
    const input = directorsCutInputFromSteps(steps, eraTitles);
    if (!input) return;
    const key = `dc:${input.granularity}:${steps[0]!.dateKey}_${steps[steps.length - 1]!.dateKey}`;
    const text = await fetchInsight(key, {
      kind: "directors_cut",
      input,
    });
    if (text) setDirectorsCut(text);
  }, [eras, fetchInsight, steps]);

  const speakCaption = useCallback(() => {
    if (typeof window === "undefined" || !displayCaption) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(displayCaption);
    u.rate = playSpeed === 1.5 ? 1.08 : playSpeed === 0.75 ? 0.92 : 1;
    window.speechSynthesis.speak(u);
  }, [displayCaption, playSpeed]);

  const exportCsv = useCallback(() => {
    const csv = buildThemeMatrixCsv(steps);
    const g = steps[0]?.granularity ?? "day";
    downloadTextFile(`inkwell-themes-${g}.csv`, csv, "text/csv;charset=utf-8");
  }, [steps]);

  const exportGraph = useCallback(async (format: "svg" | "png") => {
    setExportError(null);
    const svg = graphHostRef.current?.querySelector("svg");
    if (!svg) {
      setExportError("Could not find graph SVG to export.");
      return;
    }
    const name = `inkwell-map-${step?.dateKey ?? "frame"}`;
    if (format === "svg") {
      downloadSvgElement(svg, `${name}.svg`);
      return;
    }
    try {
      await downloadSvgAsPng(svg, `${name}.png`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "PNG export failed");
    }
  }, [step?.dateKey]);

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
    const ms = PLAY_MS[playSpeed] ?? 900;
    const id = window.setInterval(() => {
      setIndex((i) => {
        if (i >= maxIndex) {
          if (loop) return 0;
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, ms);
    return () => window.clearInterval(id);
  }, [playing, maxIndex, loop, playSpeed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
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
      } else if (e.key === "Escape" && cinemaMode) {
        setCinemaMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cinemaMode, go, index, maxIndex]);

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
      <p className="text-sm text-ink-muted">No periods with entries to show yet.</p>
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

  const showComparePanel =
    compareMode && compareDiff && compareStep && compareIndex !== index;

  const rootClass = cinemaMode
    ? "timeline-cinema fixed inset-0 z-50 flex flex-col bg-ink-bg p-3 sm:p-5 overflow-y-auto"
    : "timeline-root flex flex-col gap-2";

  return (
    <div
      className={rootClass}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex items-center justify-between gap-2 min-w-0 px-0.5">
        <div className="min-w-0 flex-1">
          <p
            className={`font-serif truncate ${cinemaMode ? "text-2xl" : "text-lg sm:text-xl"}`}
            title={step.dateLabel}
          >
            {step.weekday === "Week" || step.weekday === "Month"
              ? step.dateLabel
              : `${step.weekday}, ${step.shortLabel}`}
          </p>
          <p
            className={`text-ink-fg/90 mt-1 leading-relaxed ${
              cinemaMode ? "text-sm" : "text-xs"
            } ${step.beat === "surge" ? "font-medium" : ""}`}
          >
            {displayCaption}
          </p>
          {useAiCaption && (
            <p className="text-[9px] text-ink-muted mt-0.5">AI narrator</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end max-w-[50%]">
          <button
            type="button"
            disabled={index <= 0}
            onClick={() => go(index - 1)}
            className="rounded-md border border-ink-border w-7 h-7 text-xs flex items-center justify-center disabled:opacity-30"
            aria-label="Previous"
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
            aria-label="Next"
          >
            ›
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-0.5 text-[10px]">
        <label className="flex items-center gap-1 text-ink-muted">
          <span className="sr-only">Playback speed</span>
          <select
            value={playSpeed}
            onChange={(e) =>
              setPlaySpeed(Number(e.target.value) as 0.75 | 1 | 1.5)
            }
            className="rounded border border-ink-border bg-ink-bg px-1.5 py-0.5 text-ink-fg"
          >
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
            <option value={1.5}>1.5×</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-ink-muted cursor-pointer">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
            className="accent-ink-accent"
          />
          Loop
        </label>
        <label className="flex items-center gap-1 text-ink-muted cursor-pointer">
          <input
            type="checkbox"
            checked={highlightNew}
            onChange={(e) => setHighlightNew(e.target.checked)}
            className="accent-ink-accent"
          />
          Highlight
        </label>
        <button
          type="button"
          onClick={() => setCompareMode((m) => !m)}
          className={`rounded-md border px-2 py-0.5 ${
            compareMode
              ? "border-ink-accent bg-ink-accent/10 text-ink-fg"
              : "border-ink-border text-ink-muted"
          }`}
        >
          Compare
        </button>
        <button
          type="button"
          onClick={() => setCinemaMode((m) => !m)}
          className="rounded-md border border-ink-border px-2 py-0.5 text-ink-muted hover:text-ink-fg"
        >
          {cinemaMode ? "Exit cinema" : "Cinema"}
        </button>
        <button
          type="button"
          onClick={loadAiCaption}
          disabled={insightState === "loading"}
          className="rounded-md border border-ink-border px-2 py-0.5 text-ink-muted hover:text-ink-fg disabled:opacity-40"
        >
          {insightState === "loading" ? "…" : "AI line"}
        </button>
        <button
          type="button"
          onClick={speakCaption}
          className="rounded-md border border-ink-border px-2 py-0.5 text-ink-muted hover:text-ink-fg"
          aria-label="Listen to narrator"
        >
          Listen
        </button>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-md border border-ink-border px-2 py-0.5 text-ink-muted hover:text-ink-fg"
        >
          CSV
        </button>
        <button
          type="button"
          onClick={() => void exportGraph("png")}
          className="rounded-md border border-ink-border px-2 py-0.5 text-ink-muted hover:text-ink-fg"
        >
          PNG
        </button>
      </div>

      {insightError && (
        <p className="text-[10px] text-amber-800/90 px-0.5">{insightError}</p>
      )}
      {exportError && (
        <p className="text-[10px] text-amber-800/90 px-0.5">{exportError}</p>
      )}

      {compareMode && (
        <div className="flex items-center gap-2 px-0.5 text-[10px]">
          <span className="text-ink-muted shrink-0">Compare to</span>
          <select
            value={compareIndex}
            onChange={(e) => setCompareIndex(Number(e.target.value))}
            className="flex-1 min-w-0 rounded border border-ink-border bg-ink-bg px-2 py-1 text-ink-fg"
          >
            {steps.map((s, i) => (
              <option key={s.dateKey} value={i} disabled={i === index}>
                {s.shortLabel}
                {i === index ? " (current)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <ThemeCalendarHeatmap
        steps={steps}
        activeIndex={index}
        onSelect={go}
      />

      <div className="w-full min-w-0">
        <div
          ref={filmstripRef}
          className="timeline-filmstrip flex gap-0.5 overflow-x-auto pb-1 scroll-smooth"
          role="tablist"
          aria-label="Timeline frames"
        >
          {steps.map((s, i) => {
            const active = i === index;
            const h = 8 + linkScale[i]! * 14;
            const eraStart = eraLabelAtStep(eras, i);
            return (
              <button
                key={`${s.granularity}-${s.dateKey}`}
                type="button"
                data-day-index={i}
                role="tab"
                aria-selected={active}
                aria-label={`${s.shortLabel}, ${s.stats.links} links`}
                onClick={() => go(i)}
                className={`flex flex-col items-center justify-end shrink-0 w-8 rounded px-0.5 pt-1 pb-0.5 transition-colors ${
                  active
                    ? "bg-ink-fg text-ink-bg"
                    : compareMode && i === compareIndex
                      ? "bg-ink-accent/20 text-ink-fg border border-ink-accent/50"
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
                  {filmstripLabel(s.shortLabel, s.granularity)}
                </span>
                {eraStart && (
                  <span
                    className="text-[6px] leading-none mt-0.5 truncate max-w-full text-center opacity-80"
                    title={eraStart}
                  >
                    {eraStart}
                  </span>
                )}
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
          aria-label="Scrub timeline"
        />
      </div>

      {focusNode && focusNode.kind === "topic" && (
        <ThemeFocusRail
          steps={steps}
          node={focusNode}
          activeIndex={index}
          granularity={granularity}
          onClear={() => setFocusTopicId(null)}
        />
      )}

      <div
        ref={graphHostRef}
        className={`w-full min-w-0 ${step.beat === "surge" ? "timeline-beat-surge" : ""}`}
      >
        <ThemeNetworkGraph
          graph={step.graph}
          emphasisIds={emphasisIds}
          pulseIds={pulseIds}
          compact={!cinemaMode}
          onSelectedNodeChange={(id) => {
            if (!id) {
              setFocusTopicId(null);
              return;
            }
            const n = step.graph.nodes.find((x) => x.id === id);
            if (n?.kind === "topic") setFocusTopicId(id);
            else setFocusTopicId(null);
          }}
        />
      </div>

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
            href={step.journalHref}
            className="text-xs text-ink-accent hover:underline shrink-0 whitespace-nowrap"
          >
            Open →
          </Link>
        </div>

        {showComparePanel && compareDiff && (
          <div className="w-full min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-wide text-ink-muted mb-1">
              {compareStep.shortLabel} → {step.shortLabel}
            </p>
            <ul className="flex flex-wrap gap-1 min-w-0">
              {compareDiff.newTopics.map((t) => (
                <ChangeChip key={`n-${t}`} label={t} tone="new" />
              ))}
              {compareDiff.topicsAgain.map((t) => (
                <ChangeChip key={`c-${t}`} label={t} tone="carry" />
              ))}
              {compareDiff.strongerTopics.map((t) => (
                <ChangeChip key={`s-${t}`} label={`${t} ↑`} tone="strong" />
              ))}
              {compareDiff.newPhrases.map((t) => (
                <ChangeChip key={`p-${t}`} label={`"${t}"`} tone="new" />
              ))}
              {goneTopics.map((t) => (
                <ChangeChip key={`g-${t}`} label={t} tone="gone" />
              ))}
            </ul>
          </div>
        )}

        {!compareMode && hasChanges && c && (
          <div className="w-full min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-wide text-ink-muted mb-1">
              {priorPeriodLabel(granularity)}
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

        <div className="w-full min-w-0 pt-1 border-t border-ink-border/50">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-[9px] font-medium uppercase tracking-wide text-ink-muted">
              Director&apos;s cut
            </p>
            <button
              type="button"
              onClick={() => void loadDirectorsCut()}
              disabled={insightState === "loading"}
              className="text-[10px] text-ink-accent hover:underline disabled:opacity-40"
            >
              {directorsCut ? "Refresh" : "Generate"}
            </button>
          </div>
          <p className="text-xs text-ink-fg/90 leading-relaxed">
            {directorsCut ??
              "A longer recap of how your themes moved across this timeline (uses AI)."}
          </p>
        </div>
      </div>
    </div>
  );
}
