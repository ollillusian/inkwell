import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { publishedEntries } from "@/lib/journal";
import { buildThemeTimeline } from "@/lib/themeTimeline";
import { buildThemeWritingDigest } from "@/lib/themeInsightsDigest";
import { legacyScheduleFromProfile } from "@/lib/nudges";
import { formatOnDemandPromptLabel } from "@/lib/prompts/onDemandPrompt";
import type { TopicId } from "@/lib/promptEngine";
import type { Entry } from "@/types/database";

export async function TodayThemeInsight() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: entries } = await supabase
    .from("entries")
    .select("id, topics_snapshot, prompt_slot, written_at, body, is_draft")
    .eq("user_id", user.id)
    .order("written_at", { ascending: false })
    .limit(500);

  const list = publishedEntries((entries ?? []) as Entry[]);
  if (list.length < 2) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("topics, timezone, nudge_schedule")
    .eq("id", user.id)
    .single();

  const timeZone = profile?.timezone || "UTC";
  const schedule = legacyScheduleFromProfile(profile ?? {});
  const labelById = Object.fromEntries(
    schedule.nudges.map((n) => [n.id, n.label])
  );
  const resolveLabel = (slot: string) =>
    labelById[slot] ?? formatOnDemandPromptLabel(slot) ?? slot;
  const profileTopics = (profile?.topics ?? []) as TopicId[];

  const steps = buildThemeTimeline(
    list,
    timeZone,
    resolveLabel,
    profileTopics,
    { granularity: "day", maxSteps: 14 }
  );
  const digest = buildThemeWritingDigest(steps, profileTopics, 7);
  if (!digest) return null;

  return (
    <Link
      href="/app/journal?view=timeline"
      className="block rounded-2xl border border-ink-border/80 bg-ink-surface/80 px-4 py-3 hover:border-ink-accent/40 transition-colors"
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        Your theme map
      </p>
      <p className="text-sm text-ink-fg mt-1 leading-relaxed">{digest.headline}</p>
      <p className="text-xs text-ink-accent mt-2">Open timeline →</p>
    </Link>
  );
}
