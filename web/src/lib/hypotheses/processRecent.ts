/**
 * Trigger for the hypothesis engine. Entries are written client-side, so processing is decoupled:
 * a cron periodically scans recently-published entries and runs the update loop on each. The loop's
 * idempotency log (hypothesis_entry_log) means already-processed entries are skipped cheaply, so
 * overlapping windows are safe. See HYPOTHESIS_NUDGE_ENGINE.md §5.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { runUpdateLoop, type UpdateLoopResult } from "@/lib/hypotheses/updateLoop";

export type ProcessRecentResult = {
  scanned: number;
  processed: number;
  skipped: number;
  errors: number;
  bySkip: Record<string, number>;
};

/**
 * Run the real update loop over ONE user's published journal entries (oldest-first, so evidence
 * accumulates in order). With `reset`, clears that user's engine state first so you can watch
 * hypotheses build from scratch. Dev/manual use — makes real LLM calls and real DB writes.
 */
export async function processUserEntries(
  userId: string,
  opts: { reset?: boolean; limit?: number } = {}
): Promise<ProcessRecentResult & { reset: boolean }> {
  const db = createAdminClient();

  if (opts.reset) {
    // hypothesis_evidence cascades from hypotheses; the rest are keyed by user_id.
    await db.from("hypotheses").delete().eq("user_id", userId);
    await db.from("hypothesis_nudge_outcomes").delete().eq("user_id", userId);
    await db.from("hypothesis_entry_log").delete().eq("user_id", userId);
    await db.from("entry_embeddings").delete().eq("user_id", userId);
    await db
      .from("profiles")
      .update({ hypothesis_llm_budget_used: 0, hypothesis_engine_suspended_until: null })
      .eq("id", userId);
  }

  const { data: entries } = await db
    .from("entries")
    .select("id, is_draft, written_at")
    .eq("user_id", userId)
    .order("written_at", { ascending: true })
    .limit(opts.limit ?? 200);

  const result: ProcessRecentResult & { reset: boolean } = {
    reset: Boolean(opts.reset),
    scanned: 0,
    processed: 0,
    skipped: 0,
    errors: 0,
    bySkip: {},
  };

  for (const entry of (entries ?? []) as { id: string; is_draft: boolean | null }[]) {
    if (entry.is_draft) continue;
    result.scanned++;
    try {
      const r: UpdateLoopResult = await runUpdateLoop(userId, entry.id);
      if (r.skipped) {
        result.skipped++;
        result.bySkip[r.skipped] = (result.bySkip[r.skipped] ?? 0) + 1;
      } else {
        result.processed++;
      }
    } catch (err) {
      result.errors++;
      console.error(`[inkwell] processUserEntries failed for entry ${entry.id}:`, err);
    }
  }
  return result;
}

/**
 * Process published entries written in the last `sinceMinutes`. Drafts are skipped. Capped at `max`
 * per run to bound work; the next run picks up any overflow (ordered oldest-first).
 */
export async function processRecentEntries(
  opts: { sinceMinutes?: number; max?: number } = {}
): Promise<ProcessRecentResult> {
  const db = createAdminClient();
  const sinceMinutes = opts.sinceMinutes ?? 1440; // default: last 24h
  const since = new Date(Date.now() - sinceMinutes * 60_000).toISOString();

  // Key on updated_at, not written_at: publishing a draft (and editing) bumps updated_at via the
  // entries_updated_at trigger (migration 005), but leaves written_at at its original value. A draft
  // started days ago then published today would be missed by a written_at window.
  const { data: entries } = await db
    .from("entries")
    .select("id, user_id, is_draft, updated_at")
    .gte("updated_at", since)
    .order("updated_at", { ascending: true })
    .limit(opts.max ?? 100);

  const result: ProcessRecentResult = {
    scanned: 0,
    processed: 0,
    skipped: 0,
    errors: 0,
    bySkip: {},
  };

  for (const entry of (entries ?? []) as {
    id: string;
    user_id: string;
    is_draft: boolean | null;
  }[]) {
    if (entry.is_draft) continue; // only process published entries
    result.scanned++;
    try {
      const r: UpdateLoopResult = await runUpdateLoop(entry.user_id, entry.id);
      if (r.skipped) {
        result.skipped++;
        result.bySkip[r.skipped] = (result.bySkip[r.skipped] ?? 0) + 1;
      } else {
        result.processed++;
      }
    } catch (err) {
      result.errors++;
      console.error(`[inkwell] hypothesis loop failed for entry ${entry.id}:`, err);
    }
  }

  return result;
}
