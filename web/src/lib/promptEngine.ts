import promptsData from "./prompts.json";

export type TopicId = keyof typeof promptsData.topics;
export type PromptSlot = "morning" | "midday" | "evening";

export const TOPICS = promptsData.topics;
export const PROMPT_SLOTS: PromptSlot[] = ["morning", "midday", "evening"];

const SLOT_LABELS: Record<PromptSlot, string> = {
  morning: "Morning",
  midday: "Midday",
  evening: "Evening",
};

export function slotLabel(slot: PromptSlot): string {
  return SLOT_LABELS[slot];
}

/** Static fallback when LLM is unavailable. */
export function pickPrompt(
  topics: TopicId[],
  slot: PromptSlot,
  userId: string,
  date: Date = new Date()
): string {
  const active = topics.length > 0 ? topics : (["free"] as TopicId[]);
  const pool: string[] = [];

  for (const topic of active) {
    const bucket = promptsData.prompts[topic]?.[slot];
    if (bucket) pool.push(...bucket);
  }

  if (pool.length === 0) {
    return "Write whatever is true right now. Your words only.";
  }

  const seed = hashString(
    `${userId}:${dateKey(date)}:${slot}:${active.sort().join(",")}`
  );
  return pool[seed % pool.length];
}

export function currentSlot(date: Date = new Date()): PromptSlot {
  const h = date.getHours();
  if (h < 12) return "morning";
  if (h < 17) return "midday";
  return "evening";
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function isValidTopicId(id: string): id is TopicId {
  return id in promptsData.topics;
}
