import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Body = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.endpoint || !body.p256dh || !body.auth) {
    return NextResponse.json({ error: "Missing subscription fields" }, { status: 400 });
  }

  const ua = request.headers.get("user-agent") ?? undefined;

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      user_agent: ua,
    },
    { onConflict: "user_id,endpoint" }
  );

  if (error) {
    console.error("[inkwell] push subscribe:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
