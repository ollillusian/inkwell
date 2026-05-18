import OpenAI from "openai";
import { formatLocalTime } from "@/lib/datetime";
import { sanitizeStoryProse } from "@/lib/storyFormat";
import {
  buildVoiceBrief,
  type WritingPreferences,
} from "@/lib/writingVoice";

function openaiClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

export type StoryEntryInput = {
  id: string;
  prompt_slot: string;
  nudgeLabel: string;
  prompt_text: string;
  body: string;
  written_at: string;
};

export async function generateDayStoryWithLLM(
  dateKey: string,
  entries: StoryEntryInput[],
  voice: WritingPreferences,
  timeZone: string
): Promise<string | null> {
  const client = openaiClient();
  if (!client || entries.length === 0) return null;

  const blocks = entries
    .map((e, i) => {
      const time = formatLocalTime(new Date(e.written_at), timeZone);
      return `[${i + 1}] ${e.nudgeLabel} (${time})
Prompt they saw: ${e.prompt_text}
Their words:
${e.body.trim()}`;
    })
    .join("\n\n");

  const voiceBrief = buildVoiceBrief(voice);

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.75,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content: `You weave a user's same-day journal fragments into one cohesive literary short story (400 to 700 words).

Rules:
- Use ONLY facts, feelings, images, and events present in their entries. Do not invent major plot points, names, or backstory they did not write.
- You may add light connective tissue, transitions, and atmosphere, like a skilled editor shaping fragments into a single narrative arc for that calendar day.
- Match their writing voice and tone from onboarding.
- Write in third person or first person, whichever serves the material; stay consistent.
- Never assume the writer's gender. Do not use she, he, him, her, or gendered pronouns unless their entries explicitly state how they identify. Prefer they/them or rewrite without pronouns.
- Do not use em dashes. Use commas, periods, or semicolons instead.
- No meta commentary, no "here is your story", no mention of AI or journaling apps.
- Output ONLY the story prose.`,
        },
        {
          role: "user",
          content: `Date: ${dateKey}
${voiceBrief ? `\nVoice to honor:\n${voiceBrief}\n` : ""}
Journal fragments (chronological):

${blocks}

Write the short story.`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text || text.length < 80) return null;
    return sanitizeStoryProse(text);
  } catch (e) {
    console.error("[inkwell] day story generation failed:", e);
    return null;
  }
}
