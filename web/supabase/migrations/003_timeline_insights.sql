-- Cache LLM timeline narrator / director's cut per user + key
create table if not exists public.timeline_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cache_key text not null,
  kind text not null check (kind in ('frame', 'directors_cut')),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cache_key)
);

alter table public.timeline_insights enable row level security;

create policy "Users read own timeline insights"
  on public.timeline_insights for select
  using (auth.uid() = user_id);

create policy "Users insert own timeline insights"
  on public.timeline_insights for insert
  with check (auth.uid() = user_id);

create policy "Users update own timeline insights"
  on public.timeline_insights for update
  using (auth.uid() = user_id);
