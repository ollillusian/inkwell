import OpenAI from "openai";
import { formatLocalNowForLLM } from "@/lib/datetime";
import { TOPICS, type TopicId } from "@/lib/promptEngine";
import type { NudgeKind } from "@/lib/nudges";
import {
  buildVoiceBrief,
  systemPromptForVoice,
  type WritingPreferences,
} from "@/lib/writingVoice";

function openaiClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function normalizeGeneratedPrompt(text: string): string {
  return text
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/([.!?])\s+([A-Z])/g, (_match, mark: string, next: string) => {
      const joiner = mark === "?" ? ";" : ",";
      const normalizedNext = next === "I" ? next : next.toLowerCase();
      return `${joiner} ${normalizedNext}`;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export async function generatePromptWithLLM(
  topics: TopicId[],
  context: {
    nudgeLabel: string;
    nudgeKind: NudgeKind;
    topicHint?: TopicId;
    scheduledAtLabel: string;
    timeZone: string;
    voice: WritingPreferences;
  }
): Promise<string | null> {
  const client = openaiClient();
  if (!client) return null;

  const active: TopicId[] = topics.length > 0 ? topics : ["free"];
  const themes = active
    .map((id) => `${TOPICS[id].label}: ${TOPICS[id].description}`)
    .join("\n");

  const hint =
    context.topicHint && TOPICS[context.topicHint]
      ? `\nNudge focus: ${TOPICS[context.topicHint].label}`
      : "";

  const nowLocal = formatLocalNowForLLM(new Date(), context.timeZone);
  const voiceBrief = buildVoiceBrief(context.voice);

  const kindNote =
    context.nudgeKind === "once"
      ? "One-time nudge, singular and not a daily habit."
      : context.topicHint === "travel"
        ? "Travel, midday energy and not bedtime wind-down."
        : `Scheduled for around ${context.scheduledAtLabel} (user's local time).`;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.9,
      max_tokens: 160,
      messages: [
        { role: "system", content: systemPromptForVoice(context.voice) },
        {
          role: "user",
          content: `Right now for them: ${nowLocal}
Moment: ${context.nudgeLabel}
${kindNote}${hint}

Themes they chose in onboarding:
${themes}

${voiceBrief || "No specific voice set, keep prompts honest and inviting."}

Write one single-sentence prompt that fits their voice, with no em dashes.`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text || text.length < 12) return null;
    return normalizeGeneratedPrompt(text);
  } catch (e) {
    console.error("[inkwell] LLM prompt generation failed:", e);
    return null;
  }
}
