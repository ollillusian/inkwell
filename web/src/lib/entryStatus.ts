import type { SupabaseClient } from "@supabase/supabase-js";

export type NudgeEntryStatus = {
  publishedId: string | null;
  draftId: string | null;
};

type EntryRow = {
  id: string;
  is_draft: boolean | null;
  body: string | null;
  updated_at?: string | null;
};

function rowHasText(row: EntryRow): boolean {
  return Boolean(row.body?.trim());
}

function isExplicitDraft(row: EntryRow): boolean {
  return row.is_draft === true;
}

/** Saved to journal via "Save to journal" (not an autosave draft). */
function isExplicitPublished(row: EntryRow): boolean {
  return row.is_draft === false && rowHasText(row);
}

/**
 * Published vs in-progress draft for one nudge on a given local day.
 * Prefers the most recent row when both exist (e.g. draft after an old save).
 */
export async function nudgeEntryStatusForDay(
  supabase: SupabaseClient,
  userId: string,
  promptSlot: string,
  start: string,
  end: string
): Promise<NudgeEntryStatus> {
  const { data: rows } = await supabase
    .from("entries")
    .select("id, is_draft, body, updated_at")
    .eq("user_id", userId)
    .eq("prompt_slot", promptSlot)
    .gte("written_at", start)
    .lte("written_at", end)
    .order("updated_at", { ascending: false });

  const withText = (rows ?? []).filter(rowHasText);
  if (withText.length === 0) {
    return { publishedId: null, draftId: null };
  }

  const latest = withText[0];
  const latestDraft = withText.find(isExplicitDraft) ?? null;
  const latestPublished = withText.find(isExplicitPublished) ?? null;

  // Most recent touch wins — avoids "already wrote" when you're on a new draft.
  if (latest && isExplicitDraft(latest)) {
    return {
      publishedId: null,
      draftId: latest.id,
    };
  }

  if (latest && isExplicitPublished(latest)) {
    return {
      publishedId: latest.id,
      draftId: latestDraft && latestDraft.id !== latest.id ? latestDraft.id : null,
    };
  }

  // Legacy rows (no is_draft column / null): treat as draft unless clearly saved long-form
  return {
    publishedId: latestPublished?.id ?? null,
    draftId: latestDraft?.id ?? null,
  };
}
