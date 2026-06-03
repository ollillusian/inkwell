/**
 * Labeled fixtures for the extractor eval harness (M18). De-identified, synthetic entries with the
 * events a human annotator would expect. Used to gate extractor releases on PRECISION — false
 * patterns (over-diagnosing benign venting) are worse than misses. See HYPOTHESIS_NUDGE_ENGINE.md §8.5.
 *
 * `quoteIncludes` is a verbatim fragment the gold quote must contain. A fixture with an empty
 * `gold` array asserts the extractor should find NOTHING (precision guard).
 */
import type { EvidenceStance, HypothesisFramework } from "@/types/database";

export type GoldEvent = {
  framework: HypothesisFramework;
  stance: EvidenceStance;
  quoteIncludes: string;
};

export type EvidenceFixture = {
  id: string;
  entry: string;
  gold: GoldEvent[];
  note?: string;
};

export const EVIDENCE_FIXTURES: EvidenceFixture[] = [
  {
    id: "earn-rest",
    entry:
      "Took the afternoon off and felt guilty the whole time. I always do this — I can't relax unless I've earned it somehow. Ended up working at 9pm just to feel okay.",
    gold: [
      {
        framework: "narrative_dominant_story",
        stance: "supporting",
        quoteIncludes: "can't relax unless I've earned it",
      },
    ],
    note: "Clear earned-rest dominant story.",
  },
  {
    id: "unique-outcome",
    entry:
      "Funny thing — I actually finished the whole presentation early today and even had time to help a teammate. Felt good to just be on top of it for once.",
    gold: [
      {
        framework: "narrative_dominant_story",
        stance: "contradicting",
        quoteIncludes: "finished the whole presentation early",
      },
    ],
    note: "A unique outcome (contradicts a not-good-enough story).",
  },
  {
    id: "benign-venting",
    entry:
      "Rainy day. The bus was late and I was annoyed, but the coffee was good and I caught up with an old friend. Pretty ordinary Tuesday.",
    gold: [],
    note: "Ordinary venting/positivity — extractor must find NOTHING (precision guard).",
  },
  {
    id: "absolutist-language",
    entry:
      "Everyone always lets me down eventually. Every single time I trust someone it falls apart completely. Nothing ever lasts.",
    gold: [
      {
        framework: "narrative_dominant_story",
        stance: "supporting",
        quoteIncludes: "always lets me down",
      },
    ],
    note: "Heavy absolutist + dominant relational story.",
  },
  {
    id: "factual-only",
    entry: "Went for a run, did groceries, fixed the leaky tap, called my sister about the weekend.",
    gold: [],
    note: "Pure facts, no self-interpretation — should not seed self-belief frameworks.",
  },
];
