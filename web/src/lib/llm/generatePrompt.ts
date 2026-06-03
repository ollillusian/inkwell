import OpenAI from "openai";
import { tuningParams } from "@/lib/llm/chatParams";
import { formatLocalNowForLLM } from "@/lib/datetime";
import { TOPICS, type TopicId } from "@/lib/promptEngine";
import type { NudgeKind } from "@/lib/nudges";
import { PLAIN_SPEECH_USER_REMINDER } from "@/lib/prompts/promptStyle";
import {
  formatRecentPromptsBlock,
  pickVarietyBundle,
  shuffleTopicsForPrompt,
} from "@/lib/prompts/promptVariety";
import {
  buildVoiceBrief,
  systemPromptForVoice,
  type WritingPreferences,
} from "@/lib/writingVoice";

function openaiClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key, baseURL: process.env.OPENAI_BASE_URL || undefined });
}

export type GeneratePromptOptions = {
  /** Stable per generation — drives lens, topic shuffle, and opening shape. */
  varietySeed: string;
  /** On-demand / surprise: push harder for novelty. */
  highVariety?: boolean;
  recentPrompts?: string[];
};

export async function generatePromptWithLLM(
  topics: TopicId[],
  context: {
    nudgeLabel: string;
    nudgeKind: NudgeKind;
    topicHint?: TopicId;
    effectiveMinutes?: number;
    scheduledAtLabel: string;
    timeZone: string;
    voice: WritingPreferences;
  },
  options: GeneratePromptOptions
): Promise<string | null> {
  const client = openaiClient();
  if (!client) return null;

  const active: TopicId[] = topics.length > 0 ? topics : ["free"];
  const shuffled = shuffleTopicsForPrompt(active, options.varietySeed);
  const themes = shuffled
    .map((id) => `${TOPICS[id].label} — ${TOPICS[id].description}`)
    .join("\n");

  const hint =
    context.topicHint && TOPICS[context.topicHint]
      ? `\nNudge focus: ${TOPICS[context.topicHint].label}`
      : "";

  const nowLocal = formatLocalNowForLLM(new Date(), context.timeZone);
  const voiceBrief = buildVoiceBrief(context.voice);
  const variety = pickVarietyBundle(options.varietySeed, active);
  const recentBlock = formatRecentPromptsBlock(options.recentPrompts ?? []);

  const kindNote =
    context.nudgeKind === "once"
      ? "One-time spontaneous nudge — must feel fresh and unscheduled, not like a daily habit prompt."
      : context.nudgeLabel.toLowerCase().includes("surprise")
        ? "Surprise nudge — unexpected moment in the day, not a routine check-in."
        : context.topicHint === "travel"
          ? "Travel — mid-day energy, not bedtime wind-down."
          : `Scheduled for around ${context.scheduledAtLabel} (user's local time).`;

  const highVariety = options.highVariety ?? false;

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  try {
    const response = await client.chat.completions.create({
      model,
      ...tuningParams(model, {
        maxTokens: 120,
        temperature: highVariety ? 0.92 : 0.78,
        topP: highVariety ? 0.9 : 0.85,
        frequencyPenalty: highVariety ? 0.5 : 0.35,
        presencePenalty: highVariety ? 0.35 : 0.2,
      }),
      messages: [
        { role: "system", content: systemPromptForVoice(context.voice) },
        {
          role: "user",
          content: `Right now for them: ${nowLocal}
Moment: ${context.nudgeLabel}
${kindNote}${hint}

Themes they chose (order is intentional — lead with the first if useful):
${themes}

${voiceBrief || "No specific voice set — keep prompts honest and inviting."}

Angle for this one:
- ${variety.lens}
- ${variety.openingShape}
- ${variety.focusLine}
${recentBlock ? `\n${recentBlock}` : ""}

${PLAIN_SPEECH_USER_REMINDER}

Write one nudge in their voice. Different from the recent ones.${
            highVariety
              ? " Keep it casual; don't start with What, How, Take a moment, or If your body could."
              : ""
          }`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text || text.length < 12) return null;
    return text.replace(/^["']|["']$/g, "");
  } catch (e) {
    console.error("[inkwell] LLM prompt generation failed:", e);
    return null;
  }
}
