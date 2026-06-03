/**
 * Compose a hypothesis-informed nudge for a user — the single source of truth shared by the async
 * pre-generation path (updateLoop) and the live request path (getDailyPrompt). Picks an
 * active/supported hypothesis (rotating to the least-recently-nudged one), gathers disconfirmers +
 * grounding, and generates a gated nudge. Returns null only when there's no usable hypothesis at all
 * (cold start / sparse journal) or the generator can't pass its gate (→ caller falls back to a
 * content-blind prompt). No cooldown: every nudge is hypothesis-inspired whenever a belief exists.
 *
 * Service-role internally (reads hypotheses + writes last_nudged_at, which now drives ROTATION only);
 * voice is passed in so this has no dependency on getDailyPrompt/updateLoop (avoids an import cycle).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { findDisconfirmers } from "@/lib/hypotheses/embedJob";
import { redactThirdParties } from "@/lib/hypotheses/redact";
import { assignCohort } from "@/lib/hypotheses/experiment";
import { generateHypothesisNudge } from "@/lib/llm/generateHypothesisNudge";
import type { WritingPreferences } from "@/lib/writingVoice";
import type { HypothesisFramework } from "@/types/database";

export type ComposedNudge = { hypothesisId: string; text: string; calls: number };

/** Fisher-Yates sample of up to n items — varies grounding so repeat nudges anchor on a different moment. */
function sample<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

type HypRow = {
  id: string;
  framework: HypothesisFramework;
  statement: string;
  externalized_label: string | null;
  evidence_tally: number;
  confidence_ceiling: number;
  watched_disconfirmers: string[] | null;
  last_nudged_at: string | null;
};

/**
 * Returns a hypothesis nudge (disconfirmer-led if a counter-example exists, else guided discovery),
 * or null if the user has no active/supported hypothesis or the generator can't pass its gate.
 */
export async function composeHypothesisNudge(
  userId: string,
  voice: WritingPreferences
): Promise<ComposedNudge | null> {
  if (assignCohort(userId) === "control") return null;
  const db = createAdminClient();

  // Honor the SAME engine gates the async processing loop honors (updateLoop). This composer is the
  // single source for both the pre-generation path AND the live getDailyPrompt path, so without this
  // the live path would keep composing nudges for a user whose harm kill-switch has suspended the
  // engine (hypothesis_engine_suspended_until) or who has it turned off (hypothesis_engine_enabled).
  // In invisible mode the kill-switch is load-bearing, so this gate is safety-critical.
  const { data: gate } = await db
    .from("profiles")
    .select("hypothesis_engine_enabled, hypothesis_engine_suspended_until")
    .eq("id", userId)
    .maybeSingle();
  if (!gate || gate.hypothesis_engine_enabled === false) return null;
  if (
    gate.hypothesis_engine_suspended_until &&
    new Date(gate.hypothesis_engine_suspended_until).getTime() > Date.now()
  ) {
    return null;
  }

  let calls = 0;

  const { data: top } = await db
    .from("hypotheses")
    .select(
      "id, framework, statement, externalized_label, evidence_tally, confidence_ceiling, watched_disconfirmers, last_nudged_at"
    )
    .eq("user_id", userId)
    .in("status", ["active", "supported"])
    .order("evidence_tally", { ascending: false })
    .limit(6);
  const pool = (top ?? []) as HypRow[];

  // No cooldown — always draw on a belief if one exists. Rotate to the LEAST-recently-nudged belief
  // (oldest / never-nudged first, tie-broken by strength, then id for determinism) so repeated nudges
  // move across the user's beliefs rather than hammering one. last_nudged_at is the rotation cursor.
  const hyp: HypRow | undefined = [...pool].sort((a, b) => {
    const ta = a.last_nudged_at ? new Date(a.last_nudged_at).getTime() : 0;
    const tb = b.last_nudged_at ? new Date(b.last_nudged_at).getTime() : 0;
    return ta - tb || b.evidence_tally - a.evidence_tally || a.id.localeCompare(b.id);
  })[0];
  if (!hyp) return null;

  // Advance the rotation cursor NOW, on selection — not after generation. If the generator later
  // fails its gate (returns no text), the belief has still rotated to the back of the queue, so the
  // next call moves on instead of re-picking and re-failing the same one. Doing it here (rather than
  // after the awaited LLM call) also shrinks the read-then-write window for concurrent callers.
  await db.from("hypotheses").update({ last_nudged_at: new Date().toISOString() }).eq("id", hyp.id);

  // Disconfirmers (preferred — lead with a real counter-example): own contradicting evidence + LLM-
  // verified corpus counter-examples.
  const { data: contra } = await db
    .from("hypothesis_evidence")
    .select("quote")
    .eq("hypothesis_id", hyp.id)
    .eq("stance", "contradicting")
    .order("created_at", { ascending: false })
    .limit(3);
  const fromEvidence = (contra ?? []).map((c: { quote: string }) => ({ text: redactThirdParties(c.quote) }));
  const watched = hyp.watched_disconfirmers ?? [];
  const verified = watched.length ? await findDisconfirmers(db, userId, hyp.statement, watched) : [];
  if (watched.length) calls += 2; // scan embed + verification call
  const disconfirmerExcerpts = [...fromEvidence, ...verified.map((d) => ({ text: d.text }))];

  // Grounding for guided discovery (downward arrow): real things they wrote that express the pattern.
  // Pull a WIDER pool and randomly sample, so repeat nudges on the same belief anchor on a DIFFERENT
  // concrete moment each time instead of always the latest three quotes.
  const { data: support } = await db
    .from("hypothesis_evidence")
    .select("quote")
    .eq("hypothesis_id", hyp.id)
    .eq("stance", "supporting")
    .order("created_at", { ascending: false })
    .limit(10);
  const groundingExcerpts = sample(
    (support ?? []).map((c: { quote: string }) => ({ text: redactThirdParties(c.quote) })),
    3
  );

  // Recent prompts (any slot) this user has already seen — the generator is told to diverge from them
  // and rejects near-duplicates, so mashing "generate another" on the same belief doesn't read alike.
  const { data: recent } = await db
    .from("prompt_deliveries")
    .select("prompt_text")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(8);
  const avoidRepeats = (recent ?? [])
    .map((r: { prompt_text: string | null }) => r.prompt_text)
    .filter((t): t is string => Boolean(t?.trim()));

  const { text, calls: nudgeCalls } = await generateHypothesisNudge({
    framework: hyp.framework,
    internalStatement: hyp.statement,
    externalizedLabel: hyp.externalized_label,
    disconfirmerExcerpts,
    groundingExcerpts,
    evidenceTally: hyp.evidence_tally,
    confidenceCeiling: hyp.confidence_ceiling,
    voice,
    avoidRepeats,
  });
  calls += nudgeCalls;
  if (!text) return null;

  return { hypothesisId: hyp.id, text, calls };
}
