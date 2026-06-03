/**
 * Embedding job + disconfirmation scan (the unique-outcome engine). See HYPOTHESIS_NUDGE_ENGINE.md §6.
 *
 * Every published entry is NE-redacted and embedded into entry_embeddings. To find disconfirmers for
 * a negative self-story, we embed the hypothesis's watched_disconfirmers (phrasings that would
 * CONTRADICT the story — "followed through", "showed up") and nearest-neighbour search the user's
 * own past entries. Those real past moments become the material the nudge leads with.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { embed, callStructured, EMBEDDING_MODEL } from "@/lib/llm/modelClient";
import { redactThirdParties } from "@/lib/hypotheses/redact";

function normWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Redact + embed an entry and upsert it into entry_embeddings. No-op if embedding fails. */
export async function upsertEntryEmbedding(
  db: SupabaseClient,
  userId: string,
  entryId: string,
  body: string
): Promise<void> {
  const redacted = redactThirdParties(body);
  if (!redacted.trim()) return;
  const result = await embed(redacted);
  if (!result) return;
  await db.from("entry_embeddings").upsert(
    {
      entry_id: entryId,
      user_id: userId,
      embedding: result.embedding,
      model_version: result.modelVersion,
      redacted_text: redacted.slice(0, 2000),
    },
    { onConflict: "entry_id" }
  );
}

export type DisconfirmerHit = { entryId: string; text: string; distance: number };

/**
 * Find past entries that contradict a negative self-story by similarity to its disconfirmer
 * phrasings. Returns the closest matches (lower distance = better), excluding the triggering entry.
 * Only returns hits within `maxDistance` so we don't surface irrelevant entries as "disconfirmers".
 */
export async function scanForContradiction(
  db: SupabaseClient,
  userId: string,
  watchedDisconfirmers: string[],
  opts: { excludeEntryId?: string; limit?: number; maxDistance?: number } = {}
): Promise<DisconfirmerHit[]> {
  const query = watchedDisconfirmers.filter(Boolean).join("; ").trim();
  if (!query) return [];
  const queryVec = await embed(query);
  if (!queryVec) return [];

  const { data, error } = await db.rpc("match_entry_embeddings", {
    query_embedding: queryVec.embedding,
    match_user: userId,
    match_count: opts.limit ?? 3,
    exclude_entry: opts.excludeEntryId ?? null,
  });
  if (error || !data) return [];

  const maxDistance = opts.maxDistance ?? 0.55; // cosine distance; ~0 identical, 1 orthogonal
  return (data as { entry_id: string; redacted_text: string; distance: number }[])
    .filter((r) => r.distance <= maxDistance)
    .map((r) => ({ entryId: r.entry_id, text: r.redacted_text, distance: r.distance }));
}

export type Disconfirmer = { entryId: string; text: string };

const VerifySchema = z.object({
  results: z.array(
    z.object({
      index: z.number(),
      // A GENUINE counter-example (the opposite of the belief actually happened), not just same topic.
      contradicts: z.boolean(),
      fragment: z.string(), // verbatim fragment from the excerpt that shows the contradiction
    })
  ),
});

/**
 * Embedding similarity retrieves topically-near entries, but it can't tell "rested without guilt"
 * from "rested WITH guilt" — so candidates must be VERIFIED. The LLM checks each candidate genuinely
 * contradicts the negative belief (a real "unique outcome") and returns the verbatim contradicting
 * fragment. This is what stops the nudge from leading with belief-confirming quotes.
 */
async function verifyDisconfirmers(
  negativeStory: string,
  candidates: DisconfirmerHit[]
): Promise<Disconfirmer[]> {
  if (candidates.length === 0) return [];
  const excerpts = candidates.map((c, i) => `${i}: "${c.text}"`).join("\n");
  const result = await callStructured<z.infer<typeof VerifySchema>>({
    system:
      "You verify counter-evidence for a journaling tool. Given a person's negative self-belief and excerpts from their PAST entries, decide for each excerpt whether it is a GENUINE counter-example — a 'unique outcome' where the OPPOSITE of the belief actually happened. Topical similarity is NOT enough; the meaning must contradict the belief. Return contradicts=true only for real counter-examples, with the verbatim fragment that shows it (copied exactly from the excerpt).",
    user: `NEGATIVE BELIEF: "${negativeStory}"\n\nPAST ENTRY EXCERPTS:\n${excerpts}\n\nReturn JSON.`,
    schema: VerifySchema,
    jsonSchemaName: "disconfirmer_verification",
    temperature: 0,
    maxTokens: 600,
    retries: 1,
  });
  if (!result.ok) return [];

  const out: Disconfirmer[] = [];
  for (const r of result.data.results) {
    if (!r.contradicts) continue;
    const cand = candidates[r.index];
    if (!cand) continue;
    const frag = normWs(r.fragment);
    // Prefer the verbatim fragment if it's actually in the excerpt; else fall back to the excerpt.
    const verbatim = frag && normWs(cand.text).toLowerCase().includes(frag.toLowerCase());
    out.push({ entryId: cand.entryId, text: redactThirdParties(verbatim ? frag : cand.text).slice(0, 280) });
  }
  return out;
}

/**
 * The unique-outcome retrieval, end to end: embedding-search candidate past entries, then LLM-verify
 * which genuinely contradict the belief. Returns ONLY verified counter-examples (possibly empty —
 * in which case the caller should NOT nudge, since there's nothing safe to lead with).
 */
export async function findDisconfirmers(
  db: SupabaseClient,
  userId: string,
  negativeStory: string,
  watchedDisconfirmers: string[],
  opts: { excludeEntryId?: string; limit?: number } = {}
): Promise<Disconfirmer[]> {
  const candidates = await scanForContradiction(db, userId, watchedDisconfirmers, {
    excludeEntryId: opts.excludeEntryId,
    limit: opts.limit ?? 6,
    maxDistance: 0.6, // wider recall; verification supplies the precision
  });
  if (candidates.length === 0) return [];
  return verifyDisconfirmers(negativeStory, candidates);
}

export { EMBEDDING_MODEL };
