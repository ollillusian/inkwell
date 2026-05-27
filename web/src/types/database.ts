import type { NudgeScheduleConfig } from "@/lib/nudges";

export type Profile = {
  id: string;
  display_name: string | null;
  onboarding_complete: boolean;
  topics: string[];
  morning_time: string;
  midday_time: string;
  evening_time: string;
  notifications_enabled: boolean;
  nudge_schedule: NudgeScheduleConfig | null;
  spontaneous_nudges: boolean;
  spontaneous_jitter_minutes: number;
  nudges_fired: string[];
  surprise_nudge_enabled: boolean;
  tone_tags: string[];
  writing_voice: string;
  timezone: string;
};

export type Entry = {
  id: string;
  user_id: string;
  prompt_text: string;
  prompt_slot: string;
  body: string;
  topics_snapshot: string[];
  written_at: string;
  created_at?: string;
  updated_at?: string;
  is_draft: boolean | null;
};

export type DayStory = {
  id: string;
  user_id: string;
  story_date: string;
  body: string;
  entry_ids: string[];
  created_at: string;
};

export type PeriodStory = {
  id: string;
  user_id: string;
  period_type: "week" | "month";
  period_key: string;
  body: string;
  entry_ids: string[];
  created_at: string;
  updated_at: string;
};

export type TimelineInsight = {
  id: string;
  user_id: string;
  cache_key: string;
  kind: "frame" | "directors_cut";
  body: string;
  created_at: string;
  updated_at: string;
};
