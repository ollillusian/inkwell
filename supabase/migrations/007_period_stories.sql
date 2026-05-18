-- AI-synthesized stories for a calendar week or month (user-triggered).

create table public.period_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_type text not null check (period_type in ('week', 'month')),
  period_key text not null,
  body text not null,
  entry_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_type, period_key)
);

create index period_stories_user_period on public.period_stories (
  user_id,
  period_type,
  period_key desc
);

alter table public.period_stories enable row level security;

create policy "Users read own period stories"
  on public.period_stories for select
  using (auth.uid() = user_id);

create policy "Users insert own period stories"
  on public.period_stories for insert
  with check (auth.uid() = user_id);

create policy "Users update own period stories"
  on public.period_stories for update
  using (auth.uid() = user_id);

create policy "Users delete own period stories"
  on public.period_stories for delete
  using (auth.uid() = user_id);

create trigger period_stories_updated_at
  before update on public.period_stories
  for each row execute procedure public.set_updated_at();

comment on table public.period_stories is 'LLM-woven stories from a week or month of entries; regenerated on demand';
