/**
 * Falsification + harm instruments — load-bearing in invisible mode, since there's no user-tap
 * correction signal. See HYPOTHESIS_NUDGE_ENGINE.md §8.
 *
 *  - Divergence: how far a user's response drifts from the nudge's implied frame. High divergence is
 *    GOOD (the user pushed back / went their own way); persistently low divergence means the engine
 *    is leading. We never optimize for agreement.
 *  - Harm signals: rising absolutist language + collapsing entry length + disengagement after
 *    hypothesis nudges.
 *  - Kill-switch: if the harm signals trend bad for a user, auto-suspend the whole engine for them
 *    (the update loop then short-circuits and nudges fall back to the content-blind variety bundle).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { embed } from "@/lib/llm/modelClient";
import { lexicalSignals } from "@/lib/hypotheses/lexical";

export const HARM_TUNING = {
  /** Need at least this many recent outcomes before the kill-switch can fire. */
  MIN_OUTCOMES: 4,
  /** How many recent outcomes to weigh. */
  WINDOW: 6,
  /** Fraction of recent outcomes that must look harmful to suspend. */
  HARM_FRACTION: 0.6,
  /** Response absolutist % at/above this counts as a harm hit. */
  ABSOLUTIST_HARM_PCT: 8,
  /** Response this many chars shorter than baseline counts as collapse. */
  LENGTH_COLLAPSE: -50,
  /** How long to suspend the engine for a user once tripped. */
  SUSPEND_DAYS: 14,
} as const;

export type NudgeOutcomeSignals = {
  response_absolutist_pct: number | null;
  response_length_delta: number | null;
  user_engaged: boolean | null;
  created_at?: string;
};

// ---- pure logic -----------------------------------------------------------------------------

/** Cosine distance in [0, 2]; 0 = identical direction, 1 = orthogonal. */
export function cosineDistance(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function isHarmful(o: NudgeOutcomeSignals): boolean {
  return (
    (o.response_absolutist_pct ?? 0) >= HARM_TUNING.ABSOLUTIST_HARM_PCT ||
    (o.response_length_delta ?? 0) <= HARM_TUNING.LENGTH_COLLAPSE ||
    o.user_engaged === false
  );
}

/**
 * Decide whether to suspend the engine for a user from their recent nudge outcomes. Pure.
 * `outcomes` may be in any order; the most recent WINDOW are considered.
 */
export function shouldSuspend(outcomes: NudgeOutcomeSignals[]): boolean {
  // Only RESOLVED outcomes count — freshly-created pending rows (user_engaged null) must not dilute
  // the window or defeat the kill-switch.
  const recent = [...outcomes]
    .filter((o) => o.user_engaged !== null)
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
    .slice(-HARM_TUNING.WINDOW);
  if (recent.length < HARM_TUNING.MIN_OUTCOMES) return false;
  const bad = recent.filter(isHarmful).length;
  return bad / recent.length >= HARM_TUNING.HARM_FRACTION;
}

// ---- DB orchestration (thin; not runtime-verified against a live DB here) --------------------

/**
 * Created when a hypothesis nudge is pre-generated (response not yet known). Resolved later when the
 * user's response entry arrives. This pending-row pattern is how an entry gets linked back to the
 * nudge that prompted it without storing the link on prompt_deliveries.
 */
export async function createPendingOutcome(
  userId: string,
  hypothesisId: string | null,
  nudgePromptSlot: string,
  nudgeDeliveryDate: string
): Promise<void> {
  const db = createAdminClient();
  // Dedupe: at most one unresolved pending row per (user, slot, date). The nudge text for that
  // (date, slot) is itself deduped by the prompt_deliveries upsert, so a stale pending would only
  // mislead the matcher. Clear any prior unresolved row for this key first.
  await db
    .from("hypothesis_nudge_outcomes")
    .delete()
    .eq("user_id", userId)
    .eq("nudge_prompt_slot", nudgePromptSlot)
    .eq("nudge_delivery_date", nudgeDeliveryDate)
    .is("response_entry_id", null);
  await db.from("hypothesis_nudge_outcomes").insert({
    user_id: userId,
    hypothesis_id: hypothesisId,
    nudge_delivery_date: nudgeDeliveryDate,
    nudge_prompt_slot: nudgePromptSlot,
    response_entry_id: null,
    user_engaged: null,
  });
}

export type ResolveOutcomeInput = {
  userId: string;
  responseEntryId: string;
  responseSlot: string;
  responseBody: string;
  baselineLength: number; // user's typical entry length, for the length-delta signal
  responseDeliveryDate: string; // the response entry's local date (YYYY-MM-DD)
};

/** Max days between a nudge's delivery date and the responding entry for them to be linked. */
const OUTCOME_MATCH_WINDOW_DAYS = 3;

function isoDateNDaysBefore(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * When an entry is published, see if it answers a RECENT pending hypothesis nudge in the same slot.
 * If so, compute divergence + harm signals and resolve the row. Returns the number of billable LLM
 * (embedding) calls it made, for budget accounting. Never throws.
 */
export async function resolvePendingOutcome(input: ResolveOutcomeInput): Promise<number> {
  const db = createAdminClient();

  // Freshness guard: only a nudge the user could plausibly have just seen (within the match window,
  // and not dated after the response) may be resolved by this entry — prevents mis-linking an
  // ordinary "day" entry to a stale nudge.
  const earliest = isoDateNDaysBefore(input.responseDeliveryDate, OUTCOME_MATCH_WINDOW_DAYS);
  const { data: pendings } = await db
    .from("hypothesis_nudge_outcomes")
    .select("id, nudge_delivery_date, nudge_prompt_slot")
    .eq("user_id", input.userId)
    .eq("nudge_prompt_slot", input.responseSlot)
    .is("response_entry_id", null)
    .gte("nudge_delivery_date", earliest)
    .lte("nudge_delivery_date", input.responseDeliveryDate)
    .order("nudge_delivery_date", { ascending: false })
    .limit(1);
  const pending = pendings?.[0];
  if (!pending) return 0;

  const { data: delivery } = await db
    .from("prompt_deliveries")
    .select("prompt_text")
    .eq("user_id", input.userId)
    .eq("delivery_date", pending.nudge_delivery_date)
    .eq("prompt_slot", pending.nudge_prompt_slot)
    .maybeSingle();
  const nudgeText = delivery?.prompt_text ?? "";

  const responded = input.responseBody.trim().length > 0;
  let divergence: number | null = null;
  let calls = 0;
  if (responded && nudgeText) {
    const [nudgeVec, respVec] = await Promise.all([embed(nudgeText), embed(input.responseBody)]);
    calls = 2;
    if (nudgeVec && respVec) {
      divergence = Number(cosineDistance(nudgeVec.embedding, respVec.embedding).toFixed(4));
    }
  }

  await db
    .from("hypothesis_nudge_outcomes")
    .update({
      response_entry_id: input.responseEntryId,
      divergence_score: divergence,
      response_absolutist_pct: responded ? lexicalSignals(input.responseBody).absolutist_entry_pct : null,
      response_length_delta: responded ? input.responseBody.length - input.baselineLength : null,
      user_engaged: responded,
    })
    .eq("id", pending.id);
  return calls;
}

/**
 * Read a user's recent nudge outcomes and suspend the engine if the harm trend trips the threshold.
 * Returns whether the engine was suspended. Never throws.
 */
export async function evaluateKillSwitch(userId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db
    .from("hypothesis_nudge_outcomes")
    .select("response_absolutist_pct, response_length_delta, user_engaged, created_at")
    .eq("user_id", userId)
    .not("response_entry_id", "is", null) // resolved outcomes only — pending rows don't count
    .order("created_at", { ascending: false })
    .limit(HARM_TUNING.WINDOW);

  const outcomes = (data ?? []) as NudgeOutcomeSignals[];
  if (!shouldSuspend(outcomes)) return false;

  const until = new Date(Date.now() + HARM_TUNING.SUSPEND_DAYS * 86_400_000).toISOString();
  await db.from("profiles").update({ hypothesis_engine_suspended_until: until }).eq("id", userId);
  return true;
}
