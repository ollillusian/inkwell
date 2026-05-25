import { localDateKey, localMinutesSinceMidnight } from "@/lib/datetime";
import type { Entry } from "@/types/database";

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * True when the entry should appear in the journal.
 * An entry is published unless it's explicitly a draft (`is_draft === true`).
 * This handles null/undefined values from legacy rows or migration gaps.
 */
export function isPublishedEntry(
  entry: Pick<Entry, "is_draft" | "body">
): boolean {
  return entry.is_draft !== true && Boolean(entry.body?.trim());
}

/** Saved journal entries (excludes in-progress autosave drafts and empty bodies). */
export function publishedEntries(entries: Entry[]): Entry[] {
  return entries.filter(isPublishedEntry);
}

/** Same calendar day as the journal list uses (profile timezone). */
export function entryLocalDateKey(
  writtenAt: string,
  timeZone: string
): string {
  return localDateKey(new Date(writtenAt), timeZone);
}

export function entriesForLocalDate(
  entries: Entry[],
  dateKey: string,
  timeZone: string
): Entry[] {
  return publishedEntries(entries)
    .filter((e) => entryLocalDateKey(e.written_at, timeZone) === dateKey)
    .sort(
      (a, b) =>
        new Date(a.written_at).getTime() - new Date(b.written_at).getTime()
    );
}

export function groupEntriesByLocalDay(
  entries: Entry[],
  timeZone: string
): { dateKey: string; entries: Entry[] }[] {
  const map = new Map<string, Entry[]>();
  for (const entry of publishedEntries(entries)) {
    const key = entryLocalDateKey(entry.written_at, timeZone);
    const list = map.get(key) ?? [];
    list.push(entry);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, dayEntries]) => ({
      dateKey,
      entries: dayEntries.sort(
        (a, b) =>
          new Date(a.written_at).getTime() - new Date(b.written_at).getTime()
      ),
    }));
}

export type EntryGraphPoint = {
  id: string;
  label: string;
  slot: string;
  minutes: number;
  words: number;
  timeLabel: string;
};

export function entryGraphPoints(
  entries: Entry[],
  timeZone: string,
  labelBySlot: Record<string, string>
): EntryGraphPoint[] {
  return entries.map((e) => {
    const at = new Date(e.written_at);
    const minutes = localMinutesSinceMidnight(at, timeZone);
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    const h12 = h % 12 || 12;
    const ampm = h < 12 ? "AM" : "PM";
    return {
      id: e.id,
      label: labelBySlot[e.prompt_slot] ?? e.prompt_slot,
      slot: e.prompt_slot,
      minutes,
      words: wordCount(e.body),
      timeLabel: `${h12}:${String(m).padStart(2, "0")} ${ampm}`,
    };
  });
}
