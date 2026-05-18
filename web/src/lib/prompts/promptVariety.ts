import type { TopicId } from "@/lib/promptEngine";
import { TOPICS } from "@/lib/promptEngine";

/** Creative angles so consecutive LLM prompts do not collapse into the same shape. */
const PROMPT_LENSES = [
  "A concrete object nearby or from today — not abstract wellness language.",
  "A small bodily sensation or tension they might be ignoring.",
  "Something they have not said out loud yet today.",
  "A place: where they are, where they wish they were, or where they are afraid to return.",
  "A person who crossed their mind today, without needing to explain the relationship.",
  "A decision they are postponing, even a trivial one.",
  "A sound, smell, or texture from the last few hours.",
  "The gap between what they performed today and what they actually felt.",
  "Something they are secretly proud of or ashamed of from today.",
  "A version of tonight/tomorrow if one honest thing changed.",
  "A memory that surfaced uninvited and will not leave.",
  "A rule they live by that cost them something today.",
];

const OPENING_SHAPES = [
  "Open with a sharp question.",
  "Open with an imperative verb (name, admit, describe, confess, list).",
  "Open by naming a specific image, then ask them to stay inside it.",
  "Open with a contrast (before/after, inside/outside, said/unsaid).",
  "Open with a number or limit (three words, sixty seconds, one sentence).",
  "Open with a hypothetical that stays grounded in today.",
];

const CLICHES_TO_AVOID = [
  "unpack",
  "hold space",
  "what came up",
  "sit with",
  "check in with yourself",
  "honor your feelings",
  "gentle reminder",
  "what are you grateful for",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export type VarietyBundle = {
  lens: string;
  openingShape: string;
  focusTopic: TopicId | null;
  focusLine: string;
};

export function pickVarietyBundle(
  seed: string,
  topics: TopicId[]
): VarietyBundle {
  const h = hashString(seed);
  const lens = PROMPT_LENSES[h % PROMPT_LENSES.length];
  const openingShape = OPENING_SHAPES[(h >> 6) % OPENING_SHAPES.length];
  const active = topics.length > 0 ? topics : (["free"] as TopicId[]);
  const focusTopic = active[(h >> 12) % active.length] ?? "free";
  const focusLine = `Let this prompt lean toward their theme "${TOPICS[focusTopic].label}" without naming the theme label outright.`;

  return { lens, openingShape, focusTopic, focusLine };
}

export function formatRecentPromptsBlock(recentPrompts: string[]): string {
  const trimmed = recentPrompts
    .map((p) => p.trim())
    .filter((p) => p.length > 8)
    .slice(0, 12);
  if (trimmed.length === 0) return "";

  return `Recent prompts they already saw (do NOT repeat, paraphrase, or use the same opening rhythm):
${trimmed.map((p, i) => `${i + 1}. "${p}"`).join("\n")}

Banned filler phrases unless their own voice uses them: ${CLICHES_TO_AVOID.join(", ")}.`;
}

export function shuffleTopicsForPrompt(topics: TopicId[], seed: string): TopicId[] {
  const list = [...topics];
  let h = hashString(seed);
  for (let i = list.length - 1; i > 0; i--) {
    h = (Math.imul(h, 31) + i) | 0;
    const j = Math.abs(h) % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
