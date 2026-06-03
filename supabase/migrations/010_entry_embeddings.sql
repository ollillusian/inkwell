-- 010_entry_embeddings.sql — pgvector index for unique-outcome retrieval.
-- Powers "resurface the contradicting entry from four months ago." Service-role write only.
-- Requires the `vector` extension (pgvector). On Supabase this is available; enable it here.

create extension if not exists vector;

create table public.entry_embeddings (
  entry_id uuid primary key references public.entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,  -- denormalized for RLS + filter
  embedding vector(1536) not null,        -- text-embedding-3-small dimensionality; pin in model_version
  model_version text not null,            -- drift detection; re-embed when the embedding model changes
  redacted_text text not null,            -- the NE-redacted excerpt that was actually embedded
  created_at timestamptz not null default now()
);

-- IVFFlat index, cosine distance to match OpenAI embeddings. Per-user filtering happens in the query.
create index entry_embeddings_vec
  on public.entry_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index entry_embeddings_user on public.entry_embeddings (user_id);

alter table public.entry_embeddings enable row level security;

create policy "Users read own entry embeddings"
  on public.entry_embeddings for select
  using (auth.uid() = user_id);
-- no insert/update/delete policy: service-role only.

comment on table public.entry_embeddings is
  'Per-entry embeddings (NE-redacted) for hypothesis disconfirmation / unique-outcome retrieval.';
-- NOTE: the match_entry_embeddings() search RPC lives in migration 012 (added after 010 was already
-- applied locally) so it can be picked up by `supabase migration up` without a full db reset.
