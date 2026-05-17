import type { SupabaseClient } from "@supabase/supabase-js";
import { localDateKey } from "@/lib/datetime";
import { generatePromptWithLLM } from "@/lib/llm/generatePrompt";
import { formatMinutesLocal } from "@/lib/datetime";
import { pickPrompt, type TopicId } from "@/lib/promptEngine";
import type { NudgeKind } from "@/lib/nudges";
import type { WritingPreferences } from "@/lib/writingVoice";

export type DailyPromptResult = {
  prompt: string;
  source: "llm" | "cache" | "fallback";
};

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
  date: Date = new Date()
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
    return { prompt: existing.prompt_text, source: "cache" };
  }

  const llmPrompt = await generatePromptWithLLM(topicsForPrompt, {
    nudgeLabel: nudgeContext.label,
    nudgeKind: nudgeContext.kind,
    topicHint: nudgeContext.topicHint,
    scheduledAtLabel,
    timeZone: nudgeContext.timeZone,
    voice: nudgeContext.voice,
  });

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
      date
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

  return { prompt, source };
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
