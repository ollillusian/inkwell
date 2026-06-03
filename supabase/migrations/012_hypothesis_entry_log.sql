-- 012_hypothesis_entry_log.sql — idempotency ledger for the hypothesis update loop.
-- Records that an entry (at a specific updated_at) was processed, so the trigger cron never
-- re-runs the (expensive) extractor on an entry it already handled — including entries that
-- produced zero evidence rows. Service-role write only. See HYPOTHESIS_NUDGE_ENGINE.md §5.

create table public.hypothesis_entry_log (
  entry_id uuid primary key references public.entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- the entries.updated_at this processing run consumed; a later edit (newer updated_at) re-runs.
  entry_updated_at timestamptz,
  events_found int not null default 0,
  processed_at timestamptz not null default now()
);

create index hypothesis_entry_log_user on public.hypothesis_entry_log (user_id, processed_at desc);

alter table public.hypothesis_entry_log enable row level security;

create policy "Users read own hypothesis entry log"
  on public.hypothesis_entry_log for select
  using (auth.uid() = user_id);
-- no insert/update/delete policy: service-role only.

-- Swap the vector index from ivfflat (010) to HNSW: ivfflat needs centroid training (poor recall on
-- a near-empty, growing, per-user-filtered table and only used when probes are tuned), whereas HNSW
-- needs no training and is robust here. Idempotent so it fixes already-applied DBs and fresh resets.
drop index if exists public.entry_embeddings_vec;
create index entry_embeddings_vec
  on public.entry_embeddings using hnsw (embedding vector_cosine_ops);

-- Nearest-neighbour search for the disconfirmation / unique-outcome scan (entry_embeddings is from
-- migration 010). Called by the service-role update loop (bypasses RLS); match_user scopes per user.
-- Lives here rather than in 010 because 010 was already applied locally before this RPC existed.
create or replace function public.match_entry_embeddings(
  query_embedding vector(1536),
  match_user uuid,
  match_count int default 5,
  exclude_entry uuid default null
)
returns table (entry_id uuid, redacted_text text, distance real)
language sql
stable
as $$
  select e.entry_id, e.redacted_text, (e.embedding <=> query_embedding)::real as distance
  from public.entry_embeddings e
  where e.user_id = match_user
    and (exclude_entry is null or e.entry_id <> exclude_entry)
  order by e.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
