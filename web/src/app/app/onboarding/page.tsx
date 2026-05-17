"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TopicPicker } from "@/components/TopicPicker";
import { WritingVoicePicker } from "@/components/WritingVoicePicker";
import type { TopicId } from "@/lib/promptEngine";
import { HumanOnlyBanner } from "@/components/HumanOnlyBanner";
import { DEFAULT_NUDGE_SCHEDULE } from "@/lib/nudges";
import type { WritingPreferences } from "@/lib/writingVoice";
import { requestNotificationPermission } from "@/lib/notifications";

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export default function OnboardingPage() {
  const [topics, setTopics] = useState<TopicId[]>([]);
  const [voice, setVoice] = useState<WritingPreferences>({
    toneTags: [],
    writingVoice: "",
  });
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function finish() {
    if (topics.length === 0) return;
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await requestNotificationPermission();

    await supabase
      .from("profiles")
      .update({
        topics,
        tone_tags: voice.toneTags,
        writing_voice: voice.writingVoice.trim(),
        timezone: detectTimezone(),
        onboarding_complete: true,
        notifications_enabled: true,
        nudge_schedule: DEFAULT_NUDGE_SCHEDULE,
        spontaneous_nudges: true,
        spontaneous_jitter_minutes: 45,
        surprise_nudge_enabled: true,
      })
      .eq("id", user.id);

    setLoading(false);
    router.push("/app");
    router.refresh();
  }

  if (step === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="font-serif text-3xl leading-snug">
            What do you want to write about?
          </h1>
          <p className="mt-3 text-ink-muted">
            Pick themes — grief, work, travel, memory. Prompts will follow these.
          </p>
        </div>
        <TopicPicker selected={topics} onChange={setTopics} />
        <button
          type="button"
          disabled={topics.length === 0}
          onClick={() => setStep(1)}
          className="w-full rounded-full bg-ink-fg text-ink-bg py-3.5 font-medium disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="font-serif text-3xl leading-snug">
            How should it feel?
          </h1>
          <p className="mt-3 text-ink-muted">
            Dark, raw, gentle — your choice. AI only writes the prompt; you write
            the answer.
          </p>
        </div>
        <WritingVoicePicker value={voice} onChange={setVoice} />
        <button
          type="button"
          onClick={() => setStep(2)}
          className="w-full rounded-full bg-ink-fg text-ink-bg py-3.5 font-medium"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="font-serif text-3xl">Almost there</h1>
      <HumanOnlyBanner />
      <p className="text-ink-muted text-sm leading-relaxed">
        Nudges use your real local time ({detectTimezone()}). Customize times in
        Settings — before bed, travel, spontaneous moments. Allow notifications
        if you want a buzz.
      </p>
      <button
        type="button"
        onClick={finish}
        disabled={loading}
        className="w-full rounded-full bg-ink-fg text-ink-bg py-3.5 font-medium disabled:opacity-50"
      >
        {loading ? "Setting up…" : "Open my Inkwell"}
      </button>
    </div>
  );
}
