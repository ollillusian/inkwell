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

/** UTC instant for a wall-clock time in an IANA zone (DST-safe). */
export function zonedLocalToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  timeZone: string
): Date {
  let t = Date.UTC(y, mo - 1, d, h, mi, 0);
  for (let i = 0; i < 6; i++) {
    const p = localTimeParts(new Date(t), timeZone);
    const py = Number(p.year);
    const pm = Number(p.month);
    const pd = Number(p.day);
    if (py === y && pm === mo && pd === d && p.hour === h && p.minute === mi) {
      return new Date(t);
    }
    const diffMin =
      (h - p.hour) * 60 +
      (mi - p.minute) +
      (d - pd) * 24 * 60 +
      (mo - pm) * 31 * 24 * 60 +
      (y - py) * 365 * 24 * 60;
    t += diffMin * 60_000;
  }
  return new Date(t);
}

/** Format scheduled nudge minutes (already local wall time) as 12h clock. */
export function formatMinutesLocal(
  minutes: number,
  _timeZone?: string,
  _date?: Date
): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h24 % 12 || 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function formatLocalDateLong(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatLocalDateMedium(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatLocalTime(
  date: Date,
  timeZone: string,
  opts?: { hour12?: boolean }
): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: opts?.hour12 ?? true,
  }).format(date);
}

export function formatWrittenAt(iso: string, timeZone: string): string {
  const date = new Date(iso);
  return `${formatLocalDateMedium(date, timeZone)} · ${formatLocalTime(date, timeZone)}`;
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

function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const utc = Date.UTC(y, mo - 1, d + days);
  const nd = new Date(utc);
  const yy = nd.getUTCFullYear();
  const mm = String(nd.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nd.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function localDayUtcBounds(
  timeZone: string,
  date: Date = new Date()
): { start: string; end: string; dateKey: string } {
  const dateKey = localDateKey(date, timeZone);
  const [y, mo, d] = dateKey.split("-").map(Number);
  const start = zonedLocalToUtc(y, mo, d, 0, 0, timeZone);
  const nextKey = addDaysToDateKey(dateKey, 1);
  const [y2, mo2, d2] = nextKey.split("-").map(Number);
  const endExclusive = zonedLocalToUtc(y2, mo2, d2, 0, 0, timeZone);
  const end = new Date(endExclusive.getTime() - 1);
  return {
    dateKey,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
