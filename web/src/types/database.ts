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
  hypothesis_engine_enabled: boolean;
  hypothesis_engine_suspended_until: string | null;
  hypothesis_llm_budget_used: number;
  hypothesis_llm_budget_month: string | null;
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

// --- Hypothesis-driven nudge engine (invisible). See HYPOTHESIS_NUDGE_ENGINE.md. ---

export type HypothesisFramework =
  | "language_pattern"
  | "narrative_dominant_story"
  | "behavioral_pattern"
  | "schema_domain"
  | "beck_core_belief"
  | "attachment"
  | "emergent";

export type HypothesisStatus =
  | "candidate"
  | "active"
  | "supported"
  | "refuted"
  | "retired";

export type UserStance = "unseen" | "converged" | "diverged";
export type EvidenceStance = "supporting" | "contradicting";
export type EvidenceWeightBand = "weak" | "moderate" | "strong";
export type EvidenceProvenance = "spontaneous" | "prompted";
export type EvidenceSource = "auto" | "divergence";

export type Hypothesis = {
  id: string;
  user_id: string;
  framework: HypothesisFramework;
  category: string | null;
  statement: string;
  externalized_label: string | null;
  status: HypothesisStatus;
  user_stance: UserStance;
  prior_log_odds: number;
  evidence_tally: number;
  supporting_count: number;
  contradicting_count: number;
  distinct_evidence_days: number;
  spontaneous_supporting_days: number;
  distinct_situation_count: number;
  confidence_ceiling: number;
  watched_disconfirmers: string[];
  competing_hypothesis_id: string | null;
  decay_tau_days: number;
  extractor_model_version: string | null;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  last_evaluated_at: string | null;
  last_nudged_at: string | null;
  resolved_at: string | null;
};

export type HypothesisEvidence = {
  id: string;
  hypothesis_id: string;
  user_id: string;
  entry_id: string | null;
  /** Pins entries.updated_at (entries has no version counter). */
  entry_updated_at: string | null;
  stance: EvidenceStance;
  quote: string;
  situational_context: string | null;
  event_type: string;
  weight_band: EvidenceWeightBand;
  provenance: EvidenceProvenance;
  source: EvidenceSource;
  created_at: string;
};

export type HypothesisNudgeOutcome = {
  id: string;
  user_id: string;
  hypothesis_id: string | null;
  nudge_delivery_date: string;
  nudge_prompt_slot: string;
  response_entry_id: string | null;
  divergence_score: number | null;
  response_absolutist_pct: number | null;
  response_length_delta: number | null;
  user_engaged: boolean | null;
  created_at: string;
};

export type EntryEmbedding = {
  entry_id: string;
  user_id: string;
  embedding: number[];
  model_version: string;
  redacted_text: string;
  created_at: string;
};
