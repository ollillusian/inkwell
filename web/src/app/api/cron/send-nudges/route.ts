import { NextResponse } from "next/server";
import { dispatchAllDueNudges } from "@/lib/nudgeDispatch";
import { pushConfigured } from "@/lib/push/vapid";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const q = new URL(request.url).searchParams.get("secret");
  return q === secret;
}

/** Call every minute from Railway cron or external scheduler. */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!pushConfigured()) {
    return NextResponse.json(
      { error: "VAPID keys not configured" },
      { status: 503 }
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not set" },
      { status: 503 }
    );
  }

  try {
    const result = await dispatchAllDueNudges();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[inkwell] send-nudges:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Dispatch failed" },
      { status: 500 }
    );
  }
}
