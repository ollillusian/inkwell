/**
 * Candidate-belief library — the seed templates and per-framework defaults the update loop uses
 * when an extracted event has no existing hypothesis to attach to. See HYPOTHESIS_NUDGE_ENGINE.md §3.
 *
 * Two ideas:
 *  - Surface frameworks (language_pattern, narrative_dominant_story, behavioral_pattern, emergent)
 *    describe the user's own observable language; they get the normal confidence ceiling.
 *  - Deep frameworks (schema_domain, beck_core_belief, attachment) are the least observable and most
 *    error-prone; they get a LOW confidence ceiling so a hunch there can never become loud, and they
 *    only ever steer which gentle question gets asked (the engine is invisible).
 *
 * Confidence is stored as bounded log-odds. Ceilings here cap how high a tally can ever climb.
 */
import type { HypothesisFramework } from "@/types/database";
import type { ExtractedEvent } from "@/lib/llm/extractEvidence";

/** log-odds(p). p=0.80 -> ~1.386 ; p=0.60 -> ~0.405. */
const SURFACE_CEILING = 1.386; // ~p=0.80 — surface, observable frameworks
const DEEP_CEILING = 0.405; // ~p=0.60 — deep, low-reliability frameworks (capped on purpose)

export const FRAMEWORK_CEILING: Record<HypothesisFramework, number> = {
  language_pattern: SURFACE_CEILING,
  narrative_dominant_story: SURFACE_CEILING,
  behavioral_pattern: SURFACE_CEILING,
  emergent: SURFACE_CEILING,
  schema_domain: DEEP_CEILING,
  beck_core_belief: DEEP_CEILING,
  attachment: DEEP_CEILING,
};

export const DEFAULT_DECAY_TAU_DAYS = 90;

/** Generic disconfirmers per framework, used when no specific template matches. */
const DEFAULT_DISCONFIRMERS: Record<HypothesisFramework, string[]> = {
  language_pattern: ["used a qualifier", "noted an exception", "acknowledged nuance"],
  narrative_dominant_story: ["a time it went differently", "an exception to the story"],
  behavioral_pattern: ["acted differently", "broke the usual pattern"],
  emergent: ["a counter-example", "a time it did not hold"],
  schema_domain: ["a need that was met", "a moment the schema did not fire"],
  beck_core_belief: ["felt capable", "felt valued", "felt connected"],
  attachment: ["leaned on someone", "stayed close", "asked for and accepted help"],
};

export type LibraryTemplate = {
  framework: HypothesisFramework;
  /** lowercase keywords; an event matches if any appears in its category. */
  categoryMatch: string[];
  statement: string;
  externalizedLabel: string;
  watchedDisconfirmers: string[];
  confidenceCeiling: number;
  decayTauDays: number;
};

/** A small, opinionated seed set. Surface stories first (lowest-risk), a few deep ones. */
export const SEED_TEMPLATES: LibraryTemplate[] = [
  {
    framework: "narrative_dominant_story",
    categoryMatch: ["earn_rest", "rest", "productivity", "worth", "output", "guilt_rest"],
    statement: "Treats rest as something that must be earned; ties self-worth to output.",
    externalizedLabel: "The Earned-Rest rule",
    watchedDisconfirmers: [
      "rested without guilt",
      "enjoyed downtime",
      "took time off and felt fine",
    ],
    confidenceCeiling: SURFACE_CEILING,
    decayTauDays: DEFAULT_DECAY_TAU_DAYS,
  },
  {
    framework: "narrative_dominant_story",
    categoryMatch: ["let_down", "letting_down", "disappoint", "reliability", "failed_others"],
    statement: "Dominant story of letting other people down.",
    externalizedLabel: "The Letting-People-Down story",
    watchedDisconfirmers: [
      "showed up for someone",
      "followed through",
      "kept a promise",
      "was there for someone",
    ],
    confidenceCeiling: SURFACE_CEILING,
    decayTauDays: DEFAULT_DECAY_TAU_DAYS,
  },
  {
    framework: "language_pattern",
    categoryMatch: ["absolutist", "all_or_nothing", "always_never", "black_white"],
    statement: "Recurring absolutist / all-or-nothing language.",
    externalizedLabel: "The All-or-Nothing",
    watchedDisconfirmers: ["used a qualifier", "noted an exception", "acknowledged a grey area"],
    confidenceCeiling: SURFACE_CEILING,
    decayTauDays: DEFAULT_DECAY_TAU_DAYS,
  },
  {
    framework: "beck_core_belief",
    categoryMatch: ["unlovable", "unloved", "rejection", "unwanted"],
    statement: "Possible core belief along the 'unlovable' axis (low confidence).",
    externalizedLabel: "the felt-unlovable thread",
    watchedDisconfirmers: ["felt cared for", "someone reached out", "felt connected"],
    confidenceCeiling: DEEP_CEILING,
    decayTauDays: 60,
  },
  {
    framework: "beck_core_belief",
    categoryMatch: ["worthless", "worth", "productivity", "earn", "achievement"],
    statement: "Possible core belief that self-worth must be earned — 'I'm not enough unless I'm producing'.",
    externalizedLabel: "the worth-through-output belief",
    watchedDisconfirmers: [
      "rested without guilt",
      "felt valued without achieving",
      "mattered to someone regardless of output",
      "enjoyed something unproductive",
    ],
    confidenceCeiling: DEEP_CEILING,
    decayTauDays: 60,
  },
  {
    framework: "beck_core_belief",
    categoryMatch: ["helpless", "powerless", "trapped", "control"],
    statement: "Possible core belief of helplessness — 'I can't cope with or change this'.",
    externalizedLabel: "the can't-cope belief",
    watchedDisconfirmers: ["handled it", "coped well", "took control of something", "managed despite the odds"],
    confidenceCeiling: DEEP_CEILING,
    decayTauDays: 60,
  },
  {
    framework: "attachment",
    categoryMatch: ["anxious", "cling", "reassurance", "abandonment"],
    statement: "Possible anxious relational pattern (low confidence; situational by default).",
    externalizedLabel: "the fear-of-losing-people pattern",
    watchedDisconfirmers: ["felt secure with someone", "trusted without checking", "let closeness be"],
    confidenceCeiling: DEEP_CEILING,
    decayTauDays: 60,
  },
  {
    framework: "attachment",
    categoryMatch: ["avoidant", "withdraw", "pull_back", "distance", "self_reliant"],
    statement: "Possible avoidant relational pattern (low confidence; situational by default).",
    externalizedLabel: "the pull-back-when-close pattern",
    watchedDisconfirmers: ["leaned on someone", "stayed close", "asked for help"],
    confidenceCeiling: DEEP_CEILING,
    decayTauDays: 60,
  },
  {
    framework: "schema_domain",
    categoryMatch: ["disconnection", "isolation", "other_directed", "subjugation"],
    statement: "Possible schema-domain pattern (low confidence).",
    externalizedLabel: "a recurring relational theme",
    watchedDisconfirmers: ["a need that was met", "a moment it did not fire"],
    confidenceCeiling: DEEP_CEILING,
    decayTauDays: 60,
  },
];

function categoryTokens(category: string): string[] {
  return category.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function matchTemplate(event: ExtractedEvent): LibraryTemplate | null {
  const tokens = new Set(categoryTokens(event.category));
  for (const tpl of SEED_TEMPLATES) {
    if (tpl.framework !== event.framework) continue;
    if (tpl.categoryMatch.some((m) => tokens.has(m) || event.category.toLowerCase().includes(m))) {
      return tpl;
    }
  }
  return null;
}

export type Instantiation = {
  framework: HypothesisFramework;
  category: string;
  statement: string;
  externalizedLabel: string | null;
  watchedDisconfirmers: string[];
  confidenceCeiling: number;
  decayTauDays: number;
};

/**
 * Produce the fields for a new candidate hypothesis from an extracted event — using a matching seed
 * template when available, otherwise framework defaults built from the event itself.
 */
export function instantiationFor(event: ExtractedEvent): Instantiation {
  const tpl = matchTemplate(event);
  if (tpl) {
    return {
      framework: tpl.framework,
      category: event.category,
      statement: tpl.statement,
      externalizedLabel: tpl.externalizedLabel,
      watchedDisconfirmers: tpl.watchedDisconfirmers,
      confidenceCeiling: tpl.confidenceCeiling,
      decayTauDays: tpl.decayTauDays,
    };
  }
  return {
    framework: event.framework,
    category: event.category,
    statement: `Recurring ${event.framework.replace(/_/g, " ")}: ${event.evidenceFor}`.slice(0, 280),
    externalizedLabel: null,
    watchedDisconfirmers: DEFAULT_DISCONFIRMERS[event.framework] ?? [],
    confidenceCeiling: FRAMEWORK_CEILING[event.framework],
    decayTauDays: event.framework === "language_pattern" ? DEFAULT_DECAY_TAU_DAYS : 60,
  };
}
