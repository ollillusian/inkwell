import OpenAI from "openai";
import { formatLocalTime } from "@/lib/datetime";
import { sanitizeStoryProse } from "@/lib/storyFormat";
import type { JournalPeriodType } from "@/lib/journalPeriod";
import {
  buildVoiceBrief,
  type WritingPreferences,
} from "@/lib/writingVoice";
import type { StoryEntryInput } from "@/lib/llm/generateDayStory";

function openaiClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function periodInstructions(period: JournalPeriodType): {
  words: string;
  scope: string;
} {
  switch (period) {
    case "week":
      return {
        words: "700 to 1100 words",
        scope:
          "Weave the week's journal fragments into one cohesive literary short story with a gentle arc across the days. You may echo how themes return or shift through the week.",
      };
    case "month":
      return {
        words: "900 to 1400 words",
        scope:
          "Weave the month's journal fragments into one cohesive literary short story that captures recurring threads, turning points, and the emotional shape of the month. Prefer thematic flow over a day-by-day list.",
      };
    default:
      return {
        words: "400 to 700 words",
        scope:
          "Weave the day's journal fragments into one cohesive literary short story for that calendar day.",
      };
  }
}

const STORY_RULES = `Rules:
- Use ONLY facts, feelings, images, and events present in their entries. Do not invent major plot points, names, or backstory they did not write.
- You may add light connective tissue, transitions, and atmosphere, like a skilled editor shaping fragments into a single narrative.
- Match their writing voice and tone from onboarding.
- Write in third person or first person, whichever serves the material; stay consistent.
- Never assume the writer's gender. Do not use she, he, him, her, or gendered pronouns unless their entries explicitly state how they identify. Prefer they/them or rewrite without pronouns.
- Do not use em dashes. Use commas, periods, or semicolons instead.
- No meta commentary, no "here is your story", no mention of AI or journaling apps.
- Output ONLY the story prose.`;

export async function generatePeriodStoryWithLLM(
  period: JournalPeriodType,
  periodLabel: string,
  entries: StoryEntryInput[],
  voice: WritingPreferences,
  timeZone: string
): Promise<string | null> {
  const client = openaiClient();
  if (!client || entries.length === 0) return null;

  const { words, scope } = periodInstructions(period);

  const blocks = entries
    .map((e, i) => {
      const time = formatLocalTime(new Date(e.written_at), timeZone);
      const day = e.dayKey ? ` · ${e.dayKey}` : "";
      return `[${i + 1}] ${e.nudgeLabel} (${time}${day})
Prompt they saw: ${e.prompt_text}
Their words:
${e.body.trim()}`;
    })
    .join("\n\n");

  const voiceBrief = buildVoiceBrief(voice);
  const maxTokens = period === "month" ? 2200 : period === "week" ? 1800 : 1200;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.75,
      max_tokens: maxTokens,
      messages: [
        {
          role: "system",
          content: `You weave a user's journal fragments into one cohesive literary short story (${words}).

${scope}

${STORY_RULES}`,
        },
        {
          role: "user",
          content: `Period: ${periodLabel}
${voiceBrief ? `\nVoice to honor:\n${voiceBrief}\n` : ""}
Journal fragments (chronological):

${blocks}

Write the short story.`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    const minLen = period === "month" ? 120 : period === "week" ? 100 : 80;
    if (!text || text.length < minLen) return null;
    return sanitizeStoryProse(text);
  } catch (e) {
    console.error("[inkwell] period story generation failed:", e);
    return null;
  }
}
