import type { SupabaseClient } from "@supabase/supabase-js";
import { localDateKey } from "@/lib/datetime";
import { generatePromptWithLLM } from "@/lib/llm/generatePrompt";
import { formatMinutesLocal } from "@/lib/datetime";
import { pickPrompt, type TopicId } from "@/lib/promptEngine";
import type { NudgeKind } from "@/lib/nudges";
import { isOnDemandPromptId } from "@/lib/prompts/onDemandPrompt";
import { isHypothesisPromptId } from "@/lib/prompts/hypothesisPrompt";
import { composeHypothesisNudge } from "@/lib/hypotheses/composeNudge";
import { createPendingOutcome } from "@/lib/hypotheses/outcomeInstrument";
import type { WritingPreferences } from "@/lib/writingVoice";

export type DailyPromptResult = {
  prompt: string;
  deliveryDate: string;
  source: "llm" | "cache" | "fallback" | "hypothesis";
};

export type GetDailyPromptOptions = {
  /** Extra novelty for on-demand / surprise prompts. */
  highVariety?: boolean;
};

async function fetchRecentPromptTexts(
  supabase: SupabaseClient,
  userId: string,
  excludeSlot?: string
): Promise<string[]> {
  const { data } = await supabase
    .from("prompt_deliveries")
    .select("prompt_text, prompt_slot")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(16);

  return (data ?? [])
    .filter((row) => row.prompt_slot !== excludeSlot)
    .map((row) => row.prompt_text)
    .filter((text): text is string => Boolean(text?.trim()));
}

export async function getDailyPrompt(
  supabase: SupabaseClient,
  userId: string,
  topics: TopicId[],
  nudgeId: string,
  nudgeContext: {
    label: string;
    kind: NudgeKind;
    topicHint?: TopicId;
    effectiveMinutes: number;
    timeZone: string;
    voice: WritingPreferences;
  },
  date: Date = new Date(),
  options: GetDailyPromptOptions = {}
): Promise<DailyPromptResult> {
  const deliveryDate = localDateKey(date, nudgeContext.timeZone);
  const topicsForPrompt = nudgeContext.topicHint
    ? [...new Set([...topics, nudgeContext.topicHint])]
    : topics;

  const scheduledAtLabel = formatMinutesLocal(
    nudgeContext.effectiveMinutes,
    nudgeContext.timeZone,
    date
  );

  const { data: existing } = await supabase
    .from("prompt_deliveries")
    .select("prompt_text")
    .eq("user_id", userId)
    .eq("delivery_date", deliveryDate)
    .eq("prompt_slot", nudgeId)
    .maybeSingle();

  if (existing?.prompt_text) {
    return {
      prompt: existing.prompt_text,
      deliveryDate,
      source: "cache",
    };
  }

  // HYPOTHESIS-FIRST: every nudge tries to be informed by the engine's understanding of this user.
  // (The async loop also pre-generates into the `day` slot, served by the cache read above; this is
  // the live path for every other slot — on-demand, surprise, bedtime, etc.) Falls through to the
  // generic generator below when there's no usable hypothesis yet (cold start / sparse journal).
  const composed = await composeHypothesisNudge(userId, nudgeContext.voice);
  if (composed?.text) {
    await supabase.from("prompt_deliveries").upsert(
      { user_id: userId, delivery_date: deliveryDate, prompt_slot: nudgeId, prompt_text: composed.text },
      { onConflict: "user_id,delivery_date,prompt_slot" }
    );
    await createPendingOutcome(userId, composed.hypothesisId, nudgeId, deliveryDate);
    return { prompt: composed.text, deliveryDate, source: "hypothesis" };
  }

  const highVariety =
    options.highVariety ??
    (isOnDemandPromptId(nudgeId) ||
      isHypothesisPromptId(nudgeId) ||
      nudgeId === "surprise" ||
      nudgeContext.kind === "once");

  const recentPrompts = await fetchRecentPromptTexts(
    supabase,
    userId,
    nudgeId
  );

  const varietySeed = highVariety
    ? `${userId}:${nudgeId}:${deliveryDate}:${date.getTime()}:${Math.random().toString(36).slice(2, 10)}`
    : `${userId}:${nudgeId}:${deliveryDate}`;

  const llmPrompt = await generatePromptWithLLM(
    topicsForPrompt,
    {
      nudgeLabel: nudgeContext.label,
      nudgeKind: nudgeContext.kind,
      topicHint: nudgeContext.topicHint,
      scheduledAtLabel,
      timeZone: nudgeContext.timeZone,
      voice: nudgeContext.voice,
    },
    {
      varietySeed,
      highVariety,
      recentPrompts,
    }
  );

  const fallbackSlot =
    nudgeContext.label.toLowerCase().includes("bed") || nudgeId === "bedtime"
      ? "evening"
      : nudgeContext.topicHint === "travel"
        ? "morning"
        : "midday";

  const prompt =
    llmPrompt ??
    pickPrompt(
      topicsForPrompt,
      fallbackSlot as "morning" | "midday" | "evening",
      userId,
      date,
      varietySeed
    );
  const source: DailyPromptResult["source"] = llmPrompt ? "llm" : "fallback";

  await supabase.from("prompt_deliveries").upsert(
    {
      user_id: userId,
      delivery_date: deliveryDate,
      prompt_slot: nudgeId,
      prompt_text: prompt,
    },
    { onConflict: "user_id,delivery_date,prompt_slot" }
  );

  return { prompt, deliveryDate, source };
}

export function profileVoice(profile: {
  tone_tags?: string[] | null;
  writing_voice?: string | null;
}): WritingPreferences {
  return {
    toneTags: (profile.tone_tags ?? []) as WritingPreferences["toneTags"],
    writingVoice: profile.writing_voice ?? "",
  };
}
