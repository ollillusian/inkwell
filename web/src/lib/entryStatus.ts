import type { SupabaseClient } from "@supabase/supabase-js";

export type NudgeEntryStatus = {
  publishedId: string | null;
  draftId: string | null;
};

/** Published vs in-progress draft for one nudge on a given local day. */
export async function nudgeEntryStatusForDay(
  supabase: SupabaseClient,
  userId: string,
  promptSlot: string,
  start: string,
  end: string
): Promise<NudgeEntryStatus> {
  const { data: rows } = await supabase
    .from("entries")
    .select("id, is_draft, body")
    .eq("user_id", userId)
    .eq("prompt_slot", promptSlot)
    .gte("written_at", start)
    .lte("written_at", end)
    .order("updated_at", { ascending: false });

  let publishedId: string | null = null;
  let draftId: string | null = null;

  for (const row of rows ?? []) {
    const hasText = Boolean(row.body?.trim());
    if (!hasText) continue;
    if (row.is_draft === true) {
      if (!draftId) draftId = row.id;
    } else if (!publishedId) {
      publishedId = row.id;
    }
  }

  return { publishedId, draftId };
}
