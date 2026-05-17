"use client";

import { useState } from "react";
import Link from "next/link";
import { TOPICS, type TopicId } from "@/lib/promptEngine";
import { WritingVoicePicker } from "@/components/WritingVoicePicker";
import type { WritingPreferences } from "@/lib/writingVoice";

export function DevPlayground() {
  const [selected, setSelected] = useState<TopicId[]>(["processing", "free"]);
  const [voice, setVoice] = useState<WritingPreferences>({
    toneTags: ["dark"],
    writingVoice: "",
  });
  const [prompt, setPrompt] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: TopicId) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setPrompt(null);
    try {
      const res = await fetch("/api/dev/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topics: selected,
          label: "Before bed",
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          toneTags: voice.toneTags,
          writingVoice: voice.writingVoice,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setPrompt(data.prompt);
      setSource(data.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full px-6 py-12 max-w-lg mx-auto">
      <Link href="/" className="text-sm text-ink-muted hover:text-ink-fg">
        ← Inkwell
      </Link>
      <h1 className="font-serif text-3xl mt-6">Local dev</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Test LLM prompts without Supabase. Set{" "}
        <code className="text-ink-fg">OPENAI_API_KEY</code> in{" "}
        <code className="text-ink-fg">.env.local</code>.
      </p>

      <div className="mt-8 space-y-4">
        <WritingVoicePicker value={voice} onChange={setVoice} />

        <p className="text-sm font-medium pt-4">Themes</p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {(Object.keys(TOPICS) as TopicId[]).map((id) => (
            <label
              key={id}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(id)}
                onChange={() => toggle(id)}
              />
              {TOPICS[id].label}
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={loading || selected.length === 0}
          className="w-full rounded-full bg-ink-fg text-ink-bg py-3.5 font-medium disabled:opacity-40 mt-4"
        >
          {loading ? "Generating…" : "Generate prompt"}
        </button>
      </div>

      {error && (
        <p className="mt-6 text-sm text-red-700 bg-red-50 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {prompt && (
        <blockquote className="mt-8 font-serif text-2xl leading-snug border-l-2 border-ink-accent pl-4">
          {prompt}
          <footer className="mt-3 text-xs font-sans text-ink-muted not-italic">
            source: {source}
          </footer>
        </blockquote>
      )}
    </div>
  );
}
