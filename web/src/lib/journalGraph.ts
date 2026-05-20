import { formatLocalDateMedium } from "@/lib/datetime";
import { entryLocalDateKey } from "@/lib/journal";
import type { Entry } from "@/types/database";

export function entriesToThemeGraphInput(
  entries: Entry[],
  timeZone: string,
  resolveLabel: (slot: string) => string
) {
  return entries.map((e) => {
    const dayKey = entryLocalDateKey(e.written_at, timeZone);
    return {
      id: e.id,
      topics_snapshot: e.topics_snapshot,
      prompt_slot: e.prompt_slot,
      nudgeLabel: resolveLabel(e.prompt_slot),
      written_at: e.written_at,
      body: e.body ?? "",
      dayKey,
      dayLabel: formatLocalDateMedium(new Date(e.written_at), timeZone),
    };
  });
}
