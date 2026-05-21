import type { TopicId } from "@/lib/promptEngine";
import { TOPICS } from "@/lib/promptEngine";
import { LITERARY_OR_THERAPY_WORDS } from "@/lib/prompts/promptStyle";

/** Everyday angles — concrete, not workshop-y. */
const PROMPT_LENSES = [
  "Something that's been bugging you today — say it straight.",
  "One person or text or interaction you keep thinking about.",
  "What you're putting off, even if it's small.",
  "What actually happened today vs what you told people happened.",
  "A moment today that was annoying, funny, or weird.",
  "What you wish you'd said to someone.",
  "What you're tired of — be specific.",
  "Something you did today that you're not sure was the right call.",
  "What you want tonight or tomorrow to feel like, in plain terms.",
  "A detail from today you don't want to forget.",
  "What you said yes to when you meant no (or the other way around).",
  "What's taking up space in your head right now.",
];

const OPENING_SHAPES = [
  "Start with a simple question you'd ask out loud.",
  "Start casual — like 'Okay so…' or 'Honestly,' then ask.",
  "One short line. No setup, no preamble.",
  "Start with 'What's…' or 'Why…' or 'Who…' — keep it normal.",
  "Start with something specific from today, then ask one thing about it.",
  "Start with 'Tell me about…' or 'What happened with…' — conversational.",
];

export type VarietyBundle = {
  lens: string;
  openingShape: string;
  focusTopic: TopicId | null;
  focusLine: string;
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function pickVarietyBundle(
  seed: string,
  topics: TopicId[]
): VarietyBundle {
  const h = hashString(seed);
  const lens = PROMPT_LENSES[h % PROMPT_LENSES.length];
  const openingShape = OPENING_SHAPES[(h >> 6) % OPENING_SHAPES.length];
  const active = topics.length > 0 ? topics : (["free"] as TopicId[]);
  const focusTopic = active[(h >> 12) % active.length] ?? "free";
  const focusLine = `Tie it loosely to "${TOPICS[focusTopic].label}" — don't quote that label in the prompt.`;

  return { lens, openingShape, focusTopic, focusLine };
}

export function formatRecentPromptsBlock(recentPrompts: string[]): string {
  const trimmed = recentPrompts
    .map((p) => p.trim())
    .filter((p) => p.length > 8)
    .slice(0, 12);
  if (trimmed.length === 0) return "";

  return `Recent prompts (don't copy these — different words and shape):
${trimmed.map((p, i) => `${i + 1}. "${p}"`).join("\n")}

Avoid therapy/journal-brand words unless the user uses them: ${LITERARY_OR_THERAPY_WORDS.slice(0, 20).join(", ")}, etc.`;
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
