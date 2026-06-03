/**
 * Stage-A local lexical sensor — deterministic, no network egress.
 *
 * It does NOT detect self-critical *content* — the LLM extractor (extractEvidence.ts) owns that,
 * with full context. This module only produces a few cheap, reproducible QUANTITATIVE signals that
 * serve two purposes:
 *   1. An independent cross-check on the LLM extractor (anti-sycophancy / anti-hallucination): if
 *      the model claims pervasive black-and-white thinking but the absolutist-word count is flat,
 *      that's a flag. The whole engine's thesis is "don't trust one LLM's judgment," so a numeric
 *      second opinion is worth keeping.
 *   2. A within-person trend (e.g. absolutist language) that the LLM is bad at quantifying
 *      consistently across entries.
 *
 * Counting is exactly the kind of thing code does better than an LLM (consistent, free, auditable),
 * which is why these stay deterministic. Anything requiring interpretation goes to the LLM.
 *
 * Uses its OWN tokenizer (not themeAnalysis.tokenizeBody), which stopwords out "should" and
 * length-filters "I"/"me" — tokens we need to count here.
 */

/** Al-Mosaiwi & Johnstone (2018) validated 19-word absolutist dictionary. */
const ABSOLUTIST_WORDS = new Set([
  "absolutely",
  "all",
  "always",
  "complete",
  "completely",
  "constant",
  "constantly",
  "definitely",
  "entire",
  "ever",
  "every",
  "everyone",
  "everything",
  "full",
  "must",
  "never",
  "nothing",
  "totally",
  "whole",
]);

const FIRST_PERSON_SINGULAR = new Set(["i", "me", "my", "mine", "myself"]);

/** Rough past-focus markers — irregular past verbs + a "-ed" heuristic. Approximate by design. */
const PAST_MARKERS = new Set([
  "was",
  "were",
  "had",
  "did",
  "went",
  "said",
  "got",
  "made",
  "took",
  "came",
  "saw",
  "felt",
  "knew",
  "thought",
  "used",
  "wanted",
  "tried",
]);

export type LexicalSignals = {
  /** Within-person rolling proportion of absolutist words, 0..100, over the window. NOT a spike. */
  absolutist_rolling_pct: number;
  /** This entry's own absolutist proportion (0..100), for trend comparison only. */
  absolutist_entry_pct: number;
  first_person_singular_density: number; // 0..1 of tokens
  past_focus_ratio: number; // 0..1, heuristic
};

const WORD_RE = /[a-z']+/gi;

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) ?? [])
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

function absolutistPct(text: string): number {
  const tokens = tokenize(text);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((t) => ABSOLUTIST_WORDS.has(t)).length;
  return (hits / tokens.length) * 100;
}

/**
 * Compute deterministic lexical signals for one entry, given recent prior entry bodies to anchor
 * the within-person absolutist trend.
 */
export function lexicalSignals(
  entryBody: string,
  recentBodies: string[] = []
): LexicalSignals {
  const tokens = tokenize(entryBody);
  const n = Math.max(1, tokens.length);

  const fps = tokens.filter((t) => FIRST_PERSON_SINGULAR.has(t)).length;
  const past = tokens.filter((t) => PAST_MARKERS.has(t) || t.endsWith("ed")).length;

  const entryPct = absolutistPct(entryBody);
  const window = [...recentBodies, entryBody].filter((b) => b && b.trim().length > 0);
  const rollingPct =
    window.length > 0
      ? window.reduce((sum, body) => sum + absolutistPct(body), 0) / window.length
      : entryPct;

  return {
    absolutist_rolling_pct: Number(rollingPct.toFixed(3)),
    absolutist_entry_pct: Number(entryPct.toFixed(3)),
    first_person_singular_density: Number((fps / n).toFixed(4)),
    past_focus_ratio: Number((past / n).toFixed(4)),
  };
}
