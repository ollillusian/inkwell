import { localDateKey, localMinutesSinceMidnight } from "@/lib/datetime";
import {
  legacyScheduleFromProfile,
  parseNudgeSchedule,
  resolvedNudgesForDay,
  surpriseNudgeForDay,
  type NudgeScheduleConfig,
} from "@/lib/nudges";

export type NudgeFirePayload = {
  nudgeId: string;
  label: string;
};

export function parseTime(t: string): { h: number; m: number } {
  const [h, m] = t.split(":").map(Number);
  return { h: h ?? 12, m: m ?? 0 };
}

export function scheduleConfigFromProfile(profile: {
  nudge_schedule?: unknown;
  morning_time?: string;
  midday_time?: string;
  evening_time?: string;
  spontaneous_nudges?: boolean;
  spontaneous_jitter_minutes?: number;
  surprise_nudge_enabled?: boolean;
}): NudgeScheduleConfig {
  const base = legacyScheduleFromProfile(profile);
  if (profile.nudge_schedule) {
    return parseNudgeSchedule(profile.nudge_schedule);
  }
  if (profile.spontaneous_nudges !== undefined) {
    base.spontaneous = profile.spontaneous_nudges;
  }
  if (profile.spontaneous_jitter_minutes !== undefined) {
    base.jitterMinutes = profile.spontaneous_jitter_minutes;
  }
  if (profile.surprise_nudge_enabled !== undefined) {
    base.surpriseNudge.enabled = profile.surprise_nudge_enabled;
  }
  return base;
}

async function showNudgeNotification(
  tag: string,
  label: string,
  nudgeId: string
): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  let body = `${label}: your prompt is ready.`;
  try {
    const res = await fetch(
      `/api/prompts/today?nudge=${encodeURIComponent(nudgeId)}`
    );
    if (res.ok) {
      const data = (await res.json()) as { prompt?: string };
      if (data.prompt) {
        body = data.prompt.length > 180 ? `${data.prompt.slice(0, 177)}…` : data.prompt;
      }
    }
  } catch {
    /* keep default body */
  }

  const options: NotificationOptions = {
    body,
    tag,
    icon: "/icons/icon-192.png",
    data: { url: `/app/write?nudge=${encodeURIComponent(nudgeId)}` },
  };

  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification("Inkwell", options);
  } catch {
    new Notification("Inkwell", options);
  }
}

export function scheduleLocalReminders(
  userId: string,
  config: NudgeScheduleConfig,
  nudgesFired: string[],
  timeZone: string,
  onFire: (payload: NudgeFirePayload) => void
): () => void {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return () => {};
  }

  const fired = new Set<string>();

  const tick = async () => {
    const now = new Date();
    const dayKey = localDateKey(now, timeZone);
    const nowM = localMinutesSinceMidnight(now, timeZone);

    const resolved = resolvedNudgesForDay(
      config,
      userId,
      now,
      nudgesFired,
      timeZone
    );

    for (const n of resolved) {
      const id = `${dayKey}:${n.id}`;
      if (nowM === n.effectiveMinutes && !fired.has(id)) {
        fired.add(id);
        onFire({ nudgeId: n.id, label: n.label });
        await showNudgeNotification(id, n.label, n.id);
      }
    }
  };

  const interval = window.setInterval(() => {
    void tick();
  }, 30_000);
  void tick();
  return () => window.clearInterval(interval);
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export { effectiveFireMinutes, surpriseNudgeForDay } from "@/lib/nudges";
