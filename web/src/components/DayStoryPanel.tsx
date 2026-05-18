"use client";

import { useState } from "react";

type Props = {
  dateKey: string;
  initialStory: string | null;
  entryCount: number;
};

export function DayStoryPanel({
  dateKey,
  initialStory,
  entryCount,
}: Props) {
  const [story, setStory] = useState(initialStory);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/journal/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not generate story");
        return;
      }
      setStory(data.story?.body ?? null);
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
            Day story
          </h2>
          <p className="mt-1 text-sm text-ink-muted leading-relaxed">
            AI weaves today&apos;s entries into one short story — only your
            words and themes, with light connective prose. Regenerate anytime.
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
          <p className="text-sm text-ink-muted italic">
            {entryCount === 1
              ? "One entry — still works as a vignette."
              : `${entryCount} entries ready to weave.`}
          </p>
        )
      )}
    </section>
  );
}
