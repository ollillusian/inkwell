"use client";

import Link from "next/link";
import { useState } from "react";
import {
  formatOnDemandPromptLabel,
  type OnDemandPromptSummary,
} from "@/lib/prompts/onDemandPrompt";

type PromptResponse = {
  prompt: string;
  nudgeId: string;
  label: string;
  source: "llm" | "cache" | "fallback";
  createdAt: string;
};

export function OnDemandPrompt({
  initialPrompts = [],
}: {
  initialPrompts?: OnDemandPromptSummary[];
}) {
  const [prompt, setPrompt] = useState<PromptResponse | null>(null);
  const [recentPrompts, setRecentPrompts] =
    useState<OnDemandPromptSummary[]>(initialPrompts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generatePrompt() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/prompts/on-demand", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not generate prompt");
      const generated = data as PromptResponse;
      setPrompt(generated);
      setRecentPrompts((prev) => [
        {
          nudgeId: generated.nudgeId,
          prompt: generated.prompt,
          createdAt: generated.createdAt,
        },
        ...prev.filter((item) => item.nudgeId !== generated.nudgeId),
      ]);
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
        {loading
          ? "Generating prompt..."
          : prompt
            ? "Generate another"
            : "Nudge me now"}
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

      {recentPrompts.length > 0 && (
        <div className="mt-6 border-t border-ink-border pt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Recent on-demand prompts
          </p>
          <ul className="mt-3 space-y-3">
            {recentPrompts.slice(0, 5).map((item) => (
              <li key={item.nudgeId}>
                <Link
                  href={`/app/write?nudge=${encodeURIComponent(item.nudgeId)}`}
                  className="block rounded-2xl border border-ink-border/70 px-4 py-3 hover:bg-ink-bg/70 transition-colors"
                >
                  <span className="block text-xs uppercase tracking-wide text-ink-muted">
                    {formatOnDemandPromptLabel(item.nudgeId) ?? "Fresh prompt"}
                    {item.draftBody ? " · draft saved" : ""}
                  </span>
                  <span className="mt-1 block font-serif text-lg leading-snug text-ink-fg line-clamp-2">
                    {item.prompt}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
