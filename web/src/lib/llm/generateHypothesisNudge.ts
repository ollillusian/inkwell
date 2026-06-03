/**
 * Turn an active hypothesis into a Socratic nudge that guides the user to realize the pattern
 * THEMSELVES — never naming it, never asserting it. See HYPOTHESIS_NUDGE_ENGINE.md §7.
 *
 * Two moves:
 *  - UNIQUE OUTCOME — when a real past counter-example exists, lead with it and ask how it sits.
 *  - GUIDED DISCOVERY (downward arrow) — otherwise, start from something concrete they wrote and ask
 *    one open question that follows the thread toward what it might mean about how they see
 *    themselves, so THEY put it into words.
 *
 * Invariant either way: it stays an open QUESTION (any honest answer fits — so a wrong guess is
 * harmless and self-correcting), never a verdict, never a clinical label. A hard post-gate enforces
 * that. Crisis-suppression (upstream) and the harm kill-switch are the safety backstops.
 */
import type { HypothesisFramework } from "@/types/database";
import { callText } from "@/lib/llm/modelClient";
import {
  PLAIN_SPEECH_USER_REMINDER,
  containsBannedClinicalTerm,
} from "@/lib/prompts/promptStyle";
import {
  buildVoiceBrief,
  systemPromptForVoice,
  type WritingPreferences,
} from "@/lib/writingVoice";

export type HypothesisNudgeInput = {
  framework: HypothesisFramework;
  /** Internal pattern description — given to the model for context, NEVER revealed to the user. */
  internalStatement: string;
  externalizedLabel: string | null;
  /** Past entry excerpts that CONTRADICT the negative story (the unique-outcome material). */
  disconfirmerExcerpts?: { date?: string; text: string }[];
  /** Real things they wrote that express the pattern — grounding for the downward-arrow question. */
  groundingExcerpts?: { date?: string; text: string }[];
  evidenceTally: number;
  confidenceCeiling: number;
  voice: WritingPreferences;
  /** Recently-shown prompts (any slot) — the model is told to diverge from these, and candidates too
   *  similar to one are rejected and retried, so repeat nudges on the same belief don't read alike. */
  avoidRepeats?: string[];
};

// ---- pure post-gate (unit-testable) ---------------------------------------------------------

const DECLARATIVE_RE =
  /\byou seem to (?:be|believe|think|have)\b|\bdeep down,? you\b|\byour (?:pattern|core belief|attachment|schema|tendency)\b|\byou clearly\b|\byou obviously\b|\byou have a (?:pattern|tendency|habit of)\b|\byou keep (?:telling|convincing) yourself\b/i;

// Flat assertions that NAME a self-worth / identity belief as fact — the conclusion handed to the
// user instead of reached by them (the cardinal rule). High-precision on purpose: a missed borderline
// case just yields a slightly-leading question, but a false positive rejects a good open question and
// pushes toward a content-blind fallback. Feeling-/think-framed reflections ("when you feel you can't
// rest until you've earned it…") deliberately do NOT match — only the belief asserted as a premise.
const STATES_BELIEF_RE = new RegExp(
  [
    // "your (whole) worth/value/identity is|comes|depends|tied|based …"
    String.raw`\byour (?:whole |entire |sense of )?(?:self-?worth|worth|value|identity)\b[^?]{0,30}\b(?:is|comes|depends|hinges|rests|tied|based|built|defined)\b`,
    // "you tie/base/build/stake/measure … your worth/value/identity"
    String.raw`\byou (?:tie|base|build|stake|pin|root|hinge|measure|define|attach)\b[^?]{0,25}\b(?:worth|value|identity|self-?worth)\b`,
    // "you're only worth/valuable/enough …" / "you only matter/count/have value …"
    String.raw`\byou(?:'re| are) only (?:worth|valuable|lovable|enough|good enough)\b`,
    String.raw`\byou only (?:matter|count|have value|deserve)\b`,
    // "you believe/think/tell yourself you're not/never/only/worthless/… " (attributing the belief)
    String.raw`\byou (?:believe|think|tell yourself) (?:that )?you(?:'re| are)?\s*(?:not|never|only|worthless|unlovable|nothing|broken|unworthy|a failure|not enough)\b`,
  ].join("|"),
  "i"
);

export type GateVerdict = { ok: true } | { ok: false; reason: string };

/** Reject anything that asserts a conclusion, names a clinical label, or isn't an open question. */
export function gateNudge(text: string): GateVerdict {
  const t = text.trim();
  if (t.length < 12) return { ok: false, reason: "too_short" };
  if (!t.includes("?")) return { ok: false, reason: "not_a_question" };
  if (DECLARATIVE_RE.test(t)) return { ok: false, reason: "declarative" };
  if (STATES_BELIEF_RE.test(t)) return { ok: false, reason: "states_belief" };
  if (containsBannedClinicalTerm(t)) return { ok: false, reason: "clinical_term" };
  return { ok: true };
}

// ---- near-duplicate detection (so repeat nudges on the same belief don't read alike) -----------

function normalizeForSim(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * True if `candidate` is too close to any prior — either it opens with the same first few words or it
 * shares too many tokens overall. Cheap, dependency-free; deliberately conservative so an obvious
 * reword ("being the injured lad, what stops you…" vs "being the lad who's injured, what holds you…")
 * is caught while a genuinely different angle passes.
 */
export function tooSimilar(
  candidate: string,
  priors: string[],
  opts: { jaccard?: number; prefixWords?: number } = {}
): boolean {
  const jThresh = opts.jaccard ?? 0.5;
  const pfxN = opts.prefixWords ?? 5;
  const cWords = normalizeForSim(candidate).split(" ").filter(Boolean);
  if (cWords.length === 0) return false;
  const cTokens = new Set(cWords);
  const cPrefix = cWords.slice(0, pfxN).join(" ");
  for (const p of priors) {
    if (!p) continue;
    const pWords = normalizeForSim(p).split(" ").filter(Boolean);
    if (pWords.length === 0) continue;
    if (cWords.length >= pfxN && pWords.slice(0, pfxN).join(" ") === cPrefix) return true;
    if (jaccard(cTokens, new Set(pWords)) >= jThresh) return true;
  }
  return false;
}

// ---- prompt construction --------------------------------------------------------------------

function excerptList(items: { date?: string; text: string }[]): string {
  return items
    .slice(0, 3)
    .map((d) => `- ${d.date ? `(${d.date}) ` : ""}"${d.text}"`)
    .join("\n");
}

function buildUserPrompt(input: HypothesisNudgeInput): string {
  const voiceBrief = buildVoiceBrief(input.voice);
  const disconfirmers = excerptList(input.disconfirmerExcerpts ?? []);
  const grounding = excerptList(input.groundingExcerpts ?? []);
  const recent = (input.avoidRepeats ?? []).filter((t) => t?.trim()).slice(0, 6);
  const freshness = recent.length
    ? `\nFRESHNESS — you've recently asked them these. Do NOT reuse their opening, their central image, or the same question reworded. Take a genuinely different angle (a different concrete moment, a different feeling, a different time of day), and VARY THE SHAPE of the question — if a recent one opened "What does it say about you when…" or "What does it feel like when…", open a different way this time:\n${recent.map((t) => `- "${t}"`).join("\n")}\n`
    : "";

  const move = disconfirmers
    ? `MOVE — UNIQUE OUTCOME. Lead with one of these real past moments of theirs that cut AGAINST the pattern, then ask how it sits alongside how things feel lately:\n${disconfirmers}`
    : `MOVE — GUIDED DISCOVERY (the "downward arrow"). Start ONLY from what they actually wrote${
        grounding
          ? `:\n${grounding}`
          : " — and if you have nothing concrete, ask a gentle open question about the area without naming anything"
      }
Ask ONE open question that steps just BENEATH their own words — toward what it might mean to them — so THEY are the one who names the deeper thing. Be courageous about pointing them down toward it; just never arrive there FOR them.`;

  return `INTERNAL DIRECTION (your private compass — the destination they must reach on their OWN; it NEVER appears in the nudge, not as a statement and not as a premise): ${input.internalStatement}

${move}

HARD RULES:
- Output ONE nudge (one or two sentences). It MUST be a question they answer.
- Build the question from THEIR OWN words only. If they haven't put the deeper belief into words, you don't either — you only open the door to it. Never state your inference, and never smuggle it in as the question's premise.
    DON'T: "What does it say about you that your worth is tied to what you produce?"  ← states your conclusion for them
    DO:    "When you feel you can't rest until you've earned it, what do you think that's about?"  ← their words, opens downward
- NEVER tell them what they believe or what they are. No "you are…", no diagnoses, no therapy/clinical words.
- Keep it OPEN: any honest answer should fit. (If your read is wrong, an open question still lands fine.)
- Ask it directly and with warmth — be brave, but it stays a question, not a verdict, and easy to brush off.
${freshness}${voiceBrief ? `\n${voiceBrief}` : ""}

${PLAIN_SPEECH_USER_REMINDER}`;
}

export type GenerateHypothesisNudgeOptions = { retries?: number };

/**
 * Generate a gated hypothesis nudge. Prefers one that passes the gate AND isn't a near-duplicate of a
 * recent prompt; if every attempt is a near-duplicate it returns the best gate-passing one anyway (a
 * slightly familiar hypothesis nudge still beats a content-blind fallback). Returns null only if NO
 * attempt passed the gate at all (caller then falls back to content-blind).
 */
export async function generateHypothesisNudge(
  input: HypothesisNudgeInput,
  opts: GenerateHypothesisNudgeOptions = {}
): Promise<{ text: string | null; calls: number }> {
  // A few more tries when we're actively dodging repeats — diversity needs the extra rolls.
  const retries = opts.retries ?? (input.avoidRepeats?.length ? 3 : 2);
  const system = systemPromptForVoice(input.voice);
  const user = buildUserPrompt(input);
  const priors = (input.avoidRepeats ?? []).filter((t) => t?.trim());

  let calls = 0;
  let lastGated: string | null = null;
  for (let i = 0; i <= retries; i++) {
    calls++;
    const text = await callText({
      system,
      user,
      temperature: 0.8,
      topP: 0.9,
      frequencyPenalty: 0.4,
      presencePenalty: 0.3,
      maxTokens: 120,
      retries: 0,
    });
    if (!text) continue;
    const cleaned = text.replace(/^["']|["']$/g, "").trim();
    if (!gateNudge(cleaned).ok) continue;
    lastGated = cleaned; // a valid fallback if every remaining try is also a near-duplicate
    if (priors.length && tooSimilar(cleaned, priors)) continue;
    return { text: cleaned, calls };
  }
  return { text: lastGated, calls };
}
