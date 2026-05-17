export function HumanOnlyBanner({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-xs text-ink-muted tracking-wide">
        AI suggests the prompt — you write the answer.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-ink-border/60 bg-ink-surface/80 px-5 py-4">
      <p className="font-medium text-ink-fg text-sm">You write the answer</p>
      <p className="mt-1.5 text-sm text-ink-muted leading-relaxed">
        Inkwell uses AI only to craft prompts from your chosen themes. Your
        journal entries are never generated — this space is for{" "}
        <span className="text-ink-fg">your</span> voice, messy and real. Skip
        pasting from ChatGPT here; even three sentences in your own words count.
      </p>
    </div>
  );
}
