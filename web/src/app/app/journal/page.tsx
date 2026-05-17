import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { legacyScheduleFromProfile } from "@/lib/nudges";
import type { Entry } from "@/types/database";

export default async function JournalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: entries } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", user.id)
    .order("written_at", { ascending: false })
    .limit(50);

  const list = (entries ?? []) as Entry[];
  const { data: profile } = await supabase
    .from("profiles")
    .select("nudge_schedule, morning_time, midday_time, evening_time")
    .eq("id", user.id)
    .single();
  const schedule = legacyScheduleFromProfile(profile ?? {});
  const labelById = Object.fromEntries(
    schedule.nudges.map((n) => [n.id, n.label])
  );

  if (list.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="font-serif text-2xl text-ink-muted">No entries yet</p>
        <p className="mt-2 text-sm text-ink-muted">
          Your first prompt is waiting on Today.
        </p>
        <Link
          href="/app"
          className="inline-block mt-6 text-ink-accent font-medium"
        >
          Go to Today →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">Journal</h1>
      <ul className="space-y-4">
        {list.map((entry) => (
          <li
            key={entry.id}
            className="rounded-2xl border border-ink-border bg-ink-surface p-5"
          >
            <p className="text-xs text-ink-muted uppercase tracking-wide">
              {labelById[entry.prompt_slot] ?? entry.prompt_slot} ·{" "}
              {new Date(entry.written_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <p className="mt-2 font-serif text-lg text-ink-muted line-clamp-2">
              {entry.prompt_text}
            </p>
            <p className="mt-3 text-ink-fg leading-relaxed whitespace-pre-wrap line-clamp-4">
              {entry.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
