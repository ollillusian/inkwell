/**
 * Surface-framework label canonicalization — the fix for "Forming" fragmentation.
 *
 * Deep frameworks (beck/attachment/schema) use a FIXED `category` enum, so every relevant entry lands
 * on the same hypothesis and evidence accumulates (→ they promote). Surface frameworks (dominant-story
 * / language / behavioral / emergent) have no fixed vocabulary — their identity is a free-text label
 * the model picks per entry, so the same theme gets a slightly different slug each time
 * ("lost_identity" vs "identity_crisis") and never stacks, leaving a pile of one-off "Forming" cards.
 *
 * Before an entry's events are grouped into hypotheses, this maps each NEW surface category onto an
 * existing equivalent one for the user — an LLM decides semantic sameness (conservative, clear matches
 * only) — so related themes file under one accumulating hypothesis instead of fragmenting. Deep
 * frameworks are untouched (the enum already canonicalizes them).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { callStructured } from "@/lib/llm/modelClient";
import { FRAMEWORK_CATEGORIES, normalizeSlug } from "@/lib/hypotheses/taxonomy";
import type { ExtractedEvent } from "@/lib/llm/extractEvidence";
import type { HypothesisFramework } from "@/types/database";

/** A framework is "surface" iff it has no fixed clinical category vocabulary. */
const isSurface = (framework: HypothesisFramework) => !(framework in FRAMEWORK_CATEGORIES);

const MapSchema = z.object({
  mappings: z.array(z.object({ from: z.string(), to: z.string() })),
});

/**
 * Remap surface-framework `category` slugs to canonical (existing-or-merged) ones so related themes
 * accumulate on one hypothesis. Returns the (possibly remapped) events plus the number of LLM calls
 * made (for budget accounting). Never throws — on any failure it returns the events unchanged.
 */
export async function canonicalizeSurfaceCategories(
  db: SupabaseClient,
  userId: string,
  events: ExtractedEvent[]
): Promise<{ events: ExtractedEvent[]; calls: number }> {
  const surface = events.filter((e) => isSurface(e.framework));
  if (surface.length === 0) return { events, calls: 0 };

  let calls = 0;
  const remap = new Map<string, string>(); // `${framework}::${slug}` -> canonical slug

  const byFramework = new Map<HypothesisFramework, ExtractedEvent[]>();
  for (const e of surface) byFramework.set(e.framework, [...(byFramework.get(e.framework) ?? []), e]);

  for (const [framework, evs] of byFramework) {
    const newCats = [...new Set(evs.map((e) => e.category))];
    const { data: rows } = await db
      .from("hypotheses")
      .select("category")
      .eq("user_id", userId)
      .eq("framework", framework)
      .neq("status", "retired");
    const existingCats = [...new Set((rows ?? []).map((r: { category: string }) => r.category))];

    // Nothing to merge against and only one new theme — no canonicalization possible/needed.
    if (existingCats.length === 0 && newCats.length <= 1) continue;

    const result = await callStructured<z.infer<typeof MapSchema>>({
      system:
        "You canonicalize personal-journal theme labels so the SAME underlying theme isn't tracked under several names. Merge only CLEAR semantic matches; when unsure, keep a theme separate.",
      user: `Themes already tracked for this person (framework: ${framework}):\n${
        existingCats.length ? existingCats.map((c) => `- ${c}`).join("\n") : "(none yet)"
      }\n\nNew themes from today's entry:\n${newCats.map((c) => `- ${c}`).join("\n")}\n\nFor EACH new theme return { "from": <new theme verbatim>, "to": <slug to file it under> }:\n- If it is essentially the same underlying theme as an existing one, set "to" to that EXISTING slug, verbatim.\n- If two new themes are the same, map them to one shared slug.\n- Otherwise set "to" equal to "from" (keep it separate).\nClear match example: "lost_identity" ~ "identity_crisis" ~ "no_part_two" (all "I've lost who I was"). NOT a match: "avoidance" vs "insomnia".`,
      schema: MapSchema,
      jsonSchemaName: "theme_canon",
      temperature: 0,
      maxTokens: 500,
      retries: 1,
    });
    calls += 1;
    if (!result.ok) continue;
    for (const m of result.data.mappings) {
      const from = normalizeSlug(m.from);
      const to = normalizeSlug(m.to);
      if (from && to && from !== to) remap.set(`${framework}::${from}`, to);
    }
  }

  if (remap.size === 0) return { events, calls };
  const out = events.map((e) => {
    const to = remap.get(`${e.framework}::${e.category}`);
    return to ? { ...e, category: to } : e;
  });
  return { events: out, calls };
}
