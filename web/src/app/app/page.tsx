import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { TodayPrompt } from "@/components/TodayPrompt";
import { PromptSkeleton } from "@/components/PromptSkeleton";
import { OnDemandPrompt } from "@/components/OnDemandPrompt";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <div className="space-y-8">
      <Suspense fallback={<PromptSkeleton />}>
        <TodayPrompt userId={user.id} />
      </Suspense>
      <OnDemandPrompt />
    </div>
  );
}
