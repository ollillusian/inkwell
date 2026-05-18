import {
  effectiveFireMinutes,
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
  if (profile.spontaneous_nudges !== undefined) {
    base.spontaneous = profile.spontaneous_nudges;
  }
  if (profile.spontaneous_jitter_minutes !== undefined) {
    base.jitterMinutes = profile.spontaneous_jitter_minutes;
  }
  if (profile.surprise_nudge_enabled !== undefined) {
    base.surpriseNudge.enabled = profile.surprise_nudge_enabled;
  }
  if (profile.nudge_schedule) {
    return parseNudgeSchedule(profile.nudge_schedule);
  }
  return base;
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

  const tick = () => {
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const nowM = now.getHours() * 60 + now.getMinutes();

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
        if (Notification.permission === "granted") {
          new Notification("Inkwell", {
            body: `${n.label}: a prompt is waiting. Your words, your voice.`,
            tag: id,
          });
        }
      }
    }
  };

  const interval = window.setInterval(tick, 30_000);
  tick();
  return () => window.clearInterval(interval);
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export { effectiveFireMinutes, surpriseNudgeForDay };
