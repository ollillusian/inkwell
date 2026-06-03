/**
 * Extractor eval harness (M18). Scores predicted evidence events against the labeled fixtures,
 * gating releases on PRECISION (we tolerate misses; we do not tolerate over-diagnosing benign
 * venting). The scorer is pure/testable; the runner only calls the LLM when a key is present.
 * See HYPOTHESIS_NUDGE_ENGINE.md §8.5.
 */
import type { EvidenceStance, HypothesisFramework } from "@/types/database";
import { extractEvidence, type ExtractedEvent } from "@/lib/llm/extractEvidence";
import { EVIDENCE_FIXTURES, type GoldEvent } from "@/lib/hypotheses/__fixtures__/evidenceFixtures";

/** Minimum extractor precision required to ship (false patterns are the dangerous failure). */
export const PRECISION_TARGET = 0.85;

export type PredEvent = {
  framework: HypothesisFramework;
  stance: EvidenceStance;
  quote: string;
};

export type Score = {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
};

function predMatchesGold(p: PredEvent, g: GoldEvent): boolean {
  return (
    p.framework === g.framework &&
    p.stance === g.stance &&
    p.quote.toLowerCase().includes(g.quoteIncludes.toLowerCase())
  );
}

/**
 * Score predictions against gold events. Each gold can match at most one prediction and vice-versa
 * (greedy). Pure. For an empty-gold fixture, every prediction is a false positive (precision guard).
 */
export function scoreExtraction(predicted: PredEvent[], gold: GoldEvent[]): Score {
  const usedPred = new Set<number>();
  let tp = 0;
  for (const g of gold) {
    const idx = predicted.findIndex((p, i) => !usedPred.has(i) && predMatchesGold(p, g));
    if (idx >= 0) {
      usedPred.add(idx);
      tp++;
    }
  }
  const fp = predicted.length - usedPred.size;
  const fn = gold.length - tp;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

/** Aggregate scores across fixtures (micro-averaged). Pure. */
export function aggregateScores(scores: Score[]): Score {
  const tp = scores.reduce((s, x) => s + x.tp, 0);
  const fp = scores.reduce((s, x) => s + x.fp, 0);
  const fn = scores.reduce((s, x) => s + x.fn, 0);
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

function toPred(events: ExtractedEvent[]): PredEvent[] {
  return events.map((e) => ({ framework: e.framework, stance: e.stance, quote: e.quote }));
}

export type EvalReport = {
  ran: boolean;
  reason?: string;
  perFixture: { id: string; score: Score }[];
  overall: Score;
  passed: boolean;
};

/**
 * Run the real extractor over every fixture and score it. Requires OPENAI_API_KEY (it calls the
 * model); returns ran=false with a reason otherwise. `passed` = overall precision >= PRECISION_TARGET.
 */
export async function runEval(samples = 5): Promise<EvalReport> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ran: false,
      reason: "OPENAI_API_KEY not set",
      perFixture: [],
      overall: { tp: 0, fp: 0, fn: 0, precision: 0, recall: 0, f1: 0 },
      passed: false,
    };
  }

  const perFixture: { id: string; score: Score }[] = [];
  for (const fx of EVIDENCE_FIXTURES) {
    const events = await extractEvidence(fx.entry, { samples });
    perFixture.push({ id: fx.id, score: scoreExtraction(toPred(events), fx.gold) });
  }
  const overall = aggregateScores(perFixture.map((p) => p.score));
  return { ran: true, perFixture, overall, passed: overall.precision >= PRECISION_TARGET };
}
