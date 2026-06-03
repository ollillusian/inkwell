/**
 * Canonical category vocabulary — the fix for "fragmentation". Hypothesis identity is
 * (framework, category); if the LLM invents a fresh free-text slug per entry, evidence scatters and
 * never accumulates. So the EXTRACTOR picks the category from a fixed, clinically-grounded vocabulary
 * (the model that read the entry does the mapping — not a keyword heuristic), and this module just
 * defines the allowed sets and validates the choice.
 *
 * The deep frameworks have real canonical taxonomies:
 *   - beck_core_belief : helpless | unlovable | worthless        (J. Beck's three core beliefs)
 *   - schema_domain    : Young's 5 schema domains
 *   - attachment       : anxious | avoidant | secure | disorganized
 * Surface frameworks (language/narrative/behavioral/emergent) have no fixed taxonomy — the model
 * returns "surface" and the specific theme lives in a free-text `label`, which becomes the identity
 * (normalized) for those.
 *
 * Pure module: only the framework type is imported, so it's safe to use anywhere (no cycles).
 */
import type { HypothesisFramework, HypothesisStatus } from "@/types/database";

/** Allowed clinical categories per deep framework. The model must choose from these. */
export const FRAMEWORK_CATEGORIES: Partial<Record<HypothesisFramework, readonly string[]>> = {
  beck_core_belief: ["helpless", "unlovable", "worthless"],
  attachment: ["anxious", "avoidant", "secure", "disorganized"],
  schema_domain: [
    "disconnection_rejection",
    "impaired_autonomy",
    "impaired_limits",
    "other_directedness",
    "overvigilance_inhibition",
  ],
};

/** All clinical categories + the "surface" sentinel — the enum the extractor chooses from. */
export const CATEGORY_ENUM_VALUES = [
  "helpless",
  "unlovable",
  "worthless",
  "anxious",
  "avoidant",
  "secure",
  "disorganized",
  "disconnection_rejection",
  "impaired_autonomy",
  "impaired_limits",
  "other_directedness",
  "overvigilance_inhibition",
  "surface",
] as const;
export type CategoryEnum = (typeof CATEGORY_ENUM_VALUES)[number];

export function normalizeSlug(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return s || "unspecified";
}

/**
 * Resolve the final identity category. If the model's clinical pick is valid FOR THIS framework, use
 * it (that's the LLM doing the categorization). Otherwise — "surface", or a clinical value that
 * doesn't belong to this framework — fall back to the normalized free-text label so surface patterns
 * keep their own identity and a cross-framework mislabel can't merge unrelated things.
 */
export function resolveCategory(
  framework: HypothesisFramework,
  clinicalCategory: string,
  label: string
): string {
  const allowed = FRAMEWORK_CATEGORIES[framework];
  if (allowed && clinicalCategory !== "surface" && allowed.includes(clinicalCategory)) {
    return clinicalCategory;
  }
  return normalizeSlug(label || clinicalCategory);
}

// ---- human-readable display (for the dev inspector; the engine itself stays invisible) ---------

/** Plain-language name for each framework. */
export const FRAMEWORK_LABEL: Record<HypothesisFramework, string> = {
  beck_core_belief: "Core belief",
  narrative_dominant_story: "Dominant story",
  language_pattern: "Language habit",
  behavioral_pattern: "Behaviour pattern",
  schema_domain: "Relational pattern",
  attachment: "Attachment style",
  emergent: "Emerging pattern",
};

/** Plain-language lifecycle status. */
export const STATUS_LABEL: Record<HypothesisStatus, string> = {
  candidate: "Forming",
  active: "Active",
  supported: "Well-supported",
  refuted: "Ruled out",
  retired: "Dropped",
};

/** Convert internal log-odds to a 0–100 confidence reading (dev display only). */
export function logOddsToPct(x: number): number {
  return Math.round(100 / (1 + Math.exp(-x)));
}

/** Plain-language theme for the canonical clinical categories. */
const CATEGORY_THEME: Record<string, string> = {
  worthless: "“I’m only worth what I produce”",
  helpless: "“I can’t cope / it’s out of my hands”",
  unlovable: "“I’m not really lovable”",
  anxious: "anxious — fear of being left",
  avoidant: "avoidant — pulling back when close",
  secure: "secure",
  disorganized: "push-and-pull closeness",
  disconnection_rejection: "expecting disconnection or rejection",
  impaired_autonomy: "a shaky sense of independence",
  impaired_limits: "trouble with limits",
  other_directedness: "putting others first / people-pleasing",
  overvigilance_inhibition: "bracing / holding feelings in",
};

/**
 * Describe a (framework, category) in plain language for display. `kind` is the friendly type,
 * `theme` is what it's about, `technical` is the raw slug pair kept small for the developer.
 */
export function describePattern(
  framework: HypothesisFramework,
  category: string
): { kind: string; theme: string; technical: string } {
  return {
    kind: FRAMEWORK_LABEL[framework] ?? framework,
    theme: CATEGORY_THEME[category] ?? category.replace(/_/g, " "),
    technical: `${framework} / ${category}`,
  };
}

/** Human-readable hint of the allowed categories per framework, for the extractor prompt. */
export function categoryGuide(): string {
  return [
    "- beck_core_belief: category MUST be one of helpless | unlovable | worthless",
    "- attachment: category MUST be one of anxious | avoidant | secure | disorganized",
    "- schema_domain: category MUST be one of disconnection_rejection | impaired_autonomy | impaired_limits | other_directedness | overvigilance_inhibition",
    "- language_pattern | narrative_dominant_story | behavioral_pattern | emergent: set category = \"surface\"",
  ].join("\n");
}
