import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { TodayPrompt } from "@/components/TodayPrompt";
import { TodayThemeInsight } from "@/components/TodayThemeInsight";
import { PromptSkeleton } from "@/components/PromptSkeleton";
import { OnDemandPrompt } from "@/components/OnDemandPrompt";
import {
  ON_DEMAND_PROMPT_PREFIX,
  type OnDemandPromptSummary,
} from "@/lib/prompts/onDemandPrompt";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: deliveries } = await supabase
    .from("prompt_deliveries")
    .select("prompt_slot, prompt_text, created_at")
    .eq("user_id", user.id)
    .like("prompt_slot", `${ON_DEMAND_PROMPT_PREFIX}%`)
    .order("created_at", { ascending: false })
    .limit(5);

  const recentIds = (deliveries ?? []).map((item) => item.prompt_slot);
  const { data: drafts } =
    recentIds.length > 0
      ? await supabase
          .from("entries")
          .select("prompt_slot, body")
          .eq("user_id", user.id)
          .eq("is_draft", true)
          .in("prompt_slot", recentIds)
      : { data: [] };
  const draftBySlot = Object.fromEntries(
    (drafts ?? []).map((entry) => [entry.prompt_slot, entry.body])
  );
  const recentPrompts: OnDemandPromptSummary[] = (deliveries ?? []).map(
    (item) => ({
      nudgeId: item.prompt_slot,
      prompt: item.prompt_text,
      createdAt: item.created_at,
      draftBody: draftBySlot[item.prompt_slot],
    })
  );

  return (
    <div className="space-y-8">
      <TodayThemeInsight />
      <OnDemandPrompt initialPrompts={recentPrompts} />
      <Suspense fallback={<PromptSkeleton />}>
        <section className="space-y-3 border-t border-ink-border/80 pt-8">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Scheduled nudge
          </p>
          <TodayPrompt userId={user.id} />
        </section>
      </Suspense>
    </div>
  );
}
