import {
  localDateKey,
  localDayUtcBounds,
  localMinutesSinceMidnight,
  zonedLocalToUtc,
} from "@/lib/datetime";
import type { Entry } from "@/types/database";

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function publishedEntries(entries: Entry[]): Entry[] {
  return entries.filter((e) => e.is_draft !== true);
}

export function entriesForLocalDate(
  entries: Entry[],
  dateKey: string,
  timeZone: string
): Entry[] {
  const { start, end } = localDayUtcBounds(timeZone, dateKeyToDate(dateKey, timeZone));
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  return publishedEntries(entries)
    .filter((e) => {
      const t = new Date(e.written_at).getTime();
      return t >= startMs && t <= endMs;
    })
    .sort(
      (a, b) =>
        new Date(a.written_at).getTime() - new Date(b.written_at).getTime()
    );
}

function dateKeyToDate(dateKey: string, timeZone: string): Date {
  const [y, mo, d] = dateKey.split("-").map(Number);
  return zonedLocalToUtc(y, mo, d, 12, 0, timeZone);
}

export function groupEntriesByLocalDay(
  entries: Entry[],
  timeZone: string
): { dateKey: string; entries: Entry[] }[] {
  const map = new Map<string, Entry[]>();
  for (const entry of publishedEntries(entries)) {
    const key = localDateKey(new Date(entry.written_at), timeZone);
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
