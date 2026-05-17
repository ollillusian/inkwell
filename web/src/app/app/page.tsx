import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { TodayPrompt } from "@/components/TodayPrompt";
import { PromptSkeleton } from "@/components/PromptSkeleton";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <Suspense fallback={<PromptSkeleton />}>
      <TodayPrompt userId={user.id} />
    </Suspense>
  );
}
