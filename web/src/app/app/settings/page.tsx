"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TopicPicker } from "@/components/TopicPicker";
import { NudgeScheduleEditor } from "@/components/NudgeScheduleEditor";
import type { TopicId } from "@/lib/promptEngine";
import {
  DEFAULT_NUDGE_SCHEDULE,
  legacyScheduleFromProfile,
  type NudgeScheduleConfig,
} from "@/lib/nudges";
import { requestNotificationPermission } from "@/lib/notifications";
import { WritingVoicePicker } from "@/components/WritingVoicePicker";
import { HumanOnlyBanner } from "@/components/HumanOnlyBanner";
import type { WritingPreferences } from "@/lib/writingVoice";

export default function SettingsPage() {
  const [topics, setTopics] = useState<TopicId[]>([]);
  const [nudgeConfig, setNudgeConfig] = useState<NudgeScheduleConfig>(
    DEFAULT_NUDGE_SCHEDULE
  );
  const [voice, setVoice] = useState<WritingPreferences>({
    toneTags: [],
    writingVoice: "",
  });
  const [timezone, setTimezone] = useState("UTC");
  const [notifications, setNotifications] = useState(true);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (data) {
        setTopics((data.topics ?? []) as TopicId[]);
        setNudgeConfig(legacyScheduleFromProfile(data));
        setVoice({
          toneTags: (data.tone_tags ?? []) as WritingPreferences["toneTags"],
          writingVoice: data.writing_voice ?? "",
        });
        setTimezone(data.timezone || "UTC");
        setNotifications(data.notifications_enabled ?? true);
      }
      setLoading(false);
    });
  }, []);

  async function save() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (notifications) await requestNotificationPermission();

    await supabase
      .from("profiles")
      .update({
        topics,
        tone_tags: voice.toneTags,
        writing_voice: voice.writingVoice.trim(),
        timezone,
        nudge_schedule: nudgeConfig,
        spontaneous_nudges: nudgeConfig.spontaneous,
        spontaneous_jitter_minutes: nudgeConfig.jitterMinutes,
        surprise_nudge_enabled: nudgeConfig.surpriseNudge.enabled,
        notifications_enabled: notifications,
      })
      .eq("id", user.id);

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return <p className="text-ink-muted text-sm">Loading…</p>;
  }

  return (
    <div className="space-y-10 pb-8">
      <h1 className="font-serif text-3xl">Settings</h1>

      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
          Writing themes
        </h2>
        <TopicPicker selected={topics} onChange={setTopics} />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
          Writing voice
        </h2>
        <WritingVoicePicker value={voice} onChange={setVoice} />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
          Nudges
        </h2>
        <p className="text-xs text-ink-muted">Timezone: {timezone}</p>
        <NudgeScheduleEditor config={nudgeConfig} onChange={setNudgeConfig} />
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={notifications}
            onChange={(e) => setNotifications(e.target.checked)}
            className="rounded border-ink-border"
          />
          <span className="text-sm">Browser reminders (when app is open)</span>
        </label>
      </section>

      <HumanOnlyBanner />

      <button
        type="button"
        onClick={save}
        className="w-full rounded-full bg-ink-fg text-ink-bg py-3.5 font-medium"
      >
        {saved ? "Saved" : "Save changes"}
      </button>
    </div>
  );
}
