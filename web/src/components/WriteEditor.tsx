"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { NudgeKind } from "@/lib/nudges";
import { HumanOnlyBanner } from "./HumanOnlyBanner";

type Props = {
  promptText: string;
  nudgeId: string;
  nudgeKind: NudgeKind;
  topicsSnapshot: string[];
  entryId?: string;
  initialBody?: string;
};

export function WriteEditor({
  promptText,
  nudgeId,
  nudgeKind,
  topicsSnapshot,
  entryId,
  initialBody = "",
}: Props) {
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  async function save() {
    if (!body.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (entryId) {
      await supabase
        .from("entries")
        .update({ body: body.trim() })
        .eq("id", entryId)
        .eq("user_id", user.id);
    } else {
      await supabase.from("entries").insert({
        user_id: user.id,
        prompt_text: promptText,
        prompt_slot: nudgeId,
        body: body.trim(),
        topics_snapshot: topicsSnapshot,
      });
    }

    if (nudgeKind === "once") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("nudges_fired")
        .eq("id", user.id)
        .single();
      const fired = (profile?.nudges_fired ?? []) as string[];
      if (!fired.includes(nudgeId)) {
        await supabase
          .from("profiles")
          .update({ nudges_fired: [...fired, nudgeId] })
          .eq("id", user.id);
      }
    }

    setSaving(false);
    setSaved(true);
    router.push("/app/journal");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <blockquote className="font-serif text-2xl leading-snug text-ink-fg">
        {promptText}
      </blockquote>
      <HumanOnlyBanner compact />
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setSaved(false);
        }}
        placeholder="Start anywhere. No one else will read this unless you choose to share."
        className="w-full min-h-[280px] resize-y rounded-2xl border border-ink-border bg-ink-surface/50 px-5 py-4 text-lg leading-relaxed text-ink-fg placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-ink-accent/30 font-serif"
        autoFocus
      />
      <p className="text-xs text-ink-muted">
        {body.length} characters · stored privately in your account
      </p>
      <button
        type="button"
        onClick={save}
        disabled={saving || !body.trim()}
        className="w-full rounded-full bg-ink-fg text-ink-bg py-3.5 font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {saving ? "Saving…" : saved ? "Saved" : "Save to journal"}
      </button>
    </div>
  );
}
