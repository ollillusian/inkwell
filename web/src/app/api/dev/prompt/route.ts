import { NextResponse } from "next/server";
import { generatePromptWithLLM } from "@/lib/llm/generatePrompt";
import { pickPrompt, type TopicId } from "@/lib/promptEngine";
import type { WritingPreferences } from "@/lib/writingVoice";

/** Local-only: test LLM prompts without Supabase. Disabled in production. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const topics = (body.topics ?? ["free"]) as TopicId[];
  const label = body.label ?? "Before bed";
  const kind = body.kind === "once" ? "once" : "daily";
  const timeZone = body.timeZone ?? "UTC";
  const voice: WritingPreferences = {
    toneTags: body.toneTags ?? [],
    writingVoice: body.writingVoice ?? "",
  };

  const llm = await generatePromptWithLLM(topics, {
    nudgeLabel: label,
    nudgeKind: kind,
    topicHint: body.topicHint,
    scheduledAtLabel: label,
    timeZone,
    voice,
  });

  const fallbackSlot = label.toLowerCase().includes("bed")
    ? "evening"
    : "midday";
  const prompt =
    llm ??
    pickPrompt(
      topics,
      fallbackSlot as "morning" | "midday" | "evening",
      "dev-local-user",
      new Date()
    );

  return NextResponse.json({
    prompt,
    source: llm ? "llm" : "fallback",
    label,
  });
}
