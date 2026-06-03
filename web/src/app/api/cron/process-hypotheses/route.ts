import { NextResponse } from "next/server";
import { processRecentEntries } from "@/lib/hypotheses/processRecent";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Header only — no ?secret= query fallback. Query strings leak into proxy/CDN/access logs, and
  // this endpoint gates full-egress LLM spend.
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Runs the hypothesis update loop over recently-published entries. Call on a schedule (e.g. every
 * few minutes) from the same cron host as send-nudges. Idempotent: already-processed entries are
 * skipped via hypothesis_entry_log, so overlapping windows are safe.
 *
 * Query params: ?sinceMinutes=NNN (default 1440), ?max=NNN (default 100).
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 503 });
  }

  const url = new URL(request.url);
  const sinceMinutes = Number(url.searchParams.get("sinceMinutes")) || undefined;
  const max = Number(url.searchParams.get("max")) || undefined;

  try {
    const result = await processRecentEntries({ sinceMinutes, max });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[inkwell] process-hypotheses:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
