import { localDateKey, localMinutesSinceMidnight } from "@/lib/datetime";
import type { TopicId } from "@/lib/promptEngine";

export type NudgeKind = "daily" | "once";

export type Nudge = {
  id: string;
  label: string;
  time: string;
  enabled: boolean;
  kind: NudgeKind;
  topicHint?: TopicId;
};

export type NudgeScheduleConfig = {
  nudges: Nudge[];
  spontaneous: boolean;
  jitterMinutes: number;
  surpriseNudge: {
    enabled: boolean;
    windowStart: string;
    windowEnd: string;
  };
};

export const DEFAULT_NUDGE_SCHEDULE: NudgeScheduleConfig = {
  nudges: [
    {
      id: "travel",
      label: "Travel",
      time: "10:30",
      enabled: false,
      kind: "daily",
      topicHint: "travel",
    },
    {
      id: "day",
      label: "Somewhere in your day",
      time: "14:00",
      enabled: true,
      kind: "daily",
    },
    {
      id: "bedtime",
      label: "Before bed",
      time: "21:30",
      enabled: true,
      kind: "daily",
    },
  ],
  spontaneous: true,
  jitterMinutes: 45,
  surpriseNudge: {
    enabled: true,
    windowStart: "11:00",
    windowEnd: "17:00",
  },
};

export function parseTime(t: string): { h: number; m: number } {
  const [h, m] = t.split(":").map(Number);
  return { h: h ?? 12, m: m ?? 0 };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Stable per-user per-day jitter so nudges feel spontaneous but repeatable if you reload. */
export function effectiveFireMinutes(
  nudge: Nudge,
  userId: string,
  date: Date,
  config: NudgeScheduleConfig,
  timeZone: string
): number {
  const { h, m } = parseTime(nudge.time);
  let total = h * 60 + m;

  if (config.spontaneous && nudge.kind === "daily") {
    const jitter = config.jitterMinutes;
    const seed = hashString(
      `${userId}:${localDateKey(date, timeZone)}:${nudge.id}:jitter`
    );
    const offset = (seed % (jitter * 2 + 1)) - jitter;
    total += offset;
  }

  return ((total % (24 * 60)) + 24 * 60) % (24 * 60);
}

export function surpriseNudgeForDay(
  userId: string,
  date: Date,
  config: NudgeScheduleConfig,
  timeZone: string
): { id: string; label: string; minutes: number } | null {
  if (!config.surpriseNudge.enabled) return null;

  const start = parseTime(config.surpriseNudge.windowStart);
  const end = parseTime(config.surpriseNudge.windowEnd);
  const startM = start.h * 60 + start.m;
  const endM = end.h * 60 + end.m;
  if (endM <= startM) return null;

  const seed = hashString(`${userId}:${localDateKey(date, timeZone)}:surprise`);
  const minutes = startM + (seed % (endM - startM));
  return {
    id: "surprise",
    label: "A spontaneous moment",
    minutes,
  };
}

function normalizeNudges(nudges: Nudge[]): Nudge[] {
  return nudges.map((n) => {
    if (n.id === "travel-once" || n.topicHint === "travel") {
      return {
        ...n,
        id: "travel",
        label: n.label.includes("one-time") ? "Travel" : n.label,
        kind: "daily" as const,
        topicHint: "travel" as const,
      };
    }
    return n;
  });
}

export function parseNudgeSchedule(raw: unknown): NudgeScheduleConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_NUDGE_SCHEDULE;
  const o = raw as Partial<NudgeScheduleConfig>;
  const nudges = Array.isArray(o.nudges)
    ? normalizeNudges(o.nudges)
    : DEFAULT_NUDGE_SCHEDULE.nudges;
  return {
    nudges,
    spontaneous: o.spontaneous ?? true,
    jitterMinutes: o.jitterMinutes ?? 45,
    surpriseNudge: {
      ...DEFAULT_NUDGE_SCHEDULE.surpriseNudge,
      ...(o.surpriseNudge ?? {}),
    },
  };
}

export function legacyScheduleFromProfile(profile: {
  morning_time?: string;
  midday_time?: string;
  evening_time?: string;
  nudge_schedule?: unknown;
}): NudgeScheduleConfig {
  if (profile.nudge_schedule) return parseNudgeSchedule(profile.nudge_schedule);
  const evening = String(profile.evening_time ?? "21:30").slice(0, 5);
  const midday = String(profile.midday_time ?? "14:00").slice(0, 5);
  return {
    ...DEFAULT_NUDGE_SCHEDULE,
    nudges: [
      {
        id: "bedtime",
        label: "Before bed",
        time: evening,
        enabled: true,
        kind: "daily",
      },
      {
        id: "day",
        label: "Afternoon pause",
        time: midday,
        enabled: true,
        kind: "daily",
      },
      ...DEFAULT_NUDGE_SCHEDULE.nudges.filter((n) => n.kind === "once"),
    ],
  };
}

export type ResolvedNudge = {
  id: string;
  label: string;
  kind: NudgeKind;
  topicHint?: TopicId;
  baseTime: string;
  effectiveMinutes: number;
};

export function resolvedNudgesForDay(
  config: NudgeScheduleConfig,
  userId: string,
  date: Date,
  nudgesFired: string[],
  timeZone: string
): ResolvedNudge[] {
  const list: ResolvedNudge[] = config.nudges
    .filter((n) => n.enabled)
    .filter((n) => n.kind === "daily" || !nudgesFired.includes(n.id))
    .map((n) => ({
      id: n.id,
      label: n.label,
      kind: n.kind,
      topicHint: n.topicHint,
      baseTime: n.time,
      effectiveMinutes: effectiveFireMinutes(n, userId, date, config, timeZone),
    }));

  const surprise = surpriseNudgeForDay(userId, date, config, timeZone);
  if (surprise && !nudgesFired.includes("surprise")) {
    list.push({
      id: surprise.id,
      label: surprise.label,
      kind: "once",
      baseTime: config.surpriseNudge.windowStart,
      effectiveMinutes: surprise.minutes,
    });
  }

  return list.sort((a, b) => a.effectiveMinutes - b.effectiveMinutes);
}

/** Nudge whose window is open now (within 90 min after fire time, before next nudge). */
export function currentOpenNudge(
  resolved: ResolvedNudge[],
  timeZone: string,
  now: Date = new Date()
): ResolvedNudge | null {
  const nowM = localMinutesSinceMidnight(now, timeZone);
  let best: ResolvedNudge | null = null;

  for (const n of resolved) {
    if (n.effectiveMinutes <= nowM && nowM - n.effectiveMinutes <= 120) {
      best = n;
    }
  }
  return best;
}

export function nextUpcomingNudge(
  resolved: ResolvedNudge[],
  timeZone: string,
  now: Date = new Date()
): ResolvedNudge | null {
  const nowM = localMinutesSinceMidnight(now, timeZone);
  return resolved.find((n) => n.effectiveMinutes > nowM) ?? null;
}

/** Most recent nudge whose fire time has already passed today. */
export function lastPassedNudge(
  resolved: ResolvedNudge[],
  timeZone: string,
  now: Date = new Date()
): ResolvedNudge | null {
  const nowM = localMinutesSinceMidnight(now, timeZone);
  const passed = resolved.filter((n) => n.effectiveMinutes <= nowM);
  return passed.at(-1) ?? null;
}

export type NudgeTimingState = "open" | "upcoming" | "passed";

export function nudgeTimingState(
  nudge: ResolvedNudge,
  timeZone: string,
  now: Date = new Date()
): NudgeTimingState {
  const nowM = localMinutesSinceMidnight(now, timeZone);
  if (nudge.effectiveMinutes > nowM) return "upcoming";
  if (nowM - nudge.effectiveMinutes <= 120) return "open";
  return "passed";
}

export function newNudgeId(): string {
  return `nudge-${Date.now().toString(36)}`;
}
