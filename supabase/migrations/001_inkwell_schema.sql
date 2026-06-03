-- Inkwell: private writing journal. Row-level security keeps data yours only.

create extension if not exists "pgcrypto";

-- Profiles (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  onboarding_complete boolean not null default false,
  topics text[] not null default '{}',
  morning_time time not null default '08:00',
  midday_time time not null default '13:00',
  evening_time time not null default '20:00',
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Journal entries.
-- NOTE: as of migration 009, published entry text IS sent to an LLM (OpenAI) by the async
-- hypothesis-evidence extractor (web/src/lib/llm/extractEvidence.ts) and the embedding job (010).
-- Quotes stored in hypothesis_evidence are named-entity-redacted first. See HYPOTHESIS_NUDGE_ENGINE.md.
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt_text text not null,
  prompt_slot text not null check (prompt_slot in ('morning', 'midday', 'evening')),
  body text not null default '',
  topics_snapshot text[] not null default '{}',
  written_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index entries_user_written_at on public.entries (user_id, written_at desc);

-- Optional: track which scheduled prompts were delivered (for sync across devices)
create table public.prompt_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delivery_date date not null,
  prompt_slot text not null check (prompt_slot in ('morning', 'midday', 'evening')),
  prompt_text text not null,
  entry_id uuid references public.entries (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, delivery_date, prompt_slot)
);

alter table public.profiles enable row level security;
alter table public.entries enable row level security;
alter table public.prompt_deliveries enable row level security;

-- Profiles policies
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Entries policies
create policy "Users read own entries"
  on public.entries for select
  using (auth.uid() = user_id);

create policy "Users insert own entries"
  on public.entries for insert
  with check (auth.uid() = user_id);

create policy "Users update own entries"
  on public.entries for update
  using (auth.uid() = user_id);

create policy "Users delete own entries"
  on public.entries for delete
  using (auth.uid() = user_id);

-- Deliveries policies
create policy "Users read own deliveries"
  on public.prompt_deliveries for select
  using (auth.uid() = user_id);

create policy "Users insert own deliveries"
  on public.prompt_deliveries for insert
  with check (auth.uid() = user_id);

create policy "Users update own deliveries"
  on public.prompt_deliveries for update
  using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();
