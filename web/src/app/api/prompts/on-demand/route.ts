import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TopicId } from "@/lib/promptEngine";
import { getDailyPrompt, profileVoice } from "@/lib/prompts/getDailyPrompt";
import {
  formatOnDemandPromptLabel,
  newOnDemandPromptId,
  onDemandPromptContext,
} from "@/lib/prompts/onDemandPrompt";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const topics = (profile?.topics ?? []) as TopicId[];
  const timeZone = profile?.timezone || "UTC";
  const now = new Date();
  const nudgeId = newOnDemandPromptId();
  const label =
    formatOnDemandPromptLabel(nudgeId) ?? "Fresh prompt";
  const result = await getDailyPrompt(
    supabase,
    user.id,
    topics,
    nudgeId,
    onDemandPromptContext(
      timeZone,
      profileVoice(profile ?? {}),
      now,
      nudgeId
    ),
    now,
    { highVariety: true }
  );

  return NextResponse.json({
    prompt: result.prompt,
    nudgeId,
    label,
    source: result.source,
    createdAt: now.toISOString(),
  });
}
