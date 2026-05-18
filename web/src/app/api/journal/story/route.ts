import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  formatMonthLabel,
  formatWeekRange,
} from "@/lib/datetime";
import { entriesForLocalDate, publishedEntries } from "@/lib/journal";
import {
  entriesForLocalMonth,
  entriesForLocalWeek,
  normalizeMonthKey,
  normalizeWeekStartKey,
  type JournalPeriodType,
  weekStartFromDateKey,
} from "@/lib/journalPeriod";
import {
  generateDayStoryWithLLM,
  storyEntriesFromRows,
} from "@/lib/llm/generateDayStory";
import { generatePeriodStoryWithLLM } from "@/lib/llm/generatePeriodStory";
import { legacyScheduleFromProfile } from "@/lib/nudges";
import { profileVoice } from "@/lib/prompts/getDailyPrompt";
import type { Entry } from "@/types/database";

type StoryBody = {
  date?: string;
  period?: JournalPeriodType;
  key?: string;
};

function parseRequest(body: StoryBody): {
  period: JournalPeriodType;
  key: string;
} | null {
  const period = body.period ?? "day";
  const key = body.key ?? body.date ?? "";
  if (period === "day") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    return { period: "day", key };
  }
  if (period === "week") {
    const week = normalizeWeekStartKey(key);
    if (!week) return null;
    return { period: "week", key: week };
  }
  if (period === "month") {
    const month = normalizeMonthKey(key);
    if (!month) return null;
    return { period: "month", key: month };
  }
  return null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: StoryBody;
  try {
    body = (await request.json()) as StoryBody;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = parseRequest(body);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Invalid period/key. Use date YYYY-MM-DD, week start YYYY-MM-DD, or month YYYY-MM.",
      },
      { status: 400 }
    );
  }

  const { period, key } = parsed;

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

  const published = publishedEntries((allEntries ?? []) as Entry[]);

  let periodEntries: Entry[];
  let periodLabel: string;

  if (period === "day") {
    periodEntries = entriesForLocalDate(published, key, timeZone);
    periodLabel = key;
  } else if (period === "week") {
    const weekStart = weekStartFromDateKey(key, timeZone);
    periodEntries = entriesForLocalWeek(published, weekStart, timeZone);
    periodLabel = formatWeekRange(weekStart, timeZone);
  } else {
    periodEntries = entriesForLocalMonth(published, key, timeZone);
    periodLabel = formatMonthLabel(key, timeZone);
  }

  if (periodEntries.length === 0) {
    return NextResponse.json(
      { error: "No entries for this period" },
      { status: 400 }
    );
  }

  const storyInputs = storyEntriesFromRows(
    periodEntries,
    labelById,
    timeZone
  );

  const story =
    period === "day"
      ? await generateDayStoryWithLLM(key, storyInputs, profileVoice(profile ?? {}), timeZone)
      : await generatePeriodStoryWithLLM(
          period,
          periodLabel,
          storyInputs,
          profileVoice(profile ?? {}),
          timeZone
        );

  if (!story) {
    return NextResponse.json(
      { error: "Could not generate story. Check OPENAI_API_KEY." },
      { status: 503 }
    );
  }

  const entryIds = periodEntries.map((e) => e.id);

  if (period === "day") {
    const { data: saved, error } = await supabase
      .from("day_stories")
      .upsert(
        {
          user_id: user.id,
          story_date: key,
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

    return NextResponse.json({ story: saved, period, key });
  }

  const { data: saved, error } = await supabase
    .from("period_stories")
    .upsert(
      {
        user_id: user.id,
        period_type: period,
        period_key: period === "week" ? weekStartFromDateKey(key, timeZone) : key,
        body: story,
        entry_ids: entryIds,
      },
      { onConflict: "user_id,period_type,period_key" }
    )
    .select()
    .single();

  if (error) {
    console.error("[inkwell] save period story:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
    }

  return NextResponse.json({ story: saved, period, key });
}
