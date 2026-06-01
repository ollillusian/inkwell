-- Web Push subscriptions + idempotent nudge send log (server cron)
-- (duplicate of web/supabase/migrations/008_push_subscriptions.sql)

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table if not exists public.nudge_push_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  nudge_id text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, date_key, nudge_id)
);

alter table public.push_subscriptions enable row level security;
alter table public.nudge_push_log enable row level security;

create policy "Users read own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users insert own push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users delete own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

create policy "Users read own nudge push log"
  on public.nudge_push_log for select
  using (auth.uid() = user_id);
