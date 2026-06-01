import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushConfigured } from "@/lib/push/vapid";

/** Debug: GET /api/push/status while logged in */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("notifications_enabled, timezone")
    .eq("id", user.id)
    .single();

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, created_at");

  return NextResponse.json({
    pushConfigured: pushConfigured(),
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasCronSecret: Boolean(process.env.CRON_SECRET),
    notificationsEnabled: profile?.notifications_enabled ?? false,
    timezone: profile?.timezone ?? "UTC",
    subscriptionCount: subs?.length ?? 0,
    subscriptionsError: subsError?.message ?? null,
    subscriptions: subs?.map((s) => ({
      id: s.id,
      endpointPreview: String(s.endpoint).slice(0, 48) + "…",
      created_at: s.created_at,
    })),
  });
}
