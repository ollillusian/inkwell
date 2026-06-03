import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractEvidenceTrace, type ExtractedEvent } from "@/lib/llm/extractEvidence";
import { lexicalSignals } from "@/lib/hypotheses/lexical";
import { crossCheckAgainstSignals } from "@/lib/hypotheses/updateLoop";
import { instantiationFor } from "@/lib/hypotheses/library";
import { processUserEntries } from "@/lib/hypotheses/processRecent";
import { generateHypothesisNudge, gateNudge } from "@/lib/llm/generateHypothesisNudge";
import { findDisconfirmers } from "@/lib/hypotheses/embedJob";
import { redactThirdParties } from "@/lib/hypotheses/redact";
import { profileVoice } from "@/lib/prompts/getDailyPrompt";

async function resolveUserId(
  db: ReturnType<typeof createAdminClient>,
  email?: unknown,
  userId?: unknown
): Promise<string> {
  if (typeof userId === "string" && userId) return userId;
  if (typeof email === "string" && email) {
    const { data } = await db.auth.admin.listUsers({ perPage: 200 });
    return data?.users?.find((u) => u.email === email)?.id ?? "";
  }
  return "";
}

export const dynamic = "force-dynamic";

/**
 * Local-only developer inspector for the (invisible) hypothesis engine. Disabled in production.
 *
 * GET                    -> list users (id + email) to pick from
 * GET ?email= | ?userId= -> that user's full hypothesis state (hypotheses + evidence + outcomes +
 *                           processing log + pre-generated nudges)
 * POST { text }          -> LIVE TRACE of the model's reasoning on arbitrary text (lexical signals,
 *                           every sampled extraction with for/against + situational + the M=N vote,
 *                           and the aggregated result). NO DB writes.
 */
function blocked(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  return null;
}

export async function GET(request: Request) {
  const block = blocked();
  if (block) return block;
  const db = createAdminClient();
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  const userIdParam = url.searchParams.get("userId");

  // No target -> list users (with journal-entry counts) so the page can offer a picker.
  if (!email && !userIdParam) {
    const { data } = await db.auth.admin.listUsers({ perPage: 200 });
    const { data: entryRows } = await db.from("entries").select("user_id");
    const counts = new Map<string, number>();
    for (const r of (entryRows ?? []) as { user_id: string }[]) {
      counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
    }
    const users = (data?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email,
      entries: counts.get(u.id) ?? 0,
    }));
    return NextResponse.json({ users });
  }

  let userId = userIdParam ?? "";
  if (!userId && email) {
    const { data } = await db.auth.admin.listUsers({ perPage: 200 });
    userId = data?.users?.find((u) => u.email === email)?.id ?? "";
  }
  if (!userId) return NextResponse.json({ error: "user not found" }, { status: 404 });

  const [hypotheses, evidence, outcomes, log, deliveries] = await Promise.all([
    db.from("hypotheses").select("*").eq("user_id", userId).order("evidence_tally", { ascending: false }),
    db.from("hypothesis_evidence").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    db.from("hypothesis_nudge_outcomes").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    db.from("hypothesis_entry_log").select("*").eq("user_id", userId).order("processed_at", { ascending: false }),
    db.from("prompt_deliveries").select("delivery_date, prompt_slot, prompt_text").eq("user_id", userId).order("delivery_date", { ascending: false }),
  ]);

  return NextResponse.json({
    userId,
    hypotheses: hypotheses.data ?? [],
    evidence: evidence.data ?? [],
    outcomes: outcomes.data ?? [],
    log: log.data ?? [],
    deliveries: deliveries.data ?? [],
  });
}

export async function POST(request: Request) {
  const block = blocked();
  if (block) return block;
  const body = await request.json().catch(() => ({}));

  // Action: run the REAL engine over a user's actual journal entries (real LLM calls + DB writes).
  if (body.action === "process") {
    const db = createAdminClient();
    const userId = await resolveUserId(db, body.email, body.userId);
    if (!userId) return NextResponse.json({ error: "user not found" }, { status: 404 });
    const summary = await processUserEntries(userId, { reset: Boolean(body.reset) });
    return NextResponse.json({ userId, ...summary });
  }

  // Action: preview the real disconfirmer-led nudge for a user's top active/supported hypothesis.
  // Dev-only and cohort-agnostic (the production loop only pregenerates for the hypothesis A/B cohort).
  if (body.action === "nudge") {
    const db = createAdminClient();
    const userId = await resolveUserId(db, body.email, body.userId);
    if (!userId) return NextResponse.json({ error: "user not found" }, { status: 404 });

    const { data: hyps } = await db
      .from("hypotheses")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["active", "supported"])
      .order("evidence_tally", { ascending: false })
      .limit(1);
    const hyp = hyps?.[0];
    if (!hyp) {
      return NextResponse.json({ error: "no active/supported hypothesis to nudge on yet" }, { status: 400 });
    }

    const { data: profile } = await db
      .from("profiles")
      .select("tone_tags, writing_voice")
      .eq("id", userId)
      .maybeSingle();

    const hypInfo = { framework: hyp.framework, category: hyp.category, status: hyp.status, statement: hyp.statement };

    // Disconfirmers = own contradicting evidence + LLM-verified corpus counter-examples.
    const { data: contra } = await db
      .from("hypothesis_evidence")
      .select("quote")
      .eq("hypothesis_id", hyp.id)
      .eq("stance", "contradicting")
      .limit(3);
    const fromEvidence = (contra ?? []).map((c: { quote: string }) => ({ text: redactThirdParties(c.quote) }));
    const verified = hyp.watched_disconfirmers?.length
      ? await findDisconfirmers(db, userId, hyp.statement, hyp.watched_disconfirmers)
      : [];
    const disconfirmers = [...fromEvidence, ...verified.map((d) => ({ text: d.text }))];

    // Grounding for guided discovery when there's no counter-example: real things they wrote.
    const { data: support } = await db
      .from("hypothesis_evidence")
      .select("quote")
      .eq("hypothesis_id", hyp.id)
      .eq("stance", "supporting")
      .limit(3);
    const grounding = (support ?? []).map((c: { quote: string }) => ({ text: redactThirdParties(c.quote) }));

    const { text, calls } = await generateHypothesisNudge({
      framework: hyp.framework,
      internalStatement: hyp.statement,
      externalizedLabel: hyp.externalized_label,
      disconfirmerExcerpts: disconfirmers,
      groundingExcerpts: grounding,
      evidenceTally: hyp.evidence_tally,
      confidenceCeiling: hyp.confidence_ceiling,
      voice: profileVoice({ tone_tags: profile?.tone_tags, writing_voice: profile?.writing_voice }),
    });

    return NextResponse.json({
      hypothesis: hypInfo,
      move: disconfirmers.length ? "unique-outcome" : "guided-discovery",
      disconfirmers,
      nudge: text,
      gate: text ? gateNudge(text) : null,
      llmCalls: calls,
      note: "Dev preview — cohort-agnostic.",
    });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  // Run the same gates/sensors the loop would — but purely, with NO persistence.
  const signals = lexicalSignals(text, []);
  const trace = await extractEvidenceTrace(text);
  const events = crossCheckAgainstSignals(trace.aggregated, signals);

  // Show the HYPOTHESIS each event would form/map to (the loop groups by framework+category and
  // instantiates from the library). A fresh entry can only ever seed a CANDIDATE — promotion needs
  // >=3 spontaneous days across >=2 situations + a rival + a falsifier.
  const groups = new Map<string, ExtractedEvent[]>();
  for (const e of events) {
    const key = `${e.framework}::${e.category.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const hypotheses = [...groups.values()].map((evs) => {
    const seedable = evs.find((e) => e.stance === "supporting" && e.weightBand !== "weak");
    const init = instantiationFor(seedable ?? evs[0]);
    return {
      framework: init.framework,
      category: init.category,
      statement: init.statement,
      externalizedLabel: init.externalizedLabel,
      watchedDisconfirmers: init.watchedDisconfirmers,
      confidenceCeiling: init.confidenceCeiling,
      wouldSeedCandidate: Boolean(seedable), // supporting + >=moderate => starts a candidate
      eventCount: evs.length,
    };
  });

  return NextResponse.json({
    text,
    signals, // absolutist trend + densities
    hypotheses, // what hypothesis/hypotheses this entry would form or map to
    extraction: {
      requested: trace.requested,
      succeeded: trace.succeeded,
      samples: trace.samples, // raw per-sample DoT spans + candidate events (for/against, situational)
      events, // aggregated + cross-checked final events
    },
    note: "No DB writes were made. This is what the model reasoned; the loop would persist only quotes/bands/situational.",
  });
}
