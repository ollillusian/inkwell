/**
 * Stage-B evidence extractor — the SOLE detector of self-relevant content and the SOLE source of
 * evidence quotes. Reads one journal entry and returns small, quoted "evidence events" that may
 * support OR contradict a recurring self-pattern. See HYPOTHESIS_NUDGE_ENGINE.md §4.
 *
 * Three reliability layers, in order of importance:
 *   1. Diagnosis-of-Thought prompt: fact-vs-interpretation -> for-AND-against -> situational-vs-
 *      dispositional. Forces the model to argue against itself and to consider circumstance (FAE).
 *   2. Verbatim-quote invariant (code-enforced): an event whose quote is not a literal substring of
 *      the entry is DROPPED. No quote, no event. This is the cheapest anti-hallucination guard.
 *   3. M=5 self-consistency: the call is sampled N times; only events that recur across a majority
 *      survive, and the weight band is derived from cross-sample agreement — NOT from the model's
 *      self-reported confidence (which is miscalibrated). This is NOT an independent ensemble; its
 *      only job is suppressing unstable spans/labels. Judgment reliability comes from the user over
 *      time, which is why confidence is capped low elsewhere.
 *
 * Quotes are named-entity-redacted before they leave this module.
 */
import { z } from "zod";
import type {
  EvidenceStance,
  EvidenceWeightBand,
  HypothesisFramework,
} from "@/types/database";
import { callStructured } from "@/lib/llm/modelClient";
import { redactThirdParties } from "@/lib/hypotheses/redact";
import { resolveCategory, categoryGuide, CATEGORY_ENUM_VALUES } from "@/lib/hypotheses/taxonomy";

const FRAMEWORKS = [
  "language_pattern",
  "narrative_dominant_story",
  "behavioral_pattern",
  "schema_domain",
  "beck_core_belief",
  "attachment",
  "emergent",
] as const;

const EventSchema = z.object({
  quote: z.string(),
  framework: z.enum(FRAMEWORKS),
  // The model picks the canonical category from the framework's fixed clinical vocabulary, or
  // "surface" for frameworks with no fixed taxonomy (then `label` carries the specific theme).
  category: z.enum(CATEGORY_ENUM_VALUES),
  label: z.string(), // short free-text name of the specific pattern, e.g. "earn-rest"
  stance: z.enum(["supporting", "contradicting"]),
  evidence_for: z.string(),
  evidence_against: z.string(),
  situational_context: z.string(),
  is_situational_alternative_considered: z.boolean(),
});

const ExtractionSchema = z.object({
  spans: z.array(z.object({ quote: z.string(), is_fact: z.boolean() })),
  events: z.array(EventSchema),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
type RawEvent = z.infer<typeof EventSchema>;

/** A post-processed, validated, redacted evidence event ready for the update loop. */
export type ExtractedEvent = {
  quote: string; // verbatim substring of the entry, then NE-redacted
  framework: HypothesisFramework;
  category: string; // canonical identity (clinical bucket, or normalized label for surface)
  label: string; // the model's specific free-text name for the pattern (nuance / display)
  stance: EvidenceStance;
  evidenceFor: string;
  evidenceAgainst: string;
  situationalContext: string;
  situationalConsidered: boolean;
  weightBand: EvidenceWeightBand;
};

const SYSTEM_PROMPT = `You are an evidence extractor for a journaling app's private, INTERNAL pattern index. You do NOT talk to the user and you NEVER diagnose. You read ONE journal entry and return structured data only.

Your job: extract small "evidence events" — short, QUOTED observations that might support OR contradict a recurring pattern in how the writer sees themselves.

Follow a strict 3-stage process:

STAGE 1 — Facts vs interpretations. In "spans", list the salient sentences and mark is_fact: true if it reports what HAPPENED, false if it states what the writer CONCLUDED about themselves. Only interpretations can support self-belief frameworks; facts support at most behavioral_pattern.

STAGE 2 — For AND against. Every event MUST include both:
  - evidence_for: why this quote supports the pattern.
  - evidence_against: the honest alternative reading — the case that it does NOT mean that. If you genuinely cannot argue against it, leave it empty (that marks the event as weak).

STAGE 3 — Situational vs dispositional. For every event propose a SITUATIONAL explanation (about the circumstances, not the writer's character) in situational_context, and set is_situational_alternative_considered. This is MANDATORY for beck_core_belief, attachment, and schema_domain.

Frameworks (pick one per event):
- language_pattern: a recurring word/phrasing habit (e.g. absolutist words). Surface, observable.
- narrative_dominant_story: a totalizing self-story in the writer's OWN words ("I always let people down").
- behavioral_pattern: a recurring action or behaviour.
- schema_domain: a schema-therapy domain. LOW confidence; situational explanation REQUIRED.
- beck_core_belief: a negative core belief. The DEEPEST and least observable; LOW confidence; situational explanation REQUIRED.
- attachment: an adult relational pattern. Inferring from one-sided text is unreliable; LOW confidence; situational explanation REQUIRED.
- emergent: a clear pattern fitting none of the above.

CATEGORY — choose the canonical category for the framework (this is the clinical taxonomy; you, having read the entry, do the mapping):
${categoryGuide()}
Pick the SINGLE best-fitting clinical category. For surface frameworks (or when nothing fits), use "surface".

LABEL — always give a short, specific free-text name for the pattern (e.g. "earn-rest", "lets-people-down", "all-or-nothing"). For surface frameworks the label is the identity; for deep frameworks it adds nuance under the clinical category.

HARD RULES:
- quote MUST be copied EXACTLY, word-for-word, from the entry. If you cannot quote it verbatim, DROP it.
- Be conservative. Ordinary venting, one bad day, normal frustration are NOT patterns. Prefer FEWER events; precision over recall. If nothing is notable, return an empty events array.
- Never invent content that is not in the entry. category/label are INTERNAL, never shown to anyone.`;

function buildUserPrompt(entryBody: string): string {
  return `ENTRY:
"""
${entryBody}
"""

Extract evidence events using the 3-stage process. Return JSON matching the schema.`;
}

// ---- pure post-processing (unit-testable without the network) -------------------------------

function normWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** The model's quote must appear (whitespace-normalized, case-insensitive) in the entry. */
function isVerbatim(entryBody: string, quote: string): boolean {
  const q = normWs(quote).toLowerCase();
  if (q.length < 3) return false;
  return normWs(entryBody).toLowerCase().includes(q);
}

function isTrivialAgainst(text: string): boolean {
  const t = normWs(text).toLowerCase();
  if (t.length < 4) return true;
  return /^(none|n\/a|na|-|nothing|no)\.?$/.test(t);
}

/** After NE redaction, is the quote just role tokens / connectives (i.e. only about a third party)? */
function isEmptyAfterRedaction(redacted: string): boolean {
  const stripped = redacted
    .replace(/\[someone\](?:'s)?/gi, " ") // role token incl. possessive residue ("[someone]'s")
    .replace(/\b(and|with|to|the|a|an|of|for|too|s)\b/gi, " "); // leftover connectives
  return stripped.replace(/[^a-z0-9]/gi, "").length === 0;
}

const BANDS: EvidenceWeightBand[] = ["weak", "moderate", "strong"];
function downgrade(band: EvidenceWeightBand): EvidenceWeightBand {
  const i = BANDS.indexOf(band);
  return BANDS[Math.max(0, i - 1)];
}

/** Band from cross-sample agreement fraction: 5/5 strong, 4/5 moderate, 3/5 weak, below 3/5 drop. */
function bandFromFraction(fraction: number): EvidenceWeightBand | null {
  if (fraction >= 0.999) return "strong";
  if (fraction >= 0.8) return "moderate";
  if (fraction >= 0.6) return "weak";
  return null;
}

function eventKey(e: RawEvent): string {
  return [normWs(e.quote).toLowerCase(), e.framework, e.stance].join("");
}

/**
 * Aggregate N sampled extractions into validated, redacted events via majority voting. Pure: no
 * network, no clock — safe to unit test.
 */
export function aggregateEvidenceSamples(
  entryBody: string,
  samples: Extraction[],
  knownNames: string[] = [],
  requestedSamples?: number
): ExtractedEvent[] {
  const successful = samples.length;
  if (successful < 2) return []; // never mint a pattern from a single sample
  // Denominator is the REQUESTED sample count, so failed/missing LLM calls count as disagreement
  // (a degraded run yields lower-confidence or no evidence — never inflated confidence).
  const denom = Math.max(successful, requestedSamples ?? successful);

  const groups = new Map<string, { occ: RawEvent[] }>();
  for (const sample of samples) {
    // de-dupe within a single sample so one sample contributes at most one vote per key
    const seen = new Set<string>();
    for (const ev of sample.events) {
      const key = eventKey(ev);
      if (seen.has(key)) continue;
      seen.add(key);
      const g = groups.get(key) ?? { occ: [] };
      g.occ.push(ev);
      groups.set(key, g);
    }
  }

  const out: ExtractedEvent[] = [];
  for (const { occ } of groups.values()) {
    let band = bandFromFraction(occ.length / denom);
    if (!band) continue;

    // representative = the occurrence with the most thorough situational reasoning
    const rep = [...occ].sort(
      (a, b) => normWs(b.situational_context).length - normWs(a.situational_context).length
    )[0];

    const situationalConsidered = occ.some(
      (o) => o.is_situational_alternative_considered && normWs(o.situational_context).length > 0
    );

    // downgrades: an event the model couldn't argue against is at most weak;
    // a missing situational alternative loses one band (FAE counterweight).
    if (isTrivialAgainst(rep.evidence_against)) band = "weak";
    if (!situationalConsidered) band = downgrade(band);

    if (!isVerbatim(entryBody, rep.quote)) continue; // verbatim invariant

    const redactedQuote = redactThirdParties(rep.quote, knownNames);
    if (isEmptyAfterRedaction(redactedQuote)) continue; // only-about-a-third-party => not about the user

    out.push({
      quote: redactedQuote,
      framework: rep.framework,
      // Identity = the model's chosen clinical category (validated for this framework), or the
      // normalized label for surface frameworks. This is what lets the same theme accumulate instead
      // of fragmenting across free-text slugs.
      category: resolveCategory(rep.framework, rep.category, rep.label),
      label: normWs(rep.label).slice(0, 64),
      stance: rep.stance,
      evidenceFor: normWs(rep.evidence_for),
      evidenceAgainst: normWs(rep.evidence_against),
      situationalContext: normWs(rep.situational_context),
      situationalConsidered,
      weightBand: band,
    });
  }

  return out;
}

export type ExtractEvidenceOptions = {
  samples?: number; // default 5 (M=5 self-consistency)
  knownNames?: string[]; // force-redact these third-party names
};

/** Sample the model `samples` times in parallel (varying temperature) and return the parsed,
 * schema-valid extractions (failed calls are dropped). */
async function sampleExtractions(body: string, samples: number): Promise<Extraction[]> {
  const user = buildUserPrompt(body);
  // Vary temperature across samples for genuine diversity in the stability vote.
  const temps = Array.from({ length: samples }, (_, i) => 0.3 + i * 0.1);
  const results = await Promise.all(
    temps.map((temperature) =>
      callStructured<Extraction>({
        system: SYSTEM_PROMPT,
        user,
        schema: ExtractionSchema,
        jsonSchemaName: "evidence_extraction",
        temperature,
        maxTokens: 1400,
        retries: 1,
      })
    )
  );
  return results.filter((r) => r.ok).map((r) => (r as { data: Extraction }).data);
}

/**
 * Run the extractor on one entry. Samples the model `samples` times in parallel, then aggregates
 * by majority vote. Returns validated, redacted events (possibly empty). Never throws.
 */
export async function extractEvidence(
  entryBody: string,
  opts: ExtractEvidenceOptions = {}
): Promise<ExtractedEvent[]> {
  const body = entryBody?.trim();
  if (!body) return [];
  const samples = Math.max(2, opts.samples ?? 5);
  const parsed = await sampleExtractions(body, samples);
  return aggregateEvidenceSamples(body, parsed, opts.knownNames ?? [], samples);
}

/**
 * Trace variant for observability/tuning: returns the raw per-sample extractions (DoT spans + every
 * candidate event with for/against + situational) alongside the aggregated, redacted result. Pure
 * read — never writes to the DB. Used by the dev inspector.
 */
export async function extractEvidenceTrace(
  entryBody: string,
  opts: ExtractEvidenceOptions = {}
): Promise<{ requested: number; succeeded: number; samples: Extraction[]; aggregated: ExtractedEvent[] }> {
  const body = entryBody?.trim();
  if (!body) return { requested: 0, succeeded: 0, samples: [], aggregated: [] };
  const samples = Math.max(2, opts.samples ?? 5);
  const parsed = await sampleExtractions(body, samples);
  return {
    requested: samples,
    succeeded: parsed.length,
    samples: parsed,
    aggregated: aggregateEvidenceSamples(body, parsed, opts.knownNames ?? [], samples),
  };
}
