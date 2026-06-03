/** Shared rules so Inkwell prompts sound like everyday speech, not workshop writing. */

export const LITERARY_OR_THERAPY_WORDS = [
  "unpack",
  "hold space",
  "what came up",
  "sit with",
  "check in with yourself",
  "honor your feelings",
  "gentle reminder",
  "what are you grateful for",
  "flicker",
  "gnaw",
  "linger",
  "weave",
  "surface",
  "shadow",
  "tender",
  "honest thing",
  "name it",
  "stay inside",
  "confess",
  "admit to yourself",
  "take a moment",
  "hold the",
  "what shifted",
  "without judging",
  "write the truth",
  "your body could speak",
  "what would enough",
  "letter to today",
  "weather report",
  "follow whichever pulls",
  "something true appears",
];

export function plainSpeechSystemRules(opts: {
  allowPoetic?: boolean;
  darkOrRaw?: boolean;
}): string {
  const { allowPoetic = false, darkOrRaw = false } = opts;

  return `You are Inkwell, a private journaling app.

Your only job: write ONE short nudge (one sentence, two at most) that gets them to write in their notebook. Output ONLY that sentence — no quotes, no preamble.

How it should sound:
- Like a normal person talking: direct, plain words, how you'd ask a friend at the kitchen table.
- Use contractions when they'd sound natural (you're, what's, didn't, I'm).
- Short sentences beat pretty ones. No metaphors unless the user's tone clearly wants them.
- ${allowPoetic ? "They chose a poetic tone — you can use a simple image, but still sound human, not like a poem in a magazine." : "Do NOT sound poetic, lyrical, therapeutic, or like a mindfulness app."}
- ${darkOrRaw ? "They want it real — blunt is fine. No cheerleading or therapy-speak." : "Warm is fine; cheesy or clinical is not."}
- Never sound like ChatGPT, a writing coach, or a journaling brand.
- Do NOT write their entry or hint at what they should say.
- Vary structure from recent prompts — don't repeat the same opening rhythm.`;
}

export const PLAIN_SPEECH_USER_REMINDER = `Voice check: Would a tired, smart friend actually say this out loud? If it sounds written-for-Instagram or like a therapy worksheet, rewrite simpler.`;

/**
 * Clinical / diagnostic terms the INVISIBLE hypothesis engine must never speak to the user. Used as
 * a HARD output gate in generateHypothesisNudge (the existing soft LITERARY_OR_THERAPY_WORDS list is
 * only fed to the model as advice and is not enforced). A hypothesis biases which open question gets
 * asked — it is never allowed to name a label. See HYPOTHESIS_NUDGE_ENGINE.md §7.3.
 */
export const CLINICAL_TERMS_BANNED = [
  "schema",
  "attachment",
  "attachment style",
  "core belief",
  "cognitive distortion",
  "distortion",
  "catastrophizing",
  "catastrophize",
  "avoidant",
  "anxious attachment",
  "maladaptive",
  "self-sabotage",
  "worthless",
  "unlovable",
  "helpless",
  "depression",
  "depressed",
  "disorder",
  "trauma",
  "triggered",
  "diagnosis",
];

/**
 * Stem patterns for higher-risk terms, so inflected/derived forms can't slip past the whole-word
 * list (e.g. "self-sabotaging", "catastrophic", "avoidance", "traumatized", "depressive").
 * Hyphens/spaces are normalized before matching.
 */
const CLINICAL_STEM_PATTERNS = [
  /self[-\s]?sabotag/, // sabotage / sabotaging
  /catastroph/, // catastrophic / catastrophize / catastrophizing
  /avoidan/, // avoidant / avoidance
  /traumati/, // traumatic / traumatized / traumatised
  /depress/, // depressed / depression / depressive
  /\bruminat/, // ruminate / rumination
  /dissociat/, // dissociate / dissociation
  /pathologi/, // pathology / pathologize
  /maladaptiv/, // maladaptive
];

/** True if the text contains any banned clinical term (whole-word) or clinical stem. */
export function containsBannedClinicalTerm(text: string): boolean {
  const lower = text.toLowerCase();
  const literal = CLINICAL_TERMS_BANNED.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(lower);
  });
  if (literal) return true;
  const normalized = lower.replace(/[-\s]+/g, " ");
  return CLINICAL_STEM_PATTERNS.some((re) => re.test(lower) || re.test(normalized));
}
