import { localDateKey, localMinutesSinceMidnight } from "@/lib/datetime";
import { getDailyPrompt, profileVoice } from "@/lib/prompts/getDailyPrompt";
import type { TopicId } from "@/lib/promptEngine";
import { resolvedNudgesForDay, type ResolvedNudge } from "@/lib/nudges";
import { scheduleConfigFromProfile } from "@/lib/notifications";
import { sendWebPush, type PushSubscriptionRow } from "@/lib/push/send";
import { pushConfigured } from "@/lib/push/vapid";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/types/database";

export type NudgeDue = {
  userId: string;
  profile: Profile;
  nudge: ResolvedNudge;
  dateKey: string;
};

/** Users with a nudge firing this exact local minute. */
export async function findDueNudges(now = new Date()): Promise<NudgeDue[]> {
  if (!pushConfigured()) return [];

  const admin = createAdminClient();
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("user_id");

  if (error || !subs?.length) return [];

  const userIds = [...new Set(subs.map((s) => s.user_id as string))];
  const due: NudgeDue[] = [];

  for (const userId of userIds) {
    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!profile?.notifications_enabled) continue;

    const timeZone = profile.timezone || "UTC";
    const nowM = localMinutesSinceMidnight(now, timeZone);
    const dateKey = localDateKey(now, timeZone);
    const config = scheduleConfigFromProfile(profile);
    const fired = (profile.nudges_fired ?? []) as string[];

    const resolved = resolvedNudgesForDay(
      config,
      userId,
      now,
      fired,
      timeZone
    );

    for (const nudge of resolved) {
      if (nudge.effectiveMinutes !== nowM) continue;

      const { data: existing } = await admin
        .from("nudge_push_log")
        .select("nudge_id")
        .eq("user_id", userId)
        .eq("date_key", dateKey)
        .eq("nudge_id", nudge.id)
        .maybeSingle();

      if (existing) continue;

      due.push({
        userId,
        profile: profile as Profile,
        nudge,
        dateKey,
      });
    }
  }

  return due;
}

export async function dispatchDueNudge(item: NudgeDue): Promise<boolean> {
  const admin = createAdminClient();
  const topics = (item.profile.topics ?? []) as TopicId[];
  const timeZone = item.profile.timezone || "UTC";
  const now = new Date();

  const { prompt } = await getDailyPrompt(
    admin,
    item.userId,
    topics,
    item.nudge.id,
    {
      label: item.nudge.label,
      kind: item.nudge.kind,
      topicHint: item.nudge.topicHint,
      effectiveMinutes: item.nudge.effectiveMinutes,
      timeZone,
      voice: profileVoice(item.profile),
    },
    now
  );

  const body =
    prompt.length > 140 ? `${prompt.slice(0, 137)}…` : prompt;
  const url = `/app/write?nudge=${encodeURIComponent(item.nudge.id)}`;

  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", item.userId);

  const rows = (subscriptions ?? []) as PushSubscriptionRow[];
  let sent = 0;

  for (const sub of rows) {
    try {
      await sendWebPush(sub, {
        title: `Inkwell — ${item.nudge.label}`,
        body,
        url,
      });
      sent++;
    } catch (e) {
      console.warn("[inkwell] push failed:", e);
      if (
        e &&
        typeof e === "object" &&
        "statusCode" in e &&
        (e as { statusCode: number }).statusCode === 410
      ) {
        await admin
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", sub.endpoint);
      }
    }
  }

  if (sent === 0) return false;

  await admin.from("nudge_push_log").upsert({
    user_id: item.userId,
    date_key: item.dateKey,
    nudge_id: item.nudge.id,
  });

  return true;
}

export async function dispatchAllDueNudges(now = new Date()) {
  const due = await findDueNudges(now);
  let ok = 0;
  for (const item of due) {
    if (await dispatchDueNudge(item)) ok++;
  }
  return { checked: due.length, sent: ok };
}
