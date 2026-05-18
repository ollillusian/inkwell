import { localMinutesSinceMidnight } from "@/lib/datetime";
import type { NudgeKind } from "@/lib/nudges";
import type { WritingPreferences } from "@/lib/writingVoice";

export const ON_DEMAND_PROMPT_PREFIX = "on-demand-";
export const ON_DEMAND_PROMPT_LABEL = "On-demand prompt";

export function newOnDemandPromptId(): string {
  return `${ON_DEMAND_PROMPT_PREFIX}${crypto.randomUUID()}`;
}

export function isOnDemandPromptId(id?: string | null): id is string {
  return Boolean(id?.startsWith(ON_DEMAND_PROMPT_PREFIX));
}

export function onDemandPromptContext(
  timeZone: string,
  voice: WritingPreferences,
  date: Date = new Date()
): {
  label: string;
  kind: NudgeKind;
  effectiveMinutes: number;
  timeZone: string;
  voice: WritingPreferences;
} {
  return {
    label: ON_DEMAND_PROMPT_LABEL,
    kind: "once",
    effectiveMinutes: localMinutesSinceMidnight(date, timeZone),
    timeZone,
    voice,
  };
}
