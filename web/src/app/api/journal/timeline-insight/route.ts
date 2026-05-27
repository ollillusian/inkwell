import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateDirectorsCutWithLLM,
  generateFrameInsightWithLLM,
  type DirectorsCutInput,
  type TimelineFrameInsightInput,
} from "@/lib/llm/generateTimelineInsight";

type Body =
  | { kind: "frame"; input: TimelineFrameInsightInput; cacheKey: string }
  | { kind: "directors_cut"; input: DirectorsCutInput; cacheKey: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.cacheKey || body.cacheKey.length > 200) {
    return NextResponse.json({ error: "Invalid cacheKey" }, { status: 400 });
  }

  const { data: cached, error: cacheReadError } = await supabase
    .from("timeline_insights")
    .select("body")
    .eq("user_id", user.id)
    .eq("cache_key", body.cacheKey)
    .maybeSingle();

  if (!cacheReadError && cached?.body) {
    return NextResponse.json({ insight: cached.body, cached: true });
  }

  const insight =
    body.kind === "frame"
      ? await generateFrameInsightWithLLM(body.input)
      : await generateDirectorsCutWithLLM(body.input);

  if (!insight) {
    return NextResponse.json(
      { error: "Could not generate insight. Check OPENAI_API_KEY." },
      { status: 503 }
    );
  }

  const { error } = await supabase.from("timeline_insights").upsert(
    {
      user_id: user.id,
      cache_key: body.cacheKey,
      kind: body.kind,
      body: insight,
    },
    { onConflict: "user_id,cache_key" }
  );

  if (error) {
    console.warn("[inkwell] timeline_insights cache:", error.message);
    return NextResponse.json({ insight, cached: false });
  }

  return NextResponse.json({ insight, cached: false });
}
