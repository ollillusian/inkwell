import { localMinutesSinceMidnight } from "@/lib/datetime";
import type { NudgeKind } from "@/lib/nudges";
import type { WritingPreferences } from "@/lib/writingVoice";

export const ON_DEMAND_PROMPT_PREFIX = "on-demand-";
export const ON_DEMAND_PROMPT_LABEL = "On-demand prompt";

const SLUG_ADJECTIVES = [
  "quiet",
  "soft",
  "wild",
  "golden",
  "hidden",
  "gentle",
  "midnight",
  "open",
  "brave",
  "tender",
];

const SLUG_NOUNS = [
  "ember",
  "river",
  "lantern",
  "field",
  "harbor",
  "threshold",
  "echo",
  "root",
  "moon",
  "weather",
];

const LEGACY_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OnDemandPromptSummary = {
  nudgeId: string;
  prompt: string;
  createdAt: string;
  draftBody?: string;
};

export function newOnDemandPromptId(): string {
  const token = crypto.randomUUID().replaceAll("-", "");
  const firstSeed = parseInt(token.slice(0, 8), 16);
  const secondSeed = parseInt(token.slice(8, 16), 16);
  const suffix = parseInt(token.slice(16, 22), 16).toString(36).slice(0, 3);
  const adjective = SLUG_ADJECTIVES[firstSeed % SLUG_ADJECTIVES.length];
  const noun = SLUG_NOUNS[secondSeed % SLUG_NOUNS.length];

  return `${ON_DEMAND_PROMPT_PREFIX}${adjective}-${noun}-${suffix}`;
}

export function isOnDemandPromptId(id?: string | null): id is string {
  return Boolean(id?.startsWith(ON_DEMAND_PROMPT_PREFIX));
}

export function formatOnDemandPromptLabel(id?: string | null): string | null {
  if (!isOnDemandPromptId(id)) return null;

  const slug = id.slice(ON_DEMAND_PROMPT_PREFIX.length);
  if (!slug || LEGACY_UUID_PATTERN.test(slug)) return "Fresh prompt";

  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export function onDemandPromptContext(
  timeZone: string,
  voice: WritingPreferences,
  date: Date = new Date(),
  nudgeId?: string
): {
  label: string;
  kind: NudgeKind;
  effectiveMinutes: number;
  timeZone: string;
  voice: WritingPreferences;
} {
  const label =
    (nudgeId && formatOnDemandPromptLabel(nudgeId)) ||
    ON_DEMAND_PROMPT_LABEL;

  return {
    label,
    kind: "once",
    effectiveMinutes: localMinutesSinceMidnight(date, timeZone),
    timeZone,
    voice,
  };
}
