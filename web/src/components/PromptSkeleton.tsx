export function PromptSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-4 w-32 bg-ink-border rounded" />
        <div className="mt-4 h-24 bg-ink-border/70 rounded-xl" />
        <p className="mt-4 text-sm text-ink-muted">Crafting your prompt…</p>
      </div>
      <div className="h-12 w-full bg-ink-border rounded-full" />
    </div>
  );
}
