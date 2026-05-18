"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  markNudgeFired?: boolean;
  deliveryDate?: string;
};

type DraftStatus = "idle" | "saving" | "saved" | "error";

export function WriteEditor({
  promptText,
  nudgeId,
  nudgeKind,
  topicsSnapshot,
  entryId,
  initialBody = "",
  markNudgeFired = nudgeKind === "once",
  deliveryDate,
}: Props) {
  const [body, setBody] = useState(initialBody);
  const [currentEntryId, setCurrentEntryId] = useState(entryId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>(
    initialBody ? "saved" : "idle"
  );
  const router = useRouter();
  const currentEntryIdRef = useRef(entryId);
  const lastSavedBody = useRef(initialBody);
  const saveVersion = useRef(0);

  const persistEntry = useCallback(
    async (bodyToSave: string, isDraft: boolean): Promise<string | null> => {
      const existingEntryId = currentEntryIdRef.current;
      if (!bodyToSave.trim() && !existingEntryId) return null;

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const payload = {
        prompt_text: promptText,
        prompt_slot: nudgeId,
        body: bodyToSave,
        topics_snapshot: topicsSnapshot,
        is_draft: isDraft,
      };

      const { data, error } = existingEntryId
        ? await supabase
            .from("entries")
            .update(payload)
            .eq("id", existingEntryId)
            .eq("user_id", user.id)
            .select("id")
            .single()
        : await supabase
            .from("entries")
            .insert({
              ...payload,
              user_id: user.id,
            })
            .select("id")
            .single();

      if (error) throw error;
      const savedEntryId = data?.id as string | undefined;
      if (!savedEntryId) return null;

      currentEntryIdRef.current = savedEntryId;
      setCurrentEntryId(savedEntryId);

      if (deliveryDate) {
        await supabase
          .from("prompt_deliveries")
          .update({ entry_id: savedEntryId })
          .eq("user_id", user.id)
          .eq("delivery_date", deliveryDate)
          .eq("prompt_slot", nudgeId);
      }

      return savedEntryId;
    },
    [deliveryDate, nudgeId, promptText, topicsSnapshot]
  );

  useEffect(() => {
    if (body === lastSavedBody.current) return;
    if (!body.trim() && !currentEntryId) {
      return;
    }

    const version = ++saveVersion.current;

    const timeout = window.setTimeout(async () => {
      try {
        if (saveVersion.current !== version) return;
        await persistEntry(body, true);
        if (saveVersion.current === version) {
          lastSavedBody.current = body;
          setDraftStatus("saved");
        }
      } catch (error) {
        console.error("[inkwell] draft autosave failed:", error);
        if (saveVersion.current === version) setDraftStatus("error");
      }
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [body, currentEntryId, persistEntry]);

  async function save() {
    if (!body.trim()) return;
    saveVersion.current += 1;
    setSaving(true);
    setDraftStatus("saving");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setDraftStatus("error");
      return;
    }

    let savedEntryId: string | null = null;
    try {
      savedEntryId = await persistEntry(body.trim(), false);
    } catch (error) {
      console.error("[inkwell] entry save failed:", error);
      setSaving(false);
      setDraftStatus("error");
      return;
    }

    if (markNudgeFired) {
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

    if (!savedEntryId) {
      setSaving(false);
      setDraftStatus("error");
      return;
    }

    lastSavedBody.current = body.trim();
    setSaving(false);
    setSaved(true);
    setDraftStatus("saved");
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
          const nextBody = e.target.value;
          setBody(nextBody);
          setSaved(false);
          setDraftStatus(nextBody.trim() || currentEntryId ? "saving" : "idle");
        }}
        placeholder="Start anywhere. No one else will read this unless you choose to share."
        className="w-full min-h-[280px] resize-y rounded-2xl border border-ink-border bg-ink-surface/50 px-5 py-4 text-lg leading-relaxed text-ink-fg placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-ink-accent/30 font-serif"
        autoFocus
      />
      <p className="text-xs text-ink-muted">
        {body.length} characters ·{" "}
        {draftStatus === "saving"
          ? "saving draft..."
          : draftStatus === "saved"
            ? "draft saved"
            : draftStatus === "error"
              ? "autosave needs a retry"
              : "stored privately in your account"}
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
