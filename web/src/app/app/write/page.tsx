import { createClient } from "@/lib/supabase/server";
import { WriteEditor } from "@/components/WriteEditor";
import type { TopicId } from "@/lib/promptEngine";
import {
  currentOpenNudge,
  legacyScheduleFromProfile,
  nextUpcomingNudge,
  resolvedNudgesForDay,
} from "@/lib/nudges";
import { getDailyPrompt, profileVoice } from "@/lib/prompts/getDailyPrompt";

type Props = {
  searchParams: Promise<{ nudge?: string }>;
};

export default async function WritePage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const topics = (profile?.topics ?? []) as TopicId[];
  const timeZone = profile?.timezone || "UTC";
  const schedule = legacyScheduleFromProfile(profile ?? {});
  const fired = (profile?.nudges_fired ?? []) as string[];
  const now = new Date();
  const resolved = resolvedNudgesForDay(
    schedule,
    user.id,
    now,
    fired,
    timeZone
  );

  let target =
    resolved.find((n) => n.id === params.nudge) ??
    currentOpenNudge(resolved, timeZone, now) ??
    nextUpcomingNudge(resolved, timeZone, now) ??
    resolved[0];

  if (!target) {
    return <p className="text-ink-muted">No nudges configured.</p>;
  }

  const { prompt } = await getDailyPrompt(
    supabase,
    user.id,
    topics,
    target.id,
    {
      label: target.label,
      kind: target.kind,
      topicHint: target.topicHint,
      effectiveMinutes: target.effectiveMinutes,
      timeZone,
      voice: profileVoice(profile ?? {}),
    },
    now
  );

  return (
    <WriteEditor
      promptText={prompt}
      nudgeId={target.id}
      nudgeKind={target.kind}
      topicsSnapshot={topics}
    />
  );
}
