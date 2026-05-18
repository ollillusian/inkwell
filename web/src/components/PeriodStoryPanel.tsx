"use client";

import { useState } from "react";
import { sanitizeStoryProse } from "@/lib/storyFormat";
import type { JournalPeriodType } from "@/lib/journalPeriod";

const COPY: Record<
  JournalPeriodType,
  { title: string; description: string; emptyHint: (n: number) => string }
> = {
  day: {
    title: "Day story",
    description:
      "AI weaves this day's entries into one short story — only your words and themes, with light connective prose.",
    emptyHint: (n) =>
      n === 1
        ? "One entry — still works as a vignette."
        : `${n} entries ready to weave.`,
  },
  week: {
    title: "Week story",
    description:
      "A single narrative arc across the week, drawn only from what you wrote — themes that return, shift, or resolve.",
    emptyHint: (n) =>
      n === 1
        ? "One entry this week — a short vignette."
        : `${n} entries across the week ready to weave.`,
  },
  month: {
    title: "Month story",
    description:
      "A longer woven piece for the month — emotional through-lines and turning points, not a day-by-day summary.",
    emptyHint: (n) =>
      `${n} ${n === 1 ? "entry" : "entries"} this month ready to weave.`,
  },
};

type Props = {
  period: JournalPeriodType;
  periodKey: string;
  initialStory: string | null;
  entryCount: number;
};

export function PeriodStoryPanel({
  period,
  periodKey,
  initialStory,
  entryCount,
}: Props) {
  const [story, setStory] = useState(initialStory);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[period];

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/journal/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period,
          key: periodKey,
          ...(period === "day" ? { date: periodKey } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not generate story");
        return;
      }
      const body = data.story?.body;
      setStory(body ? sanitizeStoryProse(body) : null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (entryCount === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
            {copy.title}
          </h2>
          <p className="mt-1 text-sm text-ink-muted leading-relaxed">
            {copy.description} Regenerate anytime.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="shrink-0 rounded-full border border-ink-border px-4 py-2 text-sm font-medium hover:bg-ink-surface disabled:opacity-50"
        >
          {loading ? "Writing…" : story ? "Regenerate" : "Create story"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600/90">{error}</p>}

      {story ? (
        <article className="rounded-2xl border border-ink-border bg-ink-surface p-6 font-serif text-lg leading-relaxed whitespace-pre-wrap">
          {story}
        </article>
      ) : (
        !loading && (
          <p className="text-sm text-ink-muted italic">{copy.emptyHint(entryCount)}</p>
        )
      )}
    </section>
  );
}
