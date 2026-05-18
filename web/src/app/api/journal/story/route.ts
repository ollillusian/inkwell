import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { entriesForLocalDate, publishedEntries } from "@/lib/journal";
import { generateDayStoryWithLLM } from "@/lib/llm/generateDayStory";
import { legacyScheduleFromProfile } from "@/lib/nudges";
import { profileVoice } from "@/lib/prompts/getDailyPrompt";
import type { Entry } from "@/types/database";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let dateKey: string;
  try {
    const body = (await request.json()) as { date?: string };
    dateKey = body.date ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const timeZone = profile?.timezone || "UTC";
  const schedule = legacyScheduleFromProfile(profile ?? {});
  const labelById = Object.fromEntries(
    schedule.nudges.map((n) => [n.id, n.label])
  );

  const { data: allEntries } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", user.id)
    .order("written_at", { ascending: true });

  const dayEntries = entriesForLocalDate(
    publishedEntries((allEntries ?? []) as Entry[]),
    dateKey,
    timeZone
  );

  if (dayEntries.length === 0) {
    return NextResponse.json(
      { error: "No entries for this day" },
      { status: 400 }
    );
  }

  const story = await generateDayStoryWithLLM(
    dateKey,
    dayEntries.map((e) => ({
      id: e.id,
      prompt_slot: e.prompt_slot,
      nudgeLabel: labelById[e.prompt_slot] ?? e.prompt_slot,
      prompt_text: e.prompt_text,
      body: e.body,
      written_at: e.written_at,
    })),
    profileVoice(profile ?? {}),
    timeZone
  );

  if (!story) {
    return NextResponse.json(
      { error: "Could not generate story. Check OPENAI_API_KEY." },
      { status: 503 }
    );
  }

  const entryIds = dayEntries.map((e) => e.id);

  const { data: saved, error } = await supabase
    .from("day_stories")
    .upsert(
      {
        user_id: user.id,
        story_date: dateKey,
        body: story,
        entry_ids: entryIds,
      },
      { onConflict: "user_id,story_date" }
    )
    .select()
    .single();

  if (error) {
    console.error("[inkwell] save day story:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ story: saved });
}
