"use client";

import { TOPICS, type TopicId } from "@/lib/promptEngine";

type Props = {
  selected: TopicId[];
  onChange: (topics: TopicId[]) => void;
};

export function TopicPicker({ selected, onChange }: Props) {
  function toggle(id: TopicId) {
    if (selected.includes(id)) {
      onChange(selected.filter((t) => t !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="space-y-3">
      {(Object.entries(TOPICS) as [TopicId, (typeof TOPICS)[TopicId]][]).map(
        ([id, meta]) => {
          const on = selected.includes(id);
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
  );
}
