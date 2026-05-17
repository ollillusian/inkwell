import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDailyPrompt, profileVoice } from "@/lib/prompts/getDailyPrompt";
import type { TopicId } from "@/lib/promptEngine";
import {
  currentOpenNudge,
  legacyScheduleFromProfile,
  nextUpcomingNudge,
  resolvedNudgesForDay,
} from "@/lib/nudges";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const nudgeParam = searchParams.get("nudge");

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

  const target =
    resolved.find((n) => n.id === nudgeParam) ??
    currentOpenNudge(resolved, timeZone, now) ??
    nextUpcomingNudge(resolved, timeZone, now) ??
    resolved[0];

  if (!target) {
    return NextResponse.json({ error: "No nudges configured" }, { status: 404 });
  }

  const result = await getDailyPrompt(
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

  return NextResponse.json({
    prompt: result.prompt,
    nudgeId: target.id,
    label: target.label,
    source: result.source,
  });
}
