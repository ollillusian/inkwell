/**
 * The hypothesis update loop — runs async after an entry is published. It turns extracted evidence
 * into confidence updates and drives the candidate -> active -> supported / refuted / retired state
 * machine. See HYPOTHESIS_NUDGE_ENGINE.md §5.
 *
 * Structure: the numeric/state-machine logic is PURE and exported (unit-tested without a DB); the
 * DB read/write orchestration (`runUpdateLoop`) is a thin layer on top.
 *
 * Confidence lives HERE, in code + DB — never in the LLM. The LLM only emits stateless per-entry
 * judgments; this loop is the part that accumulates, decays, and is willing to abandon a hunch.
 */
import type {
  EvidenceWeightBand,
  EvidenceStance,
  HypothesisStatus,
  HypothesisFramework,
} from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { localDateKey } from "@/lib/datetime";
import { lexicalSignals, type LexicalSignals } from "@/lib/hypotheses/lexical";
import { extractEvidence, type ExtractedEvent } from "@/lib/llm/extractEvidence";
import { instantiationFor } from "@/lib/hypotheses/library";
import { EXTRACTOR_MODEL } from "@/lib/llm/modelClient";
import { profileVoice } from "@/lib/prompts/getDailyPrompt";
import {
  createPendingOutcome,
  resolvePendingOutcome,
  evaluateKillSwitch,
} from "@/lib/hypotheses/outcomeInstrument";
import { upsertEntryEmbedding } from "@/lib/hypotheses/embedJob";
import { canonicalizeSurfaceCategories } from "@/lib/hypotheses/canonicalizeSurface";
import { composeHypothesisNudge } from "@/lib/hypotheses/composeNudge";

// ---- tuning constants (every magic number lives here, with rationale) -----------------------

export const TUNING = {
  /** Max absolute tally change a single entry can apply (one bad day can't mint a belief). */
  PER_ENTRY_CAP: 0.7,
  /** Supporting-evidence log-odds step by band. Contradicting is weighted one band stronger. */
  SUPPORT_STEP: { weak: 0.2, moderate: 0.5, strong: 0.9 } as Record<EvidenceWeightBand, number>,
  /** Tally floor (prevents runaway negative). */
  TALLY_FLOOR: -3.0,
  /** candidate -> active needs tally >= this, AND ≥3 spontaneous days AND ≥2 situations. Lowered to
   * 0.2 so recurring SURFACE themes (dominant-story/behavioral) — which gather fewer events than the
   * core beliefs and so climb the tally slower — can promote once they've genuinely recurred across
   * days/situations, instead of stalling just under the bar. Falsifiability stays continuous
   * (contradicting evidence is weighted stronger and demotes/refutes below). */
  PROMOTE_TALLY: 0.2,
  /** ...AND this many distinct spontaneous supporting days (prompted echoes don't count). */
  MIN_SPONTANEOUS_DAYS: 3,
  /** ...AND this many distinct situational contexts (anti-FAE). */
  MIN_SITUATIONS: 2,
  /** active -> supported. */
  SUPPORTED_TALLY: 1.1,
  /** active/supported -> candidate (hysteresis: well below PROMOTE so it doesn't oscillate). */
  DEMOTE_TALLY: -0.2,
  /** any status -> refuted/retired when tally collapses. */
  RETIRE_TALLY: -1.0,
  /** Monthly per-user LLM call budget (each entry uses ~samples calls). ~120 entries at 5 samples. */
  MONTHLY_LLM_CALL_CAP: 600,
  /** Samples per extraction (M=5 self-consistency). */
  EXTRACTOR_SAMPLES: 5,
  /** How many recent entries to use as the lexical window. */
  LEXICAL_WINDOW: 20,
  /** Daily slot whose content the engine overrides with a hypothesis nudge (option A). */
  PREGEN_SLOT: "day",
} as const;

// ---- pure logic -----------------------------------------------------------------------------

const NEXT_BAND: Record<EvidenceWeightBand, EvidenceWeightBand> = {
  weak: "moderate",
  moderate: "strong",
  strong: "strong",
};

/** Signed log-odds step for one event. Contradicting evidence is weighted one band stronger. */
export function stepForBand(band: EvidenceWeightBand, stance: EvidenceStance): number {
  if (stance === "supporting") return TUNING.SUPPORT_STEP[band];
  return -TUNING.SUPPORT_STEP[NEXT_BAND[band]];
}

/** Net, per-entry-capped tally delta for the events that map to a single hypothesis. */
export function summarizeEntryTallyDelta(events: { weightBand: EvidenceWeightBand; stance: EvidenceStance }[]): number {
  const raw = events.reduce((sum, e) => sum + stepForBand(e.weightBand, e.stance), 0);
  return Math.max(-TUNING.PER_ENTRY_CAP, Math.min(TUNING.PER_ENTRY_CAP, raw));
}

/** Exponential decay of the tally toward the prior, by days since last evidence. */
export function decayTally(tally: number, prior: number, daysSince: number, tauDays: number): number {
  if (daysSince <= 0 || tauDays <= 0) return tally;
  return prior + (tally - prior) * Math.exp(-daysSince / tauDays);
}

export function clampTally(value: number, ceiling: number): number {
  return Math.max(TUNING.TALLY_FLOOR, Math.min(ceiling, value));
}

export type StatusInputs = {
  status: HypothesisStatus;
  evidenceTally: number;
  spontaneousSupportingDays: number;
  distinctSituationCount: number;
};

/**
 * The state machine. Promotion is hard (multi-condition, provenance- and situation-gated, requires a
 * falsifier and a rival); demotion/falsification is easy (hysteresis). A hypothesis can never reach a
 * "true" state — "supported" is the ceiling and is still falsifiable.
 */
export function decideStatus(s: StatusInputs): HypothesisStatus {
  if (s.status === "retired") return "retired";

  // Collapse -> refuted (archive), from any non-terminal state.
  if (s.evidenceTally < TUNING.RETIRE_TALLY) {
    return s.status === "candidate" ? "retired" : "refuted";
  }
  if (s.status === "refuted") return "refuted";

  // Promotion gates, each a real safeguard on THIS hypothesis: enough weighted evidence, recurring
  // across distinct spontaneous days, and generalizing across ≥2 situations (anti-FAE). Falsifiability
  // is NOT a static gate — it's continuous: contradicting evidence is weighted stronger and demotes/
  // refutes below. (A rival is tracked via competing_hypothesis_id but isn't a precondition either.)
  const canPromote =
    s.evidenceTally >= TUNING.PROMOTE_TALLY &&
    s.spontaneousSupportingDays >= TUNING.MIN_SPONTANEOUS_DAYS &&
    s.distinctSituationCount >= TUNING.MIN_SITUATIONS;

  if (s.status === "candidate") {
    return canPromote ? "active" : "candidate";
  }

  // active / supported band, with hysteresis
  if (s.evidenceTally < TUNING.DEMOTE_TALLY) return "candidate";
  if (s.evidenceTally >= TUNING.SUPPORTED_TALLY) return "supported";
  return "active";
}

/**
 * Anti-sycophancy cross-check: if the LLM claims an absolutist/all-or-nothing language pattern but
 * the deterministic absolutist-word trend is flat, downgrade that event's band one notch. The
 * deterministic counter is the engine's independent second opinion (see lexical.ts).
 */
export function crossCheckAgainstSignals(
  events: ExtractedEvent[],
  signals: LexicalSignals
): ExtractedEvent[] {
  const ABSOLUTIST_FLOOR_PCT = 1.0; // below this rolling %, "all-or-nothing" claims aren't backed
  const downgrade: Record<EvidenceWeightBand, EvidenceWeightBand> = {
    strong: "moderate",
    moderate: "weak",
    weak: "weak",
  };
  return events.map((e) => {
    const claimsAbsolutist =
      e.framework === "language_pattern" &&
      /(absolut|all_or_nothing|always|never|black_white)/i.test(e.category);
    if (claimsAbsolutist && signals.absolutist_rolling_pct < ABSOLUTIST_FLOOR_PCT) {
      return { ...e, weightBand: downgrade[e.weightBand] };
    }
    return e;
  });
}

// ---- DB orchestration (thin; not runtime-verified against a live DB here) -------------------

type HypothesisRow = {
  id: string;
  user_id: string;
  framework: HypothesisFramework;
  category: string | null;
  status: HypothesisStatus;
  evidence_tally: number;
  prior_log_odds: number;
  confidence_ceiling: number;
  decay_tau_days: number;
  watched_disconfirmers: string[];
  last_evaluated_at: string | null;
  activated_at: string | null;
  resolved_at: string | null;
};

type EvidenceRow = {
  entry_id: string | null;
  stance: EvidenceStance;
  provenance: "spontaneous" | "prompted";
  situational_context: string | null;
};

export type UpdateLoopResult = {
  skipped?:
    | "disabled"
    | "suspended"
    | "no_entry"
    | "already_processed"
    | "budget"
    | "no_events";
  errored?: boolean;
  eventsApplied?: number;
  hypothesesTouched?: number;
};

/** Idempotency ledger write — marks an entry (at its current updated_at) as processed. */
async function markProcessed(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  entryId: string,
  entryUpdatedAt: string | null,
  eventsFound: number
): Promise<void> {
  await db.from("hypothesis_entry_log").upsert(
    {
      entry_id: entryId,
      user_id: userId,
      entry_updated_at: entryUpdatedAt,
      events_found: eventsFound,
      processed_at: NOW_ISO(),
    },
    { onConflict: "entry_id" }
  );
}

const MONTH_KEY = () => new Date().toISOString().slice(0, 7);
const NOW_ISO = () => new Date().toISOString();
const daysBetween = (fromIso: string | null) =>
  fromIso ? Math.max(0, (Date.now() - new Date(fromIso).getTime()) / 86_400_000) : 0;

/** Persist the monthly LLM-call budget (single flush point). */
async function persistBudget(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  month: string,
  used: number
): Promise<void> {
  await db
    .from("profiles")
    .update({ hypothesis_llm_budget_month: month, hypothesis_llm_budget_used: used })
    .eq("id", userId);
}

/**
 * Recompute a hypothesis's ledger aggregates, apply decay + this entry's capped delta, decide the
 * new status, and persist. `groupEvents` is this entry's events for the hypothesis (empty when
 * reconciling a hypothesis that LOST evidence on an edit — decay only, no new delta).
 */
async function reconcileHypothesis(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  hyp: HypothesisRow,
  groupEvents: ExtractedEvent[]
): Promise<void> {
  const { data: allEvidence } = await db
    .from("hypothesis_evidence")
    .select("entry_id, stance, provenance, situational_context")
    .eq("hypothesis_id", hyp.id);
  const ledger = (allEvidence ?? []) as EvidenceRow[];

  const supporting = ledger.filter((r) => r.stance === "supporting");
  const contradicting = ledger.filter((r) => r.stance === "contradicting");
  const distinctEntries = (rows: EvidenceRow[]) =>
    new Set(rows.map((r) => r.entry_id).filter(Boolean)).size;
  const distinctSituations = new Set(
    ledger.map((r) => (r.situational_context ?? "").trim().toLowerCase()).filter(Boolean)
  ).size;
  const spontaneousSupportingDays = distinctEntries(
    supporting.filter((r) => r.provenance === "spontaneous")
  );

  const { data: rival } = await db
    .from("hypotheses")
    .select("id")
    .eq("user_id", userId)
    .neq("id", hyp.id)
    .in("status", ["candidate", "active", "supported"])
    .limit(1)
    .maybeSingle();

  const decayed = decayTally(
    hyp.evidence_tally,
    hyp.prior_log_odds ?? -1.386,
    daysBetween(hyp.last_evaluated_at),
    hyp.decay_tau_days
  );
  const delta = summarizeEntryTallyDelta(groupEvents);
  const newTally = clampTally(decayed + delta, hyp.confidence_ceiling);

  const newStatus = decideStatus({
    status: hyp.status,
    evidenceTally: newTally,
    spontaneousSupportingDays,
    distinctSituationCount: distinctSituations,
  });

  const now = NOW_ISO();
  await db
    .from("hypotheses")
    .update({
      evidence_tally: newTally,
      supporting_count: supporting.length,
      contradicting_count: contradicting.length,
      distinct_evidence_days: distinctEntries(supporting),
      spontaneous_supporting_days: spontaneousSupportingDays,
      distinct_situation_count: distinctSituations,
      competing_hypothesis_id: rival?.id ?? null,
      status: newStatus,
      extractor_model_version: EXTRACTOR_MODEL,
      last_evaluated_at: now,
      activated_at: newStatus === "active" && !hyp.activated_at ? now : hyp.activated_at,
      // Preserve the original resolution time instead of nulling it on a later re-update.
      resolved_at:
        newStatus === "refuted" || newStatus === "retired" ? (hyp.resolved_at ?? now) : null,
    })
    .eq("id", hyp.id);
}

/**
 * Process one published entry. Idempotent via hypothesis_entry_log (covers no-event entries);
 * re-extraction on edit supersedes older evidence and reconciles every previously-affected
 * hypothesis. The entry is embedded for the disconfirmation scan. Never throws — returns a typed
 * result (errored:true on unexpected failure).
 */
export async function runUpdateLoop(userId: string, entryId: string): Promise<UpdateLoopResult> {
  const db = createAdminClient();
  try {
    return await runUpdateLoopInner(db, userId, entryId);
  } catch (err) {
    console.error(`[inkwell] runUpdateLoop threw for entry ${entryId}:`, err);
    return { errored: true };
  }
}

async function runUpdateLoopInner(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  entryId: string
): Promise<UpdateLoopResult> {

  const { data: profile } = await db
    .from("profiles")
    .select(
      "hypothesis_engine_enabled, hypothesis_engine_suspended_until, hypothesis_llm_budget_used, hypothesis_llm_budget_month, tone_tags, writing_voice, timezone"
    )
    .eq("id", userId)
    .maybeSingle();

  if (!profile || profile.hypothesis_engine_enabled === false) return { skipped: "disabled" };
  if (
    profile.hypothesis_engine_suspended_until &&
    new Date(profile.hypothesis_engine_suspended_until).getTime() > Date.now()
  ) {
    return { skipped: "suspended" };
  }

  const { data: entry } = await db
    .from("entries")
    .select("id, user_id, body, prompt_slot, written_at, updated_at, created_at")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry || entry.user_id !== userId || !entry.body?.trim()) return { skipped: "no_entry" };

  const entryUpdatedAt: string | null = entry.updated_at ?? entry.created_at ?? null;

  // Idempotency + edit-supersede via the processing log (covers no-event entries too).
  const { data: logRow } = await db
    .from("hypothesis_entry_log")
    .select("entry_updated_at")
    .eq("entry_id", entryId)
    .maybeSingle();
  const supersededHypIds = new Set<string>();
  if (logRow) {
    const processedAt = logRow.entry_updated_at as string | null;
    if (!entryUpdatedAt || !processedAt || processedAt >= entryUpdatedAt) {
      return { skipped: "already_processed" };
    }
    // Entry was edited since we processed it — capture which hypotheses it fed, then supersede the
    // old evidence. Those hypotheses are reconciled after the loop even if the new text no longer
    // maps to them (so their aggregates don't go stale).
    const { data: oldEv } = await db
      .from("hypothesis_evidence")
      .select("hypothesis_id")
      .eq("entry_id", entryId);
    for (const r of (oldEv ?? []) as { hypothesis_id: string }[]) supersededHypIds.add(r.hypothesis_id);
    await db.from("hypothesis_evidence").delete().eq("entry_id", entryId);
  }

  // Monthly budget (full egress => guard cost). Checked before ANY LLM call (extraction).
  const month = MONTH_KEY();
  let used = profile.hypothesis_llm_budget_month === month ? profile.hypothesis_llm_budget_used ?? 0 : 0;
  if (used >= TUNING.MONTHLY_LLM_CALL_CAP) {
    // Not logged: retried once the budget resets next month.
    return { skipped: "budget" };
  }

  // Lexical window + deterministic cross-check signals.
  const { data: recent } = await db
    .from("entries")
    .select("body")
    .eq("user_id", userId)
    .neq("id", entryId)
    .order("written_at", { ascending: false })
    .limit(TUNING.LEXICAL_WINDOW);
  const recentBodies = (recent ?? []).map((r: { body: string }) => r.body).filter(Boolean);
  const signals = lexicalSignals(entry.body, recentBodies);
  const baselineLength = recentBodies.length
    ? Math.round(recentBodies.reduce((s, b) => s + b.length, 0) / recentBodies.length)
    : entry.body.length;

  const deliveryDate = localDateKey(new Date(), profile.timezone ?? "UTC");

  // This entry may be the RESPONSE to a prior hypothesis nudge — resolve the pending outcome and
  // re-evaluate the harm kill-switch. If the kill-switch trips, skip pre-generating a new nudge.
  used += await resolvePendingOutcome({
    userId,
    responseEntryId: entryId,
    responseSlot: entry.prompt_slot ?? "",
    responseBody: entry.body,
    baselineLength,
    responseDeliveryDate: deliveryDate,
  });
  const suspended = await evaluateKillSwitch(userId);

  // Embed this entry (NE-redacted) so future disconfirmation scans can retrieve it — even if it
  // yields no evidence of its own, it may later disconfirm someone's negative self-story.
  await upsertEntryEmbedding(db, userId, entryId, entry.body);
  used += 1;

  // Extraction (the sole evidence source) + cross-check. Budget is flushed once near the end.
  const rawEvents = await extractEvidence(entry.body, { samples: TUNING.EXTRACTOR_SAMPLES });
  used += TUNING.EXTRACTOR_SAMPLES;
  let events = crossCheckAgainstSignals(rawEvents, signals);
  if (events.length === 0) {
    await markProcessed(db, userId, entryId, entryUpdatedAt, 0);
    await persistBudget(db, userId, month, used);
    return { skipped: "no_events" };
  }

  // Canonicalize surface-framework labels onto the user's existing equivalent themes BEFORE grouping,
  // so related dominant-story/behavioral themes accumulate on one hypothesis instead of fragmenting
  // into one-off candidates. (Deep frameworks already canonicalize via the fixed category enum.)
  const canon = await canonicalizeSurfaceCategories(db, userId, events);
  events = canon.events;
  used += canon.calls;

  // Provenance: was this entry written in response to a hypothesis nudge? (M16 mints `hypothesis-*`
  // slots; until then this is conservative.)
  const provenance: "spontaneous" | "prompted" = entry.prompt_slot?.startsWith("hypothesis-")
    ? "prompted"
    : "spontaneous";

  // Group events by (framework, category) — that tuple identifies a hypothesis.
  const groups = new Map<string, ExtractedEvent[]>();
  for (const ev of events) {
    const key = `${ev.framework}::${ev.category.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), ev]);
  }

  let touched = 0;
  const touchedHypIds = new Set<string>();
  for (const groupEvents of groups.values()) {
    const sample = groupEvents[0];

    // Resolve or instantiate the hypothesis.
    const { data: existing } = await db
      .from("hypotheses")
      .select("*")
      .eq("user_id", userId)
      .eq("framework", sample.framework)
      .eq("category", sample.category)
      .neq("status", "retired")
      .limit(1)
      .maybeSingle();

    let hyp = existing as HypothesisRow | null;
    if (!hyp) {
      // Only instantiate from a spontaneous, supporting, >= moderate event.
      const seedable = groupEvents.find(
        (e) => e.stance === "supporting" && e.weightBand !== "weak"
      );
      if (!seedable || provenance !== "spontaneous") continue;
      const init = instantiationFor(seedable);
      const { data: created } = await db
        .from("hypotheses")
        .insert({
          user_id: userId,
          framework: init.framework,
          category: init.category,
          statement: init.statement,
          externalized_label: init.externalizedLabel,
          confidence_ceiling: init.confidenceCeiling,
          decay_tau_days: init.decayTauDays,
          watched_disconfirmers: init.watchedDisconfirmers,
          extractor_model_version: EXTRACTOR_MODEL,
        })
        .select("*")
        .single();
      hyp = created as HypothesisRow | null;
      if (!hyp) continue;
    }

    // Insert evidence rows (dedupe via the unique constraint; one per stance per entry).
    for (const stance of ["supporting", "contradicting"] as const) {
      const ev = groupEvents.find((e) => e.stance === stance);
      if (!ev) continue;
      await db.from("hypothesis_evidence").upsert(
        {
          hypothesis_id: hyp.id,
          user_id: userId,
          entry_id: entryId,
          entry_updated_at: entryUpdatedAt,
          stance,
          quote: ev.quote,
          situational_context: ev.situationalContext || null,
          event_type: "extracted",
          weight_band: ev.weightBand,
          provenance,
          source: "auto",
        },
        { onConflict: "hypothesis_id,entry_id,stance,event_type", ignoreDuplicates: true }
      );
    }

    await reconcileHypothesis(db, userId, hyp, groupEvents);
    touchedHypIds.add(hyp.id);
    touched++;
  }

  // Reconcile hypotheses that lost evidence on an edit but the new text no longer maps to, so their
  // aggregates/status don't go stale (decay-only, no new delta).
  for (const hid of supersededHypIds) {
    if (touchedHypIds.has(hid)) continue;
    const { data: row } = await db.from("hypotheses").select("*").eq("id", hid).maybeSingle();
    if (row) await reconcileHypothesis(db, userId, row as HypothesisRow, []);
  }

  await markProcessed(db, userId, entryId, entryUpdatedAt, events.length);

  // Pre-generate tomorrow's hypothesis nudge by overriding the `day` slot (unless the kill-switch
  // just tripped or we're at the budget cap). The fire path then serves it as a pure cache read.
  if (!suspended && used < TUNING.MONTHLY_LLM_CALL_CAP) {
    used += await maybePregenerateNudge(db, userId, {
      tone_tags: profile.tone_tags,
      writing_voice: profile.writing_voice,
      timezone: profile.timezone,
    });
  }

  await persistBudget(db, userId, month, used);
  return { eventsApplied: events.length, hypothesesTouched: touched };
}

/**
 * Pick a hypothesis nudge (rotating to the least-recently-nudged active/supported belief — no
 * cooldown), write it into the PREGEN_SLOT for the user's local day, and open a pending outcome.
 * No-op only if the user has no active/supported hypothesis or the generator can't pass its post-gate.
 */
async function maybePregenerateNudge(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  profile: { tone_tags: string[] | null; writing_voice: string | null; timezone: string | null }
): Promise<number> {
  const composed = await composeHypothesisNudge(
    userId,
    profileVoice({ tone_tags: profile.tone_tags, writing_voice: profile.writing_voice })
  );
  if (!composed) return 0;

  const deliveryDate = localDateKey(new Date(), profile.timezone ?? "UTC");
  await db.from("prompt_deliveries").upsert(
    {
      user_id: userId,
      delivery_date: deliveryDate,
      prompt_slot: TUNING.PREGEN_SLOT,
      prompt_text: composed.text,
    },
    { onConflict: "user_id,delivery_date,prompt_slot" }
  );
  await createPendingOutcome(userId, composed.hypothesisId, TUNING.PREGEN_SLOT, deliveryDate);
  return composed.calls;
}
