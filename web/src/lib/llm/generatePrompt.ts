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

const PROMPT_SHAPES = [
  "sensory snapshot: ask them to begin with one concrete thing they can see, hear, smell, or touch, then follow what it opens",
  "unsent message: invite a note to a person, place, past self, future self, or unnamed part of them",
  "list-making: ask for a short list with a specific constraint instead of one broad reflection",
  "scene work: ask them to write a small scene from today, memory, or imagination in present tense",
  "body-first: begin with a physical signal, posture, breath, or sensation before naming emotion",
  "choice point: ask about a small decision, tradeoff, refusal, or permission available right now",
  "object lens: use an ordinary object nearby as the doorway into the writing",
  "conversation: invite dialogue between two parts of them, without needing resolution",
  "time travel: connect this moment to a past version or future version of them",
  "counterfactual: ask a gentle 'what if' that explores another angle without forcing optimism",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
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
    diversityKey?: string;
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
  const shapeSeed = hashString(
    `${active.join(",")}:${context.nudgeLabel}:${context.scheduledAtLabel}:${context.diversityKey ?? nowLocal}`
  );
  const promptShape = PROMPT_SHAPES[shapeSeed % PROMPT_SHAPES.length];

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

Prompt shape to use this time: ${promptShape}.

Write one fresh, specific prompt that fits their voice. Vary the opening and avoid defaulting to "what are you feeling" or "what are you holding" unless the chosen shape truly needs it. No em dashes.`,
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
