import OpenAI from "openai";
import { tuningParams } from "@/lib/llm/chatParams";
import type { ThemeTimelineGranularity } from "@/lib/themeTimeline";

function openaiClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key, baseURL: process.env.OPENAI_BASE_URL || undefined });
}

export type TimelineFrameInsightInput = {
  granularity: ThemeTimelineGranularity;
  periodLabel: string;
  ruleCaption: string;
  entryCount: number;
  stats: { topics: number; links: number; phrases: number };
  changeSummary: string;
  excerpts: string[];
};

export type DirectorsCutInput = {
  granularity: ThemeTimelineGranularity;
  rangeLabel: string;
  frameSummaries: string[];
  eraTitles: string[];
};

const RULES = `Rules:
- Write in second person ("you") or neutral literary present; warm, concise, observational.
- Use ONLY themes and patterns implied by the data. Do not invent life events.
- No em dashes. No mention of AI, apps, or graphs.
- Output ONLY the requested prose, no title line.`;

export async function generateFrameInsightWithLLM(
  input: TimelineFrameInsightInput
): Promise<string | null> {
  const client = openaiClient();
  if (!client) return null;

  const excerptBlock =
    input.excerpts.length > 0
      ? `\nSample lines from entries:\n${input.excerpts.map((e) => `— ${e}`).join("\n")}`
      : "";

  try {
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const response = await client.chat.completions.create({
      model,
      ...tuningParams(model, { maxTokens: 120, temperature: 0.65 }),
      messages: [
        {
          role: "system",
          content: `You narrate one moment in a personal journal theme timeline (${input.granularity} grain). One or two sentences max, like a documentary voiceover.

${RULES}`,
        },
        {
          role: "user",
          content: `Period: ${input.periodLabel}
Draft line: ${input.ruleCaption}
Entries: ${input.entryCount} · Themes: ${input.stats.topics} · Links: ${input.stats.links}
Changes: ${input.changeSummary}${excerptBlock}

Rewrite as a vivid narrator line (max 35 words).`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    return text && text.length > 12 ? text : null;
  } catch (e) {
    console.error("[inkwell] frame insight failed:", e);
    return null;
  }
}

export async function generateDirectorsCutWithLLM(
  input: DirectorsCutInput
): Promise<string | null> {
  const client = openaiClient();
  if (!client) return null;

  try {
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const response = await client.chat.completions.create({
      model,
      ...tuningParams(model, { maxTokens: 280, temperature: 0.7 }),
      messages: [
        {
          role: "system",
          content: `You write a short "director's cut" recap (3–5 sentences) of how someone's journal themes evolved across a timeline.

${RULES}`,
        },
        {
          role: "user",
          content: `Range: ${input.rangeLabel} (${input.granularity})
Chapters detected: ${input.eraTitles.join(" → ") || "single movement"}

Frame-by-frame:
${input.frameSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Write the director's cut.`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    return text && text.length > 40 ? text : null;
  } catch (e) {
    console.error("[inkwell] director's cut failed:", e);
    return null;
  }
}
