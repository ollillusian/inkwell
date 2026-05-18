import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  groupEntriesByLocalDay,
  wordCount,
} from "@/lib/journal";
import { formatLocalDateLong, zonedLocalToUtc } from "@/lib/datetime";
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
    .limit(200);

  const list = (entries ?? []) as Entry[];
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();

  const timeZone = profile?.timezone || "UTC";

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

  const days = groupEntriesByLocalDay(list, timeZone);

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="font-serif text-3xl">Journal</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Open a day for your timeline, a woven short story, and full entries.
        </p>
      </div>
      <ul className="space-y-4">
        {days.map(({ dateKey, entries: dayEntries }) => {
          const [y, mo, d] = dateKey.split("-").map(Number);
          const dayDate = zonedLocalToUtc(y, mo, d, 12, 0, timeZone);
          const preview = dayEntries[0];
          const totalWords = dayEntries.reduce(
            (n, e) => n + wordCount(e.body),
            0
          );
          return (
            <li key={dateKey}>
              <Link
                href={`/app/journal/${dateKey}`}
                className="block rounded-2xl border border-ink-border bg-ink-surface p-5 hover:border-ink-accent/40 transition-colors"
              >
                <p className="font-serif text-xl">
                  {formatLocalDateLong(dayDate, timeZone)}
                </p>
                <p className="mt-1 text-xs text-ink-muted uppercase tracking-wide">
                  {dayEntries.length}{" "}
                  {dayEntries.length === 1 ? "entry" : "entries"} · {totalWords}{" "}
                  words
                </p>
                <p className="mt-2 text-sm text-ink-muted line-clamp-2">
                  {preview.body.trim() || preview.prompt_text}
                </p>
                <p className="mt-2 text-xs text-ink-accent">
                  View day → story & graph
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
