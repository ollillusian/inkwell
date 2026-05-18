import { entryLocalDateKey } from "@/lib/journal";
import type { JournalPeriodType } from "@/lib/journalPeriod";
import { generatePeriodStoryWithLLM } from "@/lib/llm/generatePeriodStory";
import type { WritingPreferences } from "@/lib/writingVoice";

export type StoryEntryInput = {
  id: string;
  prompt_slot: string;
  nudgeLabel: string;
  prompt_text: string;
  body: string;
  written_at: string;
  dayKey?: string;
};

export async function generateDayStoryWithLLM(
  dateKey: string,
  entries: StoryEntryInput[],
  voice: WritingPreferences,
  timeZone: string
): Promise<string | null> {
  const withDays = entries.map((e) => ({
    ...e,
    dayKey: e.dayKey ?? entryLocalDateKey(e.written_at, timeZone),
  }));
  return generatePeriodStoryWithLLM("day", dateKey, withDays, voice, timeZone);
}

export function storyEntriesFromRows(
  rows: {
    id: string;
    prompt_slot: string;
    prompt_text: string;
    body: string;
    written_at: string;
  }[],
  labelById: Record<string, string>,
  timeZone: string
): StoryEntryInput[] {
  return rows.map((e) => ({
    id: e.id,
    prompt_slot: e.prompt_slot,
    nudgeLabel: labelById[e.prompt_slot] ?? e.prompt_slot,
    prompt_text: e.prompt_text,
    body: e.body,
    written_at: e.written_at,
    dayKey: entryLocalDateKey(e.written_at, timeZone),
  }));
}

export type { JournalPeriodType };
