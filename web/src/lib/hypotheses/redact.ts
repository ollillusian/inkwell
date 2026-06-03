/**
 * Named-entity redaction — rewrites likely third-party personal names to a role token BEFORE any
 * quote is stored in hypothesis_evidence or any text is embedded into entry_embeddings.
 * See HYPOTHESIS_NUDGE_ENGINE.md §6.2.
 *
 * This is a deliberately conservative, deterministic HEURISTIC, not real NER. It targets the common
 * cases (possessives like "Sarah's", person-context like "with Sarah", and multi-word TitleCase
 * runs like "John Smith") while allowlisting calendar words and the like to keep precision high.
 * It WILL miss names at sentence start and over/under-redact some edge cases. The robust upgrade is
 * an LLM/NER pass (tracked as a v2 item). Because the engine is invisible and the only downstream
 * consumer (the nudge generator) reflects patterns, not people, best-effort redaction is the floor,
 * not the ceiling, of the privacy posture here.
 */

const ROLE_TOKEN = "[someone]";

/** Capitalized words that are almost never third-party personal names. */
const ALLOWLIST = new Set(
  [
    // weekdays / months
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
    // product / app / self
    "inkwell",
    "god",
    "christmas",
    "easter",
    "thanksgiving",
    "internet",
    "english",
    // pronouns / contractions / demonstratives / question words / conjunctions that get
    // capitalized at sentence start and must never be mistaken for a name.
    "i",
    "i'm",
    "i've",
    "i'll",
    "i'd",
    "it",
    "he",
    "she",
    "they",
    "we",
    "you",
    "that",
    "this",
    "these",
    "those",
    "there",
    "here",
    "what",
    "who",
    "when",
    "where",
    "why",
    "how",
    "let",
    "the",
    "then",
    "than",
    "but",
    "and",
    "so",
    "well",
    "also",
    "my",
    "his",
    "her",
    "our",
    "your",
    "their",
    "ended",
    "took",
    "had",
    "now",
    "today",
    "tomorrow",
    "yesterday",
  ].map((w) => w.toLowerCase())
);

function isAllowlisted(word: string): boolean {
  return ALLOWLIST.has(word.toLowerCase());
}

const POSSESSIVE_RE = /\b([A-Z][a-z]{1,})'s\b/g;
const PERSON_CONTEXT_RE =
  /\b(with|to|from|told|tells|telling|saw|see|seeing|met|meet|meeting|called|calls|texted|texting|asked|asking|and|for|about|like|than|beside|near|join|joined|visit|visited)\s+([A-Z][a-z]{1,})\b/g;
const TITLECASE_RUN_RE = /\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})+)\b/g;

/**
 * Redact likely third-party personal names. Optionally force-redact a set of known first names
 * (e.g. names surfaced from prior entries) regardless of position.
 */
export function redactThirdParties(text: string, knownNames: string[] = []): string {
  if (!text) return text;
  let out = text;

  // 1. Multi-word TitleCase runs ("John Smith", "Aunt Mary") — strongest name signal.
  out = out.replace(TITLECASE_RUN_RE, (match) => {
    const parts = match.split(/\s+/);
    if (parts.every((p) => isAllowlisted(p))) return match;
    return ROLE_TOKEN;
  });

  // 2. Possessives ("Sarah's" -> "[someone]'s").
  out = out.replace(POSSESSIVE_RE, (match, name: string) =>
    isAllowlisted(name) ? match : `${ROLE_TOKEN}'s`
  );

  // 3. Person-context single names ("with Sarah" -> "with [someone]").
  out = out.replace(PERSON_CONTEXT_RE, (match, cue: string, name: string) =>
    isAllowlisted(name) ? match : `${cue} ${ROLE_TOKEN}`
  );

  // 4. Caller-supplied known names, anywhere, case-insensitive whole-word.
  for (const name of knownNames) {
    const trimmed = name.trim();
    if (trimmed.length < 2) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}('s)?\\b`, "gi"), (_m, poss) =>
      poss ? `${ROLE_TOKEN}'s` : ROLE_TOKEN
    );
  }

  // Collapse accidental adjacent role tokens ("[someone] [someone]").
  out = out.replace(/(\[someone\]\s*){2,}/g, `${ROLE_TOKEN} `).trim();

  return out;
}

/** True if redaction changed the text — i.e. the span referenced a likely third party. */
export function mentionsThirdParty(text: string, knownNames: string[] = []): boolean {
  return redactThirdParties(text, knownNames) !== text;
}
