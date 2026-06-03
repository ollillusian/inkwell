# Inkwell — Hypothesis-Driven Nudge Engine — BUILD SPEC (v3, FULLY INVISIBLE / FULL-STACK-INFERRED / FULL-EGRESS)

> **Status:** design + build spec, adversarially verified against the codebase (every line anchor below was confirmed by a reviewer reading the real files). Three high-severity build-breakers in the first draft were corrected here: (1) there is **one** migration tree, not two parallel mirrors; (2) `zod` is **not** a dependency and must be added; (3) `entries` has **no `entry_version` column** — idempotency/edit-supersede keys on the existing `entries.updated_at` instead.

> **Scope of this spec vs. the hardened design (`/tmp/hyp_final.md`).** The spine is reused verbatim: falsification-in-the-data-model, two un-nettable ledgers, verbatim-quote-or-no-event, the explicit bounded tally (NOT fabricated LRs), per-user adaptive decay, and the `getDailyPrompt` reserved-id chokepoint. Three things are **re-targeted** by the chosen config and are load-bearing changes from the hardened doc:
> 1. **FULLY INVISIBLE** — the user never sees a hypothesis as a claim. There is no correction UI, no "Patterns I'm seeing" screen, no `'belief'` graph node. Hardened-doc §4.5 (user-stance UI) and §6 (surfacing screens) are **dropped**. The one-tap falsification signal is **gone**, so falsification now rests entirely on three instruments: (a) the corpus disconfirmation scan, (b) the response-divergence metric, (c) the per-user harm kill-switch. These three are central in §5 and §8 below.
> 2. **FULL-STACK INFERRED** — `beck_core_belief`, `schema_domain`, `attachment` are **re-added** to the framework enum, inferred and stored. Every accuracy counterweight the critique demanded stays: confidence capped low (~0.63 F1 ceiling), the FAE situational counterweight is mandatory, multi-situation promotion gate stays. The safety story is structural: a wrong deep inference only ever shapes a **gentle open question**, never a stated claim — because the engine is invisible.
> 3. **FULL EGRESS** — the LLM extractor runs on **every published entry**. No Stage-A/Stage-B consent gate. Consequences in §1.2: the schema privacy comment is now FALSE and is a fix task; ~8–12 LLM calls/entry is a real cost step-change handled by async + M=5-where-it-matters + per-user monthly budget cap + the shared `modelClient`. Stage-A lexical stays as a cheap cross-check/prior, no longer gating egress.

---

## 1. Engineering consequences of the chosen config

### 1.1 Lost correction signal → falsification rests on scan + divergence + kill-switch
Because the engine is fully invisible, there is no "That's not me / Close, but…" affordance — so the highest-signal datum the hardened design relied on (the user, in their own words, per critique `strongestIdeas[5]`) **does not exist in this build**. Falsification load shifts entirely onto three mechanical instruments that need no UI: (a) the **dedicated corpus disconfirmation scan** (`updateLoop.ts`, §5) that actively searches each new entry for evidence *against* every active hypothesis using `watched_disconfirmers`; (b) the **response-divergence metric** (`hypothesis_nudge_outcomes.divergence_score`, §8.1) — when a user's response to a hypothesis-shaped nudge semantically diverges from the nudge's implied frame, that divergence is treated as implicit disconfirmation and decrements the tally; (c) the **per-user harm kill-switch** (§8.3) that auto-suspends the whole engine for a user when nudges correlate with worsening. The `user_stance` column survives **only** as far as the divergence signal needs it (values collapse to `unseen` / `diverged` / `converged`), never as a UI state.

### 1.2 Full egress → cost + schema-comment correction + modelClient
The extractor running on every published entry makes `supabase/migrations/001_inkwell_schema.sql:19` — `-- Journal entries (your words only — never sent to any LLM)` — **factually false**. Correcting that comment (single tree; see §2.5) is a required task, not a nicety. The cost change is real: M=5 self-consistency + 3-stage DoT + embedding + disconfirmation scan is ~8–12 model calls per published entry vs. today's 1 cheap `gpt-4o-mini` call. This is absorbed by (1) keeping inference **fully async/post-publish** so that, **once the async loop has pre-populated the slot**, `dispatchDueNudge` (`nudgeDispatch.ts:80`) is a pure cache read — note this is only true for precomputed slots: on a cache miss `getDailyPrompt` still calls the LLM at fire time (`getDailyPrompt.ts:88-113`), so pre-population (M17) is what keeps the fire path fast, with a content-blind fallback (§7.4) when a slot wasn't precomputed in time; (2) applying **M=5 only to span/label stability inside the extractor** and M=1 everywhere else; (3) a **per-user monthly Stage-B budget cap** (`profiles.hypothesis_llm_budget_used`) that downgrades to lexical-only when exceeded; (4) building the codebase's first shared **`modelClient`** (§3) because the extractor is reliability-critical and today every generator (`generatePrompt.ts:74-118`, `generatePeriodStory.ts:80`, `generateTimelineInsight.ts:45`) is plain-text-with-`try/catch→null` and has zero retry/timeout/schema validation. The Stage-A local lexical pass (`lexical.ts`, §4.3) is kept as a cheap deterministic prior and cross-check (catches what the LLM misses, and gives the absolutist within-person trend a non-LLM home) — it just no longer gates egress.

### 1.3 Deep inference → capped confidence + mandatory FAE counterweight + invisible-makes-it-safer
Re-adding `beck_core_belief`, `schema_domain`, `attachment` re-imports the critique's accuracy hazard: these are the least surface-observable constructs, below the ~0.63 human inter-annotator F1 ceiling, and attachment-from-solo-diary is a textbook fundamental-attribution-error trap (`clinicalAccuracyIssues[0,1]`). The counterweights are therefore **non-negotiable and enforced in code, not copy**: (a) `evidence_tally` for these deep frameworks is hard-capped lower than for `language_pattern`/`narrative_dominant_story` (a per-framework `confidence_ceiling`, §2.2); (b) the DoT chain's **stage 3 situational-vs-dispositional** step is mandatory and the weight band is downgraded one notch if no situational alternative was recorded (`situational_context` is NOT-NULL-in-spirit, §4.4); (c) the **multi-situation promotion gate** (≥2 distinct `situational_context` types) stays. The safety story that makes this tolerable in this config: **because the engine is invisible, a wrong deep inference can only ever bias which gentle open question gets asked** ("when closeness grows, what tends to happen next?") — it can never be rendered as a claim ("you have an avoidant attachment style"). The deep frameworks bias *question selection*; they are never *spoken*.

---

## 2. Data model & migrations

> **Migration trees (verified).** There is **one** source-of-truth migration tree: `supabase/migrations/` (`001`–`008`). The `web/supabase/migrations/` directory is **not** a parallel mirror — it contains only `003_timeline_insights.sql` and `008_push_subscriptions.sql`, the numbers collide with the main tree (main `003` = travel_daily, web `003` = timeline_insights), and it has no `001`–`007`, so it cannot apply `009`/`010` standalone (they reference `auth.users`/`public.entries`/`public.profiles`/`set_updated_at` that the web tree never creates). **Add new migrations only to `supabase/migrations/`.** Before shipping, decide whether the web tree is still used by any deploy path (see `DEPLOY.md`/`RAILWAY.md`); if it is, bringing it to parity is a separate prerequisite, not part of this feature.

### 2.1 `supabase/migrations/009_hypotheses.sql`

Skeleton copied from `006_day_stories.sql` (UUID PK, `user_id` FK cascade, dual timestamps, `set_updated_at` trigger), enum-via-CHECK from `007_period_stories.sql`, and the **service-role-only write** RLS shape from `008_push_subscriptions.sql` `nudge_push_log` (SELECT policy only, no insert/update/delete). `set_updated_at()` already exists globally (`001_inkwell_schema.sql:110-118`) — attach, do not redefine.

```sql
-- 009_hypotheses.sql — longitudinal evidence index: falsifiable, user-co-owned observations
-- about recurring language/behavior patterns. INVISIBLE engine: never rendered as a claim.
-- Writes are SERVICE-ROLE ONLY (mirror nudge_push_log in 008). Users get SELECT only.

create table public.hypotheses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- WHAT the hypothesis is. FULL-STACK INFERRED: deep frameworks re-added vs hardened doc.
  framework text not null check (framework in (
    'language_pattern',
    'narrative_dominant_story',
    'behavioral_pattern',
    'schema_domain',          -- re-added: schema-therapy domain (e.g. disconnection/rejection)
    'beck_core_belief',       -- re-added: helpless | unlovable | worthless
    'attachment',             -- re-added: anxious | avoidant | secure | disorganized
    'emergent'
  )),
  category text,              -- coarse internal bucket, e.g. 'absolutist_language' | 'unlovable'
                              -- | 'avoidant'. NEVER rendered to the user (invisible engine).
  statement text not null,    -- observable-pattern phrasing in the user's words. Internal only.
  externalized_label text,    -- narrative name, person-agnostic. Internal only.

  -- LIFECYCLE
  status text not null default 'candidate'
    check (status in ('candidate','active','supported','refuted','retired')),

  -- INVISIBLE-MODE: user_stance kept ONLY for the implicit divergence signal (§5). No UI.
  user_stance text not null default 'unseen'
    check (user_stance in ('unseen','converged','diverged')),

  -- CONFIDENCE — explicit bounded tally, NEVER a probability, NEVER rendered.
  prior_log_odds      real not null default -1.386,   -- ~p=0.20, capped weak
  evidence_tally      real not null default -1.386,   -- bounded additive convenience ONLY
  supporting_count    int  not null default 0,
  contradicting_count int  not null default 0,
  distinct_evidence_days int not null default 0,
  spontaneous_supporting_days int not null default 0, -- only spontaneous days promote
  distinct_situation_count int not null default 0,    -- anti-FAE multi-situation gate input

  -- PER-FRAMEWORK confidence ceiling. Deep frameworks (beck/schema/attachment) capped LOWER
  -- because their inter-annotator ceiling is ~0.63 F1. Set at instantiation from library.ts.
  confidence_ceiling real not null default 1.386,     -- ~p=0.80 max for surface frameworks;
                                                      -- deep frameworks seeded ~0.405 (~p=0.60)

  -- FALSIFICATION CONTRACT — set when promoted to 'active'
  watched_disconfirmers text[] not null default '{}',
  competing_hypothesis_id uuid references public.hypotheses (id) on delete set null,

  -- per-user adaptive decay + model governance
  decay_tau_days real not null default 90,
  extractor_model_version text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  activated_at    timestamptz,
  last_evaluated_at timestamptz,
  last_nudged_at  timestamptz,
  resolved_at     timestamptz
);

create index hypotheses_user_status on public.hypotheses (user_id, status, evidence_tally desc);

create table public.hypothesis_evidence (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references public.hypotheses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,  -- denormalized for RLS
  entry_id uuid references public.entries (id) on delete cascade,
  -- entries has NO version counter (005 added is_draft + updated_at + trigger, not a revision int).
  -- We pin the entries.updated_at this event was extracted from; re-extraction on edit supersedes
  -- events with an OLDER updated_at (see §5). Idempotency keys on (entry_id, entry_updated_at).
  entry_updated_at timestamptz,
  stance text not null check (stance in ('supporting','contradicting')),
  quote text not null,           -- VERBATIM span, NE-redacted (§6.2). NO QUOTE => NO EVENT (invariant).
  situational_context text,      -- MANDATORY-in-spirit FAE counterweight. Empty => band downgraded.
  event_type text not null,
  weight_band text not null check (weight_band in ('weak','moderate','strong')),  -- NO fabricated LRs
  provenance text not null default 'spontaneous' check (provenance in ('spontaneous','prompted')),
  source text not null default 'auto' check (source in ('auto','divergence')),  -- 'divergence' = §5 implicit
  created_at timestamptz not null default now(),
  unique (hypothesis_id, entry_id, stance, event_type)   -- dedupe
);

create index hypothesis_evidence_hyp on public.hypothesis_evidence (hypothesis_id);

create table public.hypothesis_nudge_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hypothesis_id uuid references public.hypotheses (id) on delete set null,
  nudge_delivery_date date not null,
  nudge_prompt_slot text not null,          -- the slot whose content was overridden (§7.4)
  response_entry_id uuid references public.entries (id) on delete set null,
  divergence_score real,                    -- semantic distance of response from implied frame (§8.1)
  response_absolutist_pct real,             -- harm signal
  response_length_delta int,                -- harm signal
  user_engaged boolean,
  created_at timestamptz not null default now()
);

-- ---- RLS + triggers (skeleton copied from 006/007; write-policy shape from 008 nudge_push_log) ----
alter table public.hypotheses enable row level security;
alter table public.hypothesis_evidence enable row level security;
alter table public.hypothesis_nudge_outcomes enable row level security;

-- SELECT-ONLY policies. Deliberately NO insert/update/delete: service-role key bypasses RLS.
create policy "Users read own hypotheses" on public.hypotheses
  for select using (auth.uid() = user_id);
create policy "Users read own hypothesis_evidence" on public.hypothesis_evidence
  for select using (auth.uid() = user_id);
create policy "Users read own hypothesis_nudge_outcomes" on public.hypothesis_nudge_outcomes
  for select using (auth.uid() = user_id);

create trigger hypotheses_updated_at before update on public.hypotheses
  for each row execute procedure public.set_updated_at();
-- hypothesis_evidence / hypothesis_nudge_outcomes have no updated_at => no trigger (mirror nudge_push_log).

comment on table public.hypotheses is
  'Invisible longitudinal evidence index. Never rendered as a claim; biases nudge question selection only.';
```

> Note: `hypothesis_evidence` and `hypothesis_nudge_outcomes` deliberately have **no `updated_at`** (mirrors `nudge_push_log` in 008 having only `sent_at`) so they get no trigger. The `entry_ids uuid[]` array idiom from 006/007 is **not** used here — evidence needs per-row `entry_updated_at`/`quote`/`band`, so the relational child-table pattern (`period_stories`-style) is correct.

### 2.2 Per-user Stage-B budget column — extend `profiles` (in 009 or a small 011)

Mirror `002_flexible_nudges.sql` `add column if not exists` idiom:

```sql
alter table public.profiles
  add column if not exists hypothesis_engine_enabled boolean not null default true,
  add column if not exists hypothesis_engine_suspended_until timestamptz,  -- set by kill-switch (§8.3)
  add column if not exists hypothesis_llm_budget_used int not null default 0,  -- monthly Stage-B calls
  add column if not exists hypothesis_llm_budget_month text;                   -- 'YYYY-MM' reset key
```

### 2.3 `supabase/migrations/010_entry_embeddings.sql` — pgvector for unique-outcome retrieval

The unique-outcome flagship ("resurface the contradicting entry from 4 months ago") needs real retrieval infra; migrations 001–008 have **no pgvector** (`feasibilityConcerns[5]`, verified). `pgcrypto` is the only extension created so far (`001:3`), so this adds a second.

```sql
-- 010_entry_embeddings.sql — vector index for unique-outcome retrieval. Service-role write only.
create extension if not exists vector;

create table public.entry_embeddings (
  entry_id uuid primary key references public.entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,  -- denormalized for RLS + filter
  embedding vector(1536) not null,        -- text-embedding-3-small dim; pin in model_version
  model_version text not null,            -- drift detection; re-embed on change
  redacted_text text not null,            -- NE-redacted excerpt actually embedded (§6.2)
  created_at timestamptz not null default now()
);

-- IVFFlat index; cosine distance to match OpenAI embeddings. Per-user filter applied in query.
create index entry_embeddings_vec on public.entry_embeddings
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index entry_embeddings_user on public.entry_embeddings (user_id);

alter table public.entry_embeddings enable row level security;
create policy "Users read own entry_embeddings" on public.entry_embeddings
  for select using (auth.uid() = user_id);
-- no insert/update/delete policy: service-role only.
```

### 2.4 TypeScript types — append to `web/src/types/database.ts` after line 63 (current EOF, after `TimelineInsight`)

Follow the file's hand-written, snake_case, CHECK-enum-as-string-literal-union idiom (e.g. `PeriodStory.period_type: "week" | "month"` at line 47). There is no generated `Database` type; each row is a standalone `export type`. (Minor: `database.ts:1` already imports from `@/lib/nudges`; keep the new hypothesis types self-contained — do not have `web/src/lib/hypotheses/*` import `database.ts` in a way that re-imports `@/lib/nudges` to avoid a cycle.)

```ts
// --- Hypothesis engine (invisible). Appended after TimelineInsight (line 63). ---
export type HypothesisFramework =
  | "language_pattern" | "narrative_dominant_story" | "behavioral_pattern"
  | "schema_domain" | "beck_core_belief" | "attachment" | "emergent";
export type HypothesisStatus = "candidate" | "active" | "supported" | "refuted" | "retired";
export type UserStance = "unseen" | "converged" | "diverged";
export type EvidenceStance = "supporting" | "contradicting";
export type EvidenceWeightBand = "weak" | "moderate" | "strong";
export type EvidenceProvenance = "spontaneous" | "prompted";

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
  entry_updated_at: string | null;   // pins entries.updated_at (no version counter exists)
  stance: EvidenceStance;
  quote: string;
  situational_context: string | null;
  event_type: string;
  weight_band: EvidenceWeightBand;
  provenance: EvidenceProvenance;
  source: "auto" | "divergence";
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
```

### 2.5 Schema-comment correction (required task, config consequence 1.2)

Edit `supabase/migrations/001_inkwell_schema.sql:19` **only** (the web migration tree has no `001` — see the §2 migration-trees note). Replace:
```sql
-- Journal entries (your words only — never sent to any LLM)
```
with:
```sql
-- Journal entries. NOTE: as of migration 009, published entry text is sent to an LLM
-- (OpenAI) by the async hypothesis-evidence extractor (web/src/lib/llm/extractEvidence.ts)
-- and the embedding job (010). Quotes stored in hypothesis_evidence are NE-redacted first.
```

---

## 3. The shared model client — `web/src/lib/llm/modelClient.ts`

This is the codebase's first JSON-schema-validated, version-pinned, retried/timed-out call. Today three identical private `openaiClient()` factories exist (`generatePrompt.ts:17-21`, `generateTimelineInsight.ts:4-8`, `generatePeriodStory.ts:11-15`), each `new OpenAI({ apiKey })` with no timeout/retry/baseURL, and every call parses plain text with a min-length guard (`feasibilityConcerns[1]`, verified). `modelClient` is built **starting from that factory** but adds the missing reliability layer.

> **Prerequisites (verified gaps):**
> - **`zod` is not a dependency** — `web/package.json` lists `openai ^6.38.0` and no `zod`. Add `zod` (task M0) before M6/M10, or the `ZodSchema` import below will not resolve.
> - **Verify the OpenAI v6 SDK surface** once `node_modules` is installed: confirm `openai@^6.38.0` exposes `chat.completions.create({ response_format: { type: "json_schema", json_schema: {...} } })`. The v6 SDK may prefer the **Responses API** over Chat Completions, which would change `callStructured`'s implementation (and possibly let you drop `zod` in favor of the SDK's native parsed structured outputs — but keep a runtime validator either way).

```ts
// web/src/lib/llm/modelClient.ts
import OpenAI from "openai";
import type { ZodSchema } from "zod";  // PREREQ: add `zod` to web/package.json (task M0)

// Pinned, dated snapshots — replaces the unpinned `process.env.OPENAI_MODEL ?? "gpt-4o-mini"`
// pattern. extractor_model_version is written from EXTRACTOR_MODEL into hypotheses rows (drift, §8.5).
export const EXTRACTOR_MODEL = process.env.OPENAI_EXTRACTOR_MODEL ?? "gpt-4o-mini-2024-07-18";
export const EMBEDDING_MODEL  = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

// Singleton — the ONE place the SDK is constructed once the 3 inline copies are migrated.
let _client: OpenAI | null = null;
function client(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!_client) _client = new OpenAI({ apiKey: key, timeout: 20_000, maxRetries: 0 }); // we own retry
  return _client;
}

export type StructuredCallOptions<T> = {
  system: string;
  user: string;
  schema: ZodSchema<T>;        // validated output contract
  model?: string;             // defaults EXTRACTOR_MODEL
  temperature?: number;
  maxTokens?: number;
  jsonSchemaName: string;     // for response_format json_schema
  retries?: number;           // default 2 (=> up to 3 attempts)
  timeoutMs?: number;         // default 20_000
};

export type StructuredResult<T> =
  | { ok: true; data: T; modelVersion: string; attempts: number }
  | { ok: false; error: "no_client" | "timeout" | "invalid_json" | "schema_violation" | "api_error"; attempts: number };

// JSON-schema-validated, version-pinned, retried/timed-out call. Uses chat.completions with
// response_format: { type: "json_schema", json_schema: {...} } (NOT the bare Chat Completions
// plain-text path the existing generators use) — pending the SDK-surface check above. On every
// failure mode: bounded retry with jittered backoff, then a typed error — NEVER a silent null
// that the caller can't distinguish.
export async function callStructured<T>(opts: StructuredCallOptions<T>): Promise<StructuredResult<T>> { /* ... */ }

// Plain-text variant so the 3 existing generators can migrate onto the shared client without
// changing their plain-text contract (keeps their try/catch->null behavior but gains timeout+retry).
export async function callText(opts: { system: string; user: string; model?: string;
  temperature?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number;
  maxTokens: number; retries?: number; timeoutMs?: number; }): Promise<string | null> { /* ... */ }

// Embeddings for migration 010 retrieval (§6).
export async function embed(text: string): Promise<{ embedding: number[]; modelVersion: string } | null> { /* ... */ }
```

**Migration path:** `extractEvidence.ts` and `generateHypothesisNudge.ts` use `callStructured` / `callText` from day one. The three legacy generators keep working unchanged; a later cleanup task points their factory at `modelClient.client()` to delete the three duplicate `openaiClient()` definitions. The ban list / `sanitizeStoryProse` rule sources stay where they are; `modelClient` does not reconcile the three rule constants — it only owns transport + validation.

---

## 4. The evidence extractor — `web/src/lib/llm/extractEvidence.ts`

Mirrors the call-composition shape of `generatePrompt.ts:74-118` (system+user message build from voice helpers) but calls `modelClient.callStructured` instead of the plain-text path. The DoT chain runs as a **single call with a structured 3-section output** (cheaper than 3 calls; the three stages are sections of one JSON object), then the M=5 stability pass re-samples that one call.

### 4.1 Output JSON contract (validated by `modelClient` via Zod)

```ts
// Zod schema passed to callStructured. One object per call.
const ExtractionSchema = z.object({
  // STAGE 1 — fact vs interpretation: only spans the model can quote verbatim
  spans: z.array(z.object({
    quote: z.string().min(1),            // MUST be a verbatim substring of the entry (post-validated, §4.4)
    is_fact: z.boolean(),                // fact (what happened) vs interpretation (what user concluded)
  })),
  // STAGE 2 — for AND against, per candidate event
  events: z.array(z.object({
    quote: z.string().min(1),            // verbatim; no quote => dropped
    framework: z.enum([
      "language_pattern","narrative_dominant_story","behavioral_pattern",
      "schema_domain","beck_core_belief","attachment","emergent"]),
    category: z.string(),                // internal coarse bucket
    stance: z.enum(["supporting","contradicting"]),
    evidence_for: z.string(),            // why it supports
    evidence_against: z.string(),        // MANDATORY contrastive — empty => band capped 'weak'
    // STAGE 3 — situational vs dispositional (FAE counterweight)
    situational_context: z.string(),     // e.g. "after a deadline + poor sleep"; empty => band downgraded
    is_situational_alternative_considered: z.boolean(),
  })),
});
```

### 4.2 The 3-stage Diagnosis-of-Thought chain (system prompt structure)
- **Stage 1 — fact vs interpretation.** Force the model to separate what the user *reports happened* from what they *concluded about themselves*. Only the interpretation layer can seed `narrative`/`beck`/`schema`/`attachment` events; pure facts seed at most `behavioral_pattern`.
- **Stage 2 — evidence FOR and AGAINST.** Every event must carry both `evidence_for` and `evidence_against`. If `evidence_against` is empty/trivial, the band is hard-capped to `weak` in post-processing (an event the model couldn't argue against is an over-eager label — `feasibilityConcerns[2]`: quote-required stops fabricated spans, not fabricated interpretation).
- **Stage 3 — situational vs dispositional.** Mandatory for the deep frameworks (`beck_core_belief`, `schema_domain`, `attachment`) per consequence 1.3. The model must propose a situational explanation; `is_situational_alternative_considered=false` or empty `situational_context` ⇒ band downgraded one notch in post-processing.

### 4.3 Stage-A local lexical sensor — `web/src/lib/hypotheses/lexical.ts` (deterministic QUANTITATIVE cross-check only)

> **Design decision (revised):** the lexical pass does **not** detect self-critical *content*. Regex phrase-matching ("I'm a failure", "my fault") is too brittle to be a real detector and, given the chosen full-egress config, redundant. **The LLM extractor (§4.2) is the sole source of evidence events and quotes.** The lexical pass is kept only for what code does better than an LLM: a few cheap, reproducible **counting** signals that act as an independent cross-check on the LLM (anti-sycophancy/anti-hallucination) and as a within-person trend the LLM can't quantify consistently.

Deterministic, no egress, runs on every entry. It needs its **own** tokenizer rather than reusing `themeAnalysis.ts` `tokenizeBody`/`STOPWORDS`, because that tokenizer drops tokens we count here: `should` is in `STOPWORDS` (`themeAnalysis.ts:49`), and `I`/`me` are removed by the ≥3-char length guard. (Note: `always` is *not* stopworded and *would* survive `themeAnalysis`'s tokenizer.)

```ts
export type LexicalSignals = {
  absolutist_rolling_pct: number;     // within-person windowed trend (Al-Mosaiwi & Johnstone). NO per-entry spike.
  absolutist_entry_pct: number;       // this entry only, for trend comparison
  first_person_singular_density: number;
  past_focus_ratio: number;
};
export function lexicalSignals(entryBody: string, recentBodies: string[]): LexicalSignals { /* ... */ }
```
Critical: there is **no `absolutist_spike` per-entry event type** — absolutist language only ever contributes as a within-person rolling trend (`clinicalAccuracyIssues[4]`). It is a *signal that cross-checks LLM judgments*, never itself an evidence event. (Emotion/valence detection also moves to the LLM — a word-list valence proxy is worse than the model at sentiment.)

### 4.4 Verbatim-quote invariant + M=5 self-consistency (with honest caveat)

- **Invariant (post-validation, code-enforced, not prompt-enforced):** after the structured call returns, each `event.quote` is checked to be a **literal substring** of the entry body (whitespace-normalized). Any event whose quote is not found is **dropped** — no quote, no event. This is the cheapest anti-hallucination/anti-Barnum mechanism (`strongestIdeas[1]`).
- **M=5 self-consistency** is applied **only here** (cost control, consequence 1.2): call `callStructured` 5× with different seeds/temperatures; keep only events whose `(quote, framework, stance)` triple appears in a **majority** of samples; derive the `weight_band` from **cross-sample agreement frequency** (3/5 → weak, 4/5 → moderate, 5/5 → strong), then apply the downgrades from §4.2 (no `evidence_against` ⇒ weak; no situational alt ⇒ −1 band). **Never** use the model's self-reported confidence (verbalized confidence is miscalibrated, ECE up to 0.37).
- **Honest caveat, kept in a code comment in `extractEvidence.ts`:** *"M=5 is NOT an independent ensemble. Five seeded passes of one model are not five judges (single-LLM interrater ~0.37 vs human team ~0.72). Its only job is suppressing unstable spans and over-eager labels. Judgment reliability is not bought here — which is why `evidence_tally` is capped low forever via `confidence_ceiling`, and why nothing is ever rendered as a claim."* (`feasibilityConcerns[4]`, consequence 1.3.)

---

## 5. The update loop — `web/src/lib/hypotheses/updateLoop.ts`

Runs **async, post-publish** (queue consumer, not the per-minute GET cron). Idempotent on `(entry_id, entry_updated_at)`. Reads existing theme signals as candidate-generation input. Full pseudocode:

```
async function runUpdateLoop(entryId, entryUpdatedAt):       # entryUpdatedAt = entries.updated_at (no version col)
  profile = loadProfile(userId)
  # --- KILL-SWITCH / GATES (checked FIRST) ---
  if !profile.hypothesis_engine_enabled
     or profile.hypothesis_engine_suspended_until > now(): return         # §8.3
  if crisisClassifier(entry) is HIT: suppressEngineForUser(); return       # §8.4, runs BEFORE engine

  # --- IDEMPOTENCY + EDIT SUPERSEDE (no version counter: key on updated_at) ---
  if already_processed(entryId, entryUpdatedAt): return                    # idempotent on updated_at
  txn:
    deleteEvidence where entry_id=entryId AND entry_updated_at < entryUpdatedAt  # supersede older extraction

  # --- CANDIDATE GENERATION from EXISTING theme substrate (reuse, don't rebuild) ---
  corpus       = recentEntriesForUser(userId)
  graph        = buildDayThemeGraph(corpus, profileTopics, { priorTopicWeights })  # themeGraph.ts:241
  ctx          = graph.context                          # GraphContext: trends/strongestBond/excerpts
  digest       = buildThemeWritingDigest(timelineSteps, profileTopics)             # quietTopicLabels
  eras         = detectTimelineEras(timelineSteps)                                  # themeEras.ts:26
  # signals -> candidate language/narrative/behavioral hypotheses:
  #   ctx.trends[topic] === 'growing'      => escalation candidate
  #   ctx.strongestBond[topic]             => associative-structure candidate
  #   digest.quietTopicLabels              => avoidance candidate
  #   eras boundary (Jaccard < 0.38)       => scope candidate to a chapter + faster decay_tau

  # --- QUANTITATIVE CROSS-CHECK (Stage A: local, deterministic, no egress, NOT events) ---
  signals = lexicalSignals(entry.body, recentBodies)     # absolutist trend + densities only

  # --- EVIDENCE EXTRACTION (Stage B LLM: the SOLE source of evidence events + verbatim quotes) ---
  events = []
  if withinMonthlyBudget(profile):
      events = extractEvidence(entry, voice)             # DoT + M=5 + verbatim-quote invariant
      events = crossCheckAgainstSignals(events, signals) # discount LLM claims the counts don't support
      incrementBudget(profile)
  # else: no new evidence this entry (budget cap, §1.2)

  # --- DEDICATED DISCONFIRMATION SCAN (load-bearing in invisible mode, §1.1) ---
  for each ACTIVE/SUPPORTED H of user:
      events += scanForContradiction(entry, H.watched_disconfirmers)   # actively search AGAINST H
      # this scan, NOT a user tap, is the primary falsification source now

  # --- APPLY EVENTS ---
  for ev in events:
      band = bandFrom(ev)                                # 'weak'|'moderate'|'strong' (NOT a fabricated LR)
      # ASYMMETRY: contradicting evidence weighted one band higher than same-strength support
      # FAE DISCOUNT: if ev recurs only within ONE situational_context type, downgrade one band
      if matchesLibraryTemplate(ev) and no row yet and ev.stance=='supporting'
         and band>='moderate' and ev.provenance=='spontaneous':
          H = instantiate(template, confidence_ceiling = template.ceiling)   # deep frameworks: low ceiling
      insertEvidence(H, entryId, entryUpdatedAt, ev.stance, ev.quote,
                     ev.situational_context, band, ev.provenance)            # quote NOT NULL invariant
      applyBoundedTallyStep(H, band, ev.stance)          # clamp per-entry (one bad day can't mint a belief)
      H.evidence_tally = min(H.evidence_tally, H.confidence_ceiling)         # CAP — never exceeds ceiling
      bumpCounts(H, ev)
      if ev.stance=='supporting' and newDistinctDay:
          H.distinct_evidence_days += 1
          if ev.provenance=='spontaneous': H.spontaneous_supporting_days += 1   # only these promote
      H.distinct_situation_count = countDistinctSituations(H)

  # --- PROMOTION GATE (provenance-aware, multi-situation, competing-required) ---
  for CANDIDATE H:
      if H.evidence_tally > UPPER
         and H.spontaneous_supporting_days >= 3                 # prompted echoes excluded
         and H.distinct_situation_count   >= 2                  # anti-FAE (esp. deep frameworks)
         and exists competing_hypothesis(H):
            require H.watched_disconfirmers non-empty else stay 'candidate'
            H.status='active'; H.activated_at=now()

  # --- DEMOTION / FALSIFICATION (hysteresis: easier to fall than rise) ---
  for ACTIVE/SUPPORTED H:
      if H.evidence_tally < DEMOTE: H.status='candidate'
      if H.evidence_tally < RETIRE and competingBetterExplains(H):
            H.status='refuted'; H.resolved_at=now()             # archive, never delete

  # --- PER-USER ADAPTIVE DECAY ---
  for H:
      H.decay_tau_days = adaptTau(userWritingCadence, eraOf(H), eras)   # era-scoped, per-user
      H.evidence_tally += decayToward(H.prior_log_odds,
                            exp(-daysSinceLastEvidence(H) / H.decay_tau_days))
      H.last_evaluated_at = now()
```

**Divergence as falsification (replaces the lost user tap, §1.1).** A separate path, triggered when a *response* entry to a hypothesis-shaped nudge arrives (matched via `hypothesis_nudge_outcomes.response_entry_id`): compute `divergence_score` (§8.1); if high, insert a `contradicting` evidence row with `source='divergence'` and a `weak`/`moderate` band, decrementing the tally. This is the only "user disagrees" signal that exists in invisible mode, and it is implicit and inferred, never a tap.

**Deployment note (verified gap).** There is **no existing async-queue host** — today's only scheduler is the per-minute `GET /api/cron/send-nudges` (`web/src/app/api/cron/send-nudges/route.ts`), pinged externally (`web/scripts/ping-nudges-cron.mjs`; no `vercel.json`/`railway` cron file in-repo). The update loop and kill-switch need a queue/worker or a second cron entrypoint — name and provision it explicitly. Also heed `web/AGENTS.md`: this is a **non-standard Next.js** fork with breaking API/convention changes; check its guidance (and `node_modules/next/dist/docs`) before adding any route/cron wiring rather than assuming stock Next.js patterns.

---

## 6. Unique-outcome retrieval + named-entity redaction

### 6.1 pgvector-powered resurfacing
On each published entry the async job calls `modelClient.embed(redactedExcerpt)` and upserts `entry_embeddings` (migration 010). For an active negative self-story hypothesis (e.g. `narrative_dominant_story`, statement "I never follow through"), `scanForContradiction` builds a query embedding from the **inverse/disconfirmer phrasing** (drawn from `watched_disconfirmers`, e.g. "finished, shipped, followed through, completed") and runs a per-user cosine-distance search:
```sql
select entry_id, redacted_text from public.entry_embeddings
where user_id = $1 order by embedding <=> $2 limit 5;
```
The top contradicting entries ("Mar 3 finished the training; Apr 12 shipped") become the disconfirmer set fed to the nudge generator. The `model_version` column gates re-embedding when `EMBEDDING_MODEL` changes (drift).

### 6.2 Named-entity redaction pass (before storage AND before embedding)
The verbatim `quote` mandate means third-party names land in the quote column (`safetyEthicsRedFlags[6]`). A redaction pass — `web/src/lib/hypotheses/redact.ts`, `redactThirdParties(text): string` — rewrites proper nouns of non-user persons to role tokens (`[a colleague]`, `[a friend]`) **before** (a) any `quote` is written to `hypothesis_evidence`, (b) any `redacted_text` is embedded into `entry_embeddings`. Evidence whose only signal is *about* a third party (not the user) is not stored as a hypothesis about the user. Because the engine is invisible, nudges already reflect patterns not people, so the redacted form is sufficient for the only consumer (the nudge generator).

---

## 7. The nudge generator — `web/src/lib/llm/generateHypothesisNudge.ts`

### 7.1 Voice reuse (verbatim)
Reuses, exactly as `generatePrompt.ts` does: system message = `systemPromptForVoice(voice)` (`writingVoice.ts:63`), user message includes `buildVoiceBrief(voice)` (`writingVoice.ts:46`, may return `""` — replicate the `voiceBrief || fallback` guard from `generatePrompt.ts:93`) and `PLAIN_SPEECH_USER_REMINDER` (`promptStyle.ts:58`). Calls `modelClient.callStructured` (output: `{ nudge_text, guided_discovery_move }`) so the post-gate can run on validated fields.

### 7.2 Guided-discovery copy contract (generation invariants)
- **Disconfirmer-led, NOT belief-led.** The negative belief is never restated as the setup line. Preferred template: *"Back on Mar 3 you wrote about finishing the training, and Apr 12 about shipping — when you read those now, what do they say about you?"* The disconfirmer entries from §6.1 are the frame.
- **Litmus, in generator rules AND post-gate:** *"Would any honest answer satisfy this question equally?"* If a specific answer would "confirm" the hypothesis, regenerate.
- **Calibrated hedge to evidence:** thin evidence → "I'm noticing something I'm not sure about…"; multi-day/multi-situation → "this has come up a few times — does it fit?". Deep-framework hypotheses (low `confidence_ceiling`) are forced into the most tentative hedge tier regardless of count.
- **Deep frameworks bias question selection only** (consequence 1.3): an `attachment`-avoidant hypothesis produces *"when closeness grows, what tends to happen next for you?"* — never *"you have an avoidant pattern."*

### 7.3 Post-generation gate (rejecting declarative assertions + banned clinical terms)
A `rejectDeclarative(text)` check rejects any output that (a) states a conclusion rather than asks (no "you are / you have / your pattern is"), (b) contains a banned clinical term, (c) fails the litmus. On reject, regenerate up to N times, then **fall back to the content-blind variety bundle** for that slot.

Extend `LITERARY_OR_THERAPY_WORDS` (`promptStyle.ts:3-35`) with clinical terms — **and add them within the first 20 items** because only `LITERARY_OR_THERAPY_WORDS.slice(0,20)` reaches the model via `promptVariety.ts:69` (verified gotcha). Add: `schema`, `attachment`, `core belief`, `distortion`, `catastrophizing`, `avoidant`, `anxious attachment`, `worthless`, `unlovable`, `helpless`, `depression`, `disorder`. Note the gate must enforce these as **hard output validation** (the array is only soft prompt text today; nothing checks the response against it — verified gotcha). The post-gate is the first hard enforcement point.

### 7.4 Pre-generation + the `hypothesis-*` branch in `getDailyPrompt.ts` (fire path is a pure read when precomputed)

Nudge text is **pre-generated by the async update loop** and upserted into `prompt_deliveries` under a reserved slot, exactly the upsert `getDailyPrompt.ts:133-141` already performs (`{user_id, delivery_date, prompt_slot, prompt_text}`, `onConflict: 'user_id,delivery_date,prompt_slot'`). At fire time `dispatchDueNudge` (`nudgeDispatch.ts:86-100`) calls `getDailyPrompt` whose first action is the cache read (`getDailyPrompt.ts:66-80`) keyed on `(user_id, delivery_date, prompt_slot)` — so a precomputed hypothesis slot returns `source:'cache'` with **no fire-time LLM call** (consequence 1.2). The reserved-id branch CHECK-works because migration `002_flexible_nudges.sql:46-47` dropped both `prompt_slot` CHECK constraints (verified), so no constraint rejects a `hypothesis-*` value.

**Decision: override an existing slot (option A from the `nudges.ts` facts), not add a slot** — keeps notification volume and rumination load unchanged (`/tmp/hyp_final.md` §9.1). The async loop decides, per day, whether to override (e.g.) the `day` slot's text with hypothesis text by upserting under `prompt_slot='day'`. `nudges.ts` is untouched.

> **Deep-link note (verified):** `dispatchDueNudge` builds the open-app link as `/app/write?nudge=${item.nudge.id}` (`nudgeDispatch.ts:104`) from the resolved schedule id, **not** `prompt_slot`. Under option A (override) this stays `day` and works fine. If a future **add-a-slot** `hypothesis-*` path is ever used instead, `resolvedNudgesForDay` (`nudges.ts`) must also emit that id or the nudge will never fire from the dispatch path.

Reserved-id helper mirroring `isOnDemandPromptId` — new file `web/src/lib/prompts/hypothesisPrompt.ts`:
```ts
export const HYPOTHESIS_PROMPT_PREFIX = "hypothesis-";          // mirror ON_DEMAND_PROMPT_PREFIX (onDemandPrompt.ts:5)
export const HYPOTHESIS_PROMPT_LABEL = "Hypothesis prompt";
export function isHypothesisPromptId(id?: string | null): id is string {  // mirror onDemandPrompt.ts:55-57
  return Boolean(id?.startsWith(HYPOTHESIS_PROMPT_PREFIX));
}
```
(`isHypothesisPromptId` is a type guard `id is string` — match the signature so callers narrow.)

Two edits inside `getDailyPrompt.ts`:
1. **highVariety OR-chain (line 82-86):** add `isHypothesisPromptId(nudgeId)` so hypothesis slots behave high-novelty like on-demand/surprise. Import alongside the existing `isOnDemandPromptId` import (line 7).
2. **Short-circuit branch, inserted right after the cache-miss point (after line 80, before line 82):**
```ts
if (isHypothesisPromptId(nudgeId)) {
  // Hypothesis text is pre-generated by the async update loop and upserted under this slot.
  // If we reach here it was NOT precomputed in time (loop missed it / budget exhausted /
  // kill-switch fired) -> DO NOT generate at fire time. Fall through to the content-blind
  // variety bundle so the fire path never blocks on an LLM call and never emits an
  // un-gated hypothesis nudge. (Returns source:'fallback'.)
  // -> intentionally no early return; let the existing generate-vs-fallback path run,
  //    OR force fallback by treating llmPrompt as null. Prefer: skip generation entirely.
}
```
When the slot is an existing id being overridden (option A), no new branch fires at all — the precomputed text is picked up by the cache read at lines 74-80 verbatim, as `source:'cache'`. The `hypothesis-*` reserved-id path exists only as the safe-fallback guard above and for any future add-a-slot use. Push body truncation to 140 chars (`nudgeDispatch.ts:102-103`) applies unchanged; the full text serves when opening `/app/write`.

---

## 8. Falsification & safety instruments (load-bearing in invisible mode)

These three are the entire falsification surface now that the user tap is gone (consequence 1.1). New file `web/src/lib/hypotheses/outcomeInstrument.ts`.

### 8.1 Divergence metric
When a response entry arrives after a hypothesis-shaped nudge: compute `divergence_score` = cosine distance between (a) embedding of the nudge's *implied answer frame* and (b) embedding of the response entry (reuse `modelClient.embed`). Write the `hypothesis_nudge_outcomes` row. **Low divergence across a stream = the engine is leading** (Padesky: "if I'm never surprised, I'm not listening") → penalize/flag that hypothesis and feed a `contradicting source='divergence'` event into the loop (§5). **Never optimize for convergence/agreement** — that recreates the sycophancy loop (`missingAngles[0]`).

### 8.2 Harm signals
Per outcome row: `response_absolutist_pct` (rising absolutist language post-nudge) and `response_length_delta` (collapsing vs. expanding writing). Computed from `lexical.ts`. Tracked as rolling per-user trends.

### 8.3 Per-user kill-switch (auto-fallback to content-blind variety bundle)
A scheduled check (own cron or tail of the loop) reads `hypothesis_nudge_outcomes`: if for a user hypothesis-nudges correlate with **rising absolutist trend + collapsing entry length + disengagement** over a rolling window, set `profiles.hypothesis_engine_suspended_until = now() + window`. The update loop's first gate (§5) then short-circuits, and the `getDailyPrompt` fallback (§7.4) serves the content-blind variety bundle. This is the "is this helping THIS person" backstop the design otherwise lacks (`missingAngles[0]`), and the only thing that can stop a wrong invisible inference from quietly shaping questions indefinitely.

### 8.4 Crisis classifier (separate high-recall model, runs BEFORE the engine)
`web/src/lib/safety/crisisClassifier.ts` — `classifyCrisis(entry): Promise<{ hit: boolean; ... }>`. A **separate** safety-critical classifier (NOT a regex; absolutist words feed the belief engine and negative-affect is paradoxically lower in suicidal writing — `clinicalAccuracyIssues[5]`), tuned for **high recall** (false alarms acceptable, misses not). Runs as the **first** step in `updateLoop.ts` (§5). On a hit: suppress all hypothesis nudges for the user, no belief-shaping, route to grounding/988 resources. Its threshold is independent of the engine's signals. Uses `modelClient.callStructured` with its own model pin.

### 8.5 Eval fixture set + precision target
`web/src/lib/hypotheses/__fixtures__/` — de-identified synthetic-and-consented entries with human-annotated events (multiple annotators; report inter-annotator agreement, expect ≈0.63 F1 ceiling). A harness gates extractor releases on **precision** (false patterns are worse than misses): **target ≥0.85 precision, accept low recall in v1**. It specifically measures the span-correct-but-label-wrong rate (the fabricated-interpretation hazard, §4.4). `extractor_model_version` is stored per hypothesis update; any `EXTRACTOR_MODEL` change re-runs the fixture eval and alerts on drift (`missingAngles[5]`).

---

## 9. Phased task breakdown (MVP → v2 → v3)

**MVP — disconfirmer-led unique-outcome nudge end-to-end + kill-switch + schema-comment fix + holdout test.** Each task names the exact file.

- [x] **M0.** Add `zod` to `web/package.json` (not currently a dependency). *(blocks M6, M10)*
- [x] **M1.** `supabase/migrations/009_hypotheses.sql` — three tables, service-role-only RLS, `set_updated_at` trigger (single tree; do NOT add to `web/supabase/migrations/`). *(no deps)*
- [x] **M2.** `supabase/migrations/010_entry_embeddings.sql` — pgvector + `entry_embeddings` (single tree). *(no deps)*
- [x] **M3.** `profiles` columns: `hypothesis_engine_enabled`, `hypothesis_engine_suspended_until`, `hypothesis_llm_budget_used/_month` (in 009 or 011). *(no deps)*
- [x] **M4.** Append `Hypothesis`/`HypothesisEvidence`/`HypothesisNudgeOutcome`/`EntryEmbedding` + enums to `web/src/types/database.ts` after line 63. *(dep: M1, M2)*
- [x] **M5.** Fix schema-comment at `supabase/migrations/001_inkwell_schema.sql:19` (single tree; web tree has no 001 — §2 note). *(no deps)*
- [x] **M6.** `web/src/lib/llm/modelClient.ts` — `callStructured`/`callText`/`embed`, pinned models, retry/timeout/Zod validation; verify the openai v6 SDK `response_format: json_schema` surface (§3). *(dep: M0; blocks M8, M10, M12, M13)*
- [x] **M7.** `web/src/lib/hypotheses/lexical.ts` — Stage-A sensor, within-person absolutist trend (no spike events), own tokenizer. *(no deps)*
- [x] **M8.** `web/src/lib/hypotheses/redact.ts` — NE redaction (§6.2). *(no deps; blocks M10, M11)*
- [x] **M9.** `web/src/lib/safety/crisisClassifier.ts` — high-recall, separate model, runs before engine (§8.4). *(dep: M6)*
- [x] **M10.** `web/src/lib/llm/extractEvidence.ts` — DoT 3-stage, verbatim-quote invariant, M=5 stability, budget-aware (§4). *(dep: M6, M7, M8)*
- [x] **M11.** Embedding job (in updateLoop or `web/src/lib/hypotheses/embedJob.ts`) — embed redacted excerpts to `entry_embeddings`. *(dep: M2, M6, M8)*
- [x] **M12.** `web/src/lib/hypotheses/library.ts` — **all frameworks incl. beck/schema/attachment**, deep ones seeded with low `confidence_ceiling`. *(dep: M4)*
- [x] **M13.** `web/src/lib/hypotheses/updateLoop.ts` — async, idempotent-on-`updated_at`, edit-supersede, bands+asymmetry+FAE-discount, disconfirmation scan, provenance-aware promotion, hysteresis, per-user decay; reads `buildDayThemeGraph`/`buildThemeWritingDigest`/`detectTimelineEras` for candidates (§5). Provision the queue/cron host (§5 deployment note). *(dep: M1, M7, M9, M10, M12)*
- [x] **M14.** `web/src/lib/hypotheses/outcomeInstrument.ts` — divergence metric, harm signals, kill-switch (§8.1–8.3). *(dep: M1, M6)*
- [x] **M15.** `web/src/lib/llm/generateHypothesisNudge.ts` — voice reuse, disconfirmer-led contract, post-gate (§7.1–7.3). *(dep: M6, M13)*
- [x] **M16.** `web/src/lib/prompts/hypothesisPrompt.ts` (`isHypothesisPromptId` etc.) + the two `getDailyPrompt.ts` edits (line 7 import, line 84 OR-chain, after line 80 fallback-guard branch) + `LITERARY_OR_THERAPY_WORDS` extension in `promptStyle.ts:3-35` within first-20 (§7.3–7.4). *(dep: M15)*
- [x] **M17.** Pre-generation wiring: updateLoop upserts hypothesis nudge text into `prompt_deliveries` under the overridden slot (`getDailyPrompt.ts:133-141` upsert shape). *(dep: M13, M15)*
- [x] **M18.** Eval fixtures + precision harness, ≥0.85 precision gate (§8.5). *(dep: M10)*
- [x] **M19.** Holdout/A-B harness: hypothesis-nudge cohort vs. content-blind variety bundle on retention/writing-depth (`missingAngles[1]`). *(dep: M16, M17)*

**v2 — tuned + behavioral patterns.**
- [ ] **V1.** Hysteresis/decay/promotion constant tuning against M18 fixtures + M14 telemetry (`updateLoop.ts`). *(dep: M13, M14, M18)*
- [ ] **V2.** Richer `behavioral_pattern` + `language_pattern` marker lexicons with windowed within-person trends (`lexical.ts`, `library.ts`). *(dep: M7, M12)*
- [ ] **V3.** Per-user adaptive decay tuned from `themeEras` cadence (`updateLoop.ts` `adaptTau`). *(dep: M13)*
- [ ] **V4.** Divergence→evidence feedback loop refinement (`source='divergence'` events) (`outcomeInstrument.ts`, `updateLoop.ts`). *(dep: M14)*

**v3 — multi-angle exploration.**
- [ ] **W1.** Vary guided-discovery move (informational→summary→synthesizing→behavioral-experiment) via `formatRecentPromptsBlock`/`fetchRecentPromptTexts` reuse (`generateHypothesisNudge.ts`, `promptVariety.ts`). *(dep: M15)*
- [ ] **W2.** Strength-based parallel track (adaptive-pattern evidence) (`library.ts`, `updateLoop.ts`). *(dep: M12, M13)*
- [ ] **W3.** Migrate the 3 legacy `openaiClient()` factories onto `modelClient.client()` to delete duplication. *(dep: M6)*

---

## 10. If this gets users beyond you

This spec is scoped for the developer's own single-/early-user app, so consent flow and regulatory sign-off are de-prioritized — but several guardrails the chosen config strips out must come back **before any multi-user launch**, and they are not optional then: (1) a real **consent flow + data-flow disclosure**, because full egress means every entry goes to OpenAI and the corrected schema comment (M5) admits it — you cannot ship that to other people silently; (2) **DPA/BAA review** of sending mental-health-adjacent inferences and diary excerpts to a third-party LLM, plus column-level encryption-at-rest on `quote`/`statement` and a retention limit on refuted/retired evidence; (3) **clinician + regulatory-counsel sign-off** on the re-added deep frameworks (`beck_core_belief`, `schema_domain`, `attachment`) — inferring these from solo diary text is below the human reliability ceiling and is the SaMD-conversation trigger, and "invisible" mitigates but does not eliminate the harm if the inferences are wrong at scale; (4) **clinician validation of the crisis classifier** (M9) against a labeled set with a signed-off recall bar, since it is the one safety-critical gate that runs before the engine. Until those four are in place, the deep frameworks and full egress are defensible only for a user inspecting their own data.

---

**Quick reference — files:**
*New:* `supabase/migrations/009_hypotheses.sql`, `supabase/migrations/010_entry_embeddings.sql`, `web/src/lib/llm/modelClient.ts`, `web/src/lib/llm/extractEvidence.ts`, `web/src/lib/llm/generateHypothesisNudge.ts`, `web/src/lib/hypotheses/lexical.ts`, `web/src/lib/hypotheses/redact.ts`, `web/src/lib/hypotheses/library.ts`, `web/src/lib/hypotheses/updateLoop.ts`, `web/src/lib/hypotheses/outcomeInstrument.ts`, `web/src/lib/safety/crisisClassifier.ts`, `web/src/lib/prompts/hypothesisPrompt.ts`, eval fixtures + harness.
*Change:* `web/package.json` (add `zod`), `web/src/types/database.ts` (after line 63), `web/src/lib/prompts/getDailyPrompt.ts` (line 7 import, line 84 OR-chain, after line 80 branch), `web/src/lib/prompts/promptStyle.ts` (lines 3-35, first-20), `supabase/migrations/001_inkwell_schema.sql:19`, `profiles` columns.
*Zero changes:* `nudges.ts` (override-a-slot, not add), `nudgeDispatch.ts` firing logic, `send.ts`/`sw.js`/`push_subscriptions`/`nudge_push_log` (content-agnostic transport inherits the branch for free).
