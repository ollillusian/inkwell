-- 009_hypotheses.sql — Hypothesis-driven nudge engine (INVISIBLE).
-- A longitudinal, falsifiable evidence index over recurring language/behaviour patterns.
-- NEVER rendered to the user as a claim; it only biases which gentle question a nudge asks.
-- Writes are SERVICE-ROLE ONLY (mirrors nudge_push_log in 008): users get SELECT only.
-- See HYPOTHESIS_NUDGE_ENGINE.md for the full design.

-- ------------------------------------------------------------------------------------------------
-- hypotheses: one row per working guess about the user.
-- ------------------------------------------------------------------------------------------------
create table public.hypotheses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- WHAT the hypothesis is. FULL-STACK INFERRED: deep frameworks included.
  framework text not null check (framework in (
    'language_pattern',
    'narrative_dominant_story',
    'behavioral_pattern',
    'schema_domain',          -- schema-therapy domain (e.g. disconnection/rejection)
    'beck_core_belief',       -- helpless | unlovable | worthless
    'attachment',             -- anxious | avoidant | secure | disorganized
    'emergent'
  )),
  category text,              -- coarse INTERNAL bucket, e.g. 'absolutist_language' | 'unlovable' |
                              -- 'avoidant'. Never rendered to the user.
  statement text not null,    -- observable-pattern phrasing in the user's words. Internal only.
  externalized_label text,    -- narrative name, person-agnostic. Internal only.

  -- LIFECYCLE
  status text not null default 'candidate'
    check (status in ('candidate','active','supported','refuted','retired')),

  -- INVISIBLE MODE: user_stance is kept ONLY for the implicit divergence signal. No UI.
  user_stance text not null default 'unseen'
    check (user_stance in ('unseen','converged','diverged')),

  -- CONFIDENCE — an explicit bounded tally, NEVER a probability, NEVER rendered.
  prior_log_odds      real not null default -1.386,   -- ~p=0.20, capped weak
  evidence_tally      real not null default -1.386,   -- bounded additive convenience only
  supporting_count    int  not null default 0,
  contradicting_count int  not null default 0,
  distinct_evidence_days int not null default 0,
  spontaneous_supporting_days int not null default 0, -- only spontaneous days can promote
  distinct_situation_count int not null default 0,    -- anti-FAE multi-situation gate input

  -- Per-framework confidence ceiling. Deep frameworks (beck/schema/attachment) are capped LOWER
  -- because their inter-annotator ceiling is ~0.63 F1. Set at instantiation from library.ts.
  confidence_ceiling real not null default 1.386,     -- ~p=0.80 for surface frameworks;
                                                      -- deep frameworks seeded ~0.405 (~p=0.60)

  -- FALSIFICATION CONTRACT — set when promoted to 'active'.
  watched_disconfirmers text[] not null default '{}',
  competing_hypothesis_id uuid references public.hypotheses (id) on delete set null,

  -- Per-user adaptive decay + model governance.
  decay_tau_days real not null default 90,
  extractor_model_version text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  activated_at      timestamptz,
  last_evaluated_at timestamptz,
  last_nudged_at    timestamptz,
  resolved_at       timestamptz
);

create index hypotheses_user_status
  on public.hypotheses (user_id, status, evidence_tally desc);

-- ------------------------------------------------------------------------------------------------
-- hypothesis_evidence: one row per quoted evidence event for/against a hypothesis.
-- Invariant: no verbatim quote => no event.
-- ------------------------------------------------------------------------------------------------
create table public.hypothesis_evidence (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references public.hypotheses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,  -- denormalized for RLS
  entry_id uuid references public.entries (id) on delete cascade,
  -- entries has NO version counter (005 added is_draft + updated_at + trigger, not a revision int).
  -- We pin the entries.updated_at this event was extracted from; on edit, re-extraction supersedes
  -- events with an OLDER updated_at. Idempotency keys on (entry_id, entry_updated_at).
  entry_updated_at timestamptz,
  stance text not null check (stance in ('supporting','contradicting')),
  quote text not null,           -- VERBATIM span, NE-redacted before storage. NO QUOTE => NO EVENT.
  situational_context text,      -- FAE counterweight. Empty => weight band downgraded.
  event_type text not null,
  weight_band text not null check (weight_band in ('weak','moderate','strong')),  -- no fabricated LRs
  provenance text not null default 'spontaneous'
    check (provenance in ('spontaneous','prompted')),
  source text not null default 'auto'
    check (source in ('auto','divergence')),   -- 'divergence' = implicit disagreement signal
  created_at timestamptz not null default now(),
  unique (hypothesis_id, entry_id, stance, event_type)   -- dedupe
);

create index hypothesis_evidence_hyp on public.hypothesis_evidence (hypothesis_id);

-- ------------------------------------------------------------------------------------------------
-- hypothesis_nudge_outcomes: per-nudge harm/leading telemetry feeding the kill-switch.
-- ------------------------------------------------------------------------------------------------
create table public.hypothesis_nudge_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hypothesis_id uuid references public.hypotheses (id) on delete set null,
  nudge_delivery_date date not null,
  nudge_prompt_slot text not null,          -- the slot whose content was overridden
  response_entry_id uuid references public.entries (id) on delete set null,
  divergence_score real,                    -- semantic distance of response from implied frame
  response_absolutist_pct real,             -- harm signal
  response_length_delta int,                -- harm signal
  user_engaged boolean,
  created_at timestamptz not null default now()
);

create index hypothesis_nudge_outcomes_user
  on public.hypothesis_nudge_outcomes (user_id, nudge_delivery_date desc);

-- ------------------------------------------------------------------------------------------------
-- RLS — SELECT-only for users. NO insert/update/delete policies: the service-role key bypasses RLS
-- and is the only writer (mirrors nudge_push_log in 008).
-- ------------------------------------------------------------------------------------------------
alter table public.hypotheses enable row level security;
alter table public.hypothesis_evidence enable row level security;
alter table public.hypothesis_nudge_outcomes enable row level security;

create policy "Users read own hypotheses"
  on public.hypotheses for select
  using (auth.uid() = user_id);

create policy "Users read own hypothesis evidence"
  on public.hypothesis_evidence for select
  using (auth.uid() = user_id);

create policy "Users read own hypothesis nudge outcomes"
  on public.hypothesis_nudge_outcomes for select
  using (auth.uid() = user_id);

-- Only hypotheses has updated_at => only it gets the trigger (mirrors nudge_push_log having none).
create trigger hypotheses_updated_at
  before update on public.hypotheses
  for each row execute procedure public.set_updated_at();

comment on table public.hypotheses is
  'Invisible longitudinal evidence index. Never rendered as a claim; biases nudge question selection only.';

-- ------------------------------------------------------------------------------------------------
-- profiles: per-user engine toggle, kill-switch suspension, and monthly LLM budget.
-- ------------------------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists hypothesis_engine_enabled boolean not null default true,
  add column if not exists hypothesis_engine_suspended_until timestamptz,   -- set by the kill-switch
  add column if not exists hypothesis_llm_budget_used int not null default 0, -- monthly Stage-B calls
  add column if not exists hypothesis_llm_budget_month text;                  -- 'YYYY-MM' reset key

comment on column public.profiles.hypothesis_engine_suspended_until is
  'Set by the per-user harm kill-switch; while in the future, hypothesis nudges fall back to the content-blind variety bundle.';
