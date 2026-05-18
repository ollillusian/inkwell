"use client";

import {
  TONE_OPTIONS,
  type ToneTag,
  type WritingPreferences,
} from "@/lib/writingVoice";

type Props = {
  value: WritingPreferences;
  onChange: (v: WritingPreferences) => void;
};

export function WritingVoicePicker({ value, onChange }: Props) {
  function toggle(tag: ToneTag) {
    const next = value.toneTags.includes(tag)
      ? value.toneTags.filter((t) => t !== tag)
      : [...value.toneTags, tag];
    onChange({ ...value, toneTags: next });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-muted">
        Prompts will match this voice, including darker, sharper, or more raw
        writing if you want that.
      </p>
      <div className="space-y-2">
        {(Object.entries(TONE_OPTIONS) as [ToneTag, (typeof TONE_OPTIONS)[ToneTag]][]).map(
          ([id, meta]) => {
            const on = value.toneTags.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                className={`w-full text-left rounded-2xl border px-5 py-4 transition-all ${
                  on
                    ? "border-ink-accent bg-ink-accent/10"
                    : "border-ink-border bg-ink-surface hover:border-ink-muted/40"
                }`}
              >
                <span className="font-medium text-ink-fg">{meta.label}</span>
                <p className="mt-1 text-sm text-ink-muted">{meta.description}</p>
              </button>
            );
          }
        )}
      </div>
      <label className="block">
        <span className="text-sm text-ink-muted">
          Anything else? (optional)
        </span>
        <textarea
          value={value.writingVoice}
          onChange={(e) =>
            onChange({ ...value, writingVoice: e.target.value })
          }
          placeholder="e.g. I want to write more dark, gothic stuff I like, revenge fantasies, grief, things I can't say out loud."
          className="mt-2 w-full min-h-[100px] rounded-xl border border-ink-border bg-ink-surface px-4 py-3 text-sm"
        />
      </label>
    </div>
  );
}

