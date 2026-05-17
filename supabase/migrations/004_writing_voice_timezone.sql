alter table public.profiles
  add column if not exists tone_tags text[] not null default '{}',
  add column if not exists writing_voice text not null default '',
  add column if not exists timezone text not null default 'UTC';

comment on column public.profiles.tone_tags is 'e.g. dark, raw, hopeful — from onboarding';
comment on column public.profiles.writing_voice is 'Free-text: how they want prompts to feel';
comment on column public.profiles.timezone is 'IANA tz, e.g. America/New_York — for real local nudge times';
