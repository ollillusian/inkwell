-- AI-synthesized short stories from a day's journal entries (user-triggered).

create table public.day_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  story_date date not null,
  body text not null,
  entry_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, story_date)
);

create index day_stories_user_date on public.day_stories (user_id, story_date desc);

alter table public.day_stories enable row level security;

create policy "Users read own day stories"
  on public.day_stories for select
  using (auth.uid() = user_id);

create policy "Users insert own day stories"
  on public.day_stories for insert
  with check (auth.uid() = user_id);

create policy "Users update own day stories"
  on public.day_stories for update
  using (auth.uid() = user_id);

create policy "Users delete own day stories"
  on public.day_stories for delete
  using (auth.uid() = user_id);

create trigger day_stories_updated_at
  before update on public.day_stories
  for each row execute procedure public.set_updated_at();

comment on table public.day_stories is 'LLM-woven short fiction from same-day entries; regenerated on demand';
