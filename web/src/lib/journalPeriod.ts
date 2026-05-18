import {
  localMonthKey,
  localWeekStartKey,
  monthDateKeys,
  weekDateKeys,
  zonedLocalToUtc,
} from "@/lib/datetime";
import {
  entryLocalDateKey,
  groupEntriesByLocalDay,
  publishedEntries,
} from "@/lib/journal";
import type { Entry } from "@/types/database";

export type JournalPeriodType = "day" | "week" | "month";

export function normalizeWeekStartKey(weekKey: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) return null;
  return weekKey;
}

export function normalizeMonthKey(monthKey: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const [, mo] = monthKey.split("-").map(Number);
  if (mo < 1 || mo > 12) return null;
  return monthKey;
}

export function weekStartFromDateKey(
  dateKey: string,
  timeZone: string
): string {
  const [y, mo, d] = dateKey.split("-").map(Number);
  return localWeekStartKey(zonedLocalToUtc(y, mo, d, 12, 0, timeZone), timeZone);
}

export function entriesForLocalWeek(
  entries: Entry[],
  weekStartKey: string,
  timeZone: string
): Entry[] {
  const days = new Set(weekDateKeys(weekStartKey));
  return publishedEntries(entries)
    .filter((e) => days.has(entryLocalDateKey(e.written_at, timeZone)))
    .sort(
      (a, b) =>
        new Date(a.written_at).getTime() - new Date(b.written_at).getTime()
    );
}

export function entriesForLocalMonth(
  entries: Entry[],
  monthKey: string,
  timeZone: string
): Entry[] {
  return publishedEntries(entries)
    .filter(
      (e) => entryLocalDateKey(e.written_at, timeZone).slice(0, 7) === monthKey
    )
    .sort(
      (a, b) =>
        new Date(a.written_at).getTime() - new Date(b.written_at).getTime()
    );
}

export function groupEntriesByLocalWeek(
  entries: Entry[],
  timeZone: string
): { weekStartKey: string; entries: Entry[] }[] {
  const map = new Map<string, Entry[]>();
  for (const entry of publishedEntries(entries)) {
    const dateKey = entryLocalDateKey(entry.written_at, timeZone);
    const weekStart = weekStartFromDateKey(dateKey, timeZone);
    const list = map.get(weekStart) ?? [];
    list.push(entry);
    map.set(weekStart, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([weekStartKey, weekEntries]) => ({
      weekStartKey,
      entries: weekEntries.sort(
        (a, b) =>
          new Date(a.written_at).getTime() - new Date(b.written_at).getTime()
      ),
    }));
}

export function groupEntriesByLocalMonth(
  entries: Entry[],
  timeZone: string
): { monthKey: string; entries: Entry[] }[] {
  const map = new Map<string, Entry[]>();
  for (const entry of publishedEntries(entries)) {
    const key = localMonthKey(new Date(entry.written_at), timeZone);
    const list = map.get(key) ?? [];
    list.push(entry);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, monthEntries]) => ({
      monthKey,
      entries: monthEntries.sort(
        (a, b) =>
          new Date(a.written_at).getTime() - new Date(b.written_at).getTime()
      ),
    }));
}

export function dayGroupsInWeek(
  entries: Entry[],
  weekStartKey: string,
  timeZone: string
) {
  const days = new Set(weekDateKeys(weekStartKey));
  return groupEntriesByLocalDay(entries, timeZone).filter(({ dateKey }) =>
    days.has(dateKey)
  );
}

export function dayGroupsInMonth(
  entries: Entry[],
  monthKey: string,
  timeZone: string
) {
  const keys = new Set(monthDateKeys(monthKey));
  return groupEntriesByLocalDay(entries, timeZone).filter(({ dateKey }) =>
    keys.has(dateKey)
  );
}
