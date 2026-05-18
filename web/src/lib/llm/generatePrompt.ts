import OpenAI from "openai";
import { formatLocalNowForLLM } from "@/lib/datetime";
import { TOPICS, type TopicId } from "@/lib/promptEngine";
import type { NudgeKind } from "@/lib/nudges";
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
  return new OpenAI({ apiKey: key });
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

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: highVariety ? 1 : 0.88,
      top_p: highVariety ? 0.92 : 0.9,
      frequency_penalty: highVariety ? 0.55 : 0.25,
      presence_penalty: highVariety ? 0.4 : 0.15,
      max_tokens: 120,
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

Variety directive (follow closely):
- Creative lens: ${variety.lens}
- ${variety.openingShape}
- ${variety.focusLine}
${recentBlock ? `\n${recentBlock}` : ""}

Write one prompt in their voice. It must feel distinct from the recent prompts above.${
            highVariety
              ? " Vary sentence length and rhythm; avoid starting with What, How, or Take a moment."
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
