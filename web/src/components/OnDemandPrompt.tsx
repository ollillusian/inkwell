"use client";

import Link from "next/link";
import { useState } from "react";

type PromptResponse = {
  prompt: string;
  nudgeId: string;
  label: string;
  source: "llm" | "cache" | "fallback";
};

export function OnDemandPrompt() {
  const [prompt, setPrompt] = useState<PromptResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generatePrompt() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/prompts/on-demand", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not generate prompt");
      setPrompt(data as PromptResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate prompt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-ink-border bg-ink-surface/70 px-5 py-5">
      <p className="text-sm font-medium text-ink-fg">Need a nudge now?</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        Generate a fresh prompt on demand whenever you want to write outside
        your schedule.
      </p>

      <button
        type="button"
        onClick={generatePrompt}
        disabled={loading}
        className="mt-4 w-full rounded-full border border-ink-fg/20 px-4 py-3 text-sm font-medium text-ink-fg hover:bg-ink-fg hover:text-ink-bg disabled:opacity-50 transition-colors"
      >
        {loading ? "Generating prompt..." : prompt ? "Generate another" : "Nudge me now"}
      </button>

      {error && (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {prompt && (
        <div className="mt-5 space-y-4" aria-live="polite">
          <blockquote className="border-l-2 border-ink-accent pl-4 font-serif text-2xl leading-snug text-ink-fg">
            {prompt.prompt}
          </blockquote>
          {prompt.source === "llm" && (
            <p className="text-xs text-ink-muted">
              Shaped by your themes and voice from onboarding.
            </p>
          )}
          <Link
            href={`/app/write?nudge=${encodeURIComponent(prompt.nudgeId)}`}
            className="flex w-full justify-center rounded-full bg-ink-fg py-3.5 font-medium text-ink-bg hover:opacity-90 transition-opacity"
          >
            Start writing with this prompt
          </Link>
        </div>
      )}
    </section>
  );
}
