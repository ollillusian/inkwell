/** Local calendar + clock using the user's IANA timezone (not UTC). */

export function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function localTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

export function localMinutesSinceMidnight(date: Date, timeZone: string): number {
  const { hour, minute } = localTimeParts(date, timeZone);
  return hour * 60 + minute;
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const inTz = new Date(date.toLocaleString("en-US", { timeZone }));
  const inUtc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  return inTz.getTime() - inUtc.getTime();
}

function zonedLocalToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  timeZone: string
): Date {
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
  return new Date(guess.getTime() - tzOffsetMs(guess, timeZone));
}

export function formatMinutesLocal(
  minutes: number,
  timeZone: string,
  date: Date = new Date()
): string {
  const { year, month, day } = localTimeParts(date, timeZone);
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const utc = zonedLocalToUtc(y, mo, d, h, m, timeZone);
  return utc.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function formatLocalDateLong(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatLocalNowForLLM(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function localDayUtcBounds(
  timeZone: string,
  date: Date = new Date()
): { start: string; end: string; dateKey: string } {
  const dateKey = localDateKey(date, timeZone);
  const [y, mo, d] = dateKey.split("-").map(Number);
  const start = zonedLocalToUtc(y, mo, d, 0, 0, timeZone);
  const end = zonedLocalToUtc(y, mo, d, 23, 59, timeZone);
  return {
    dateKey,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
