-- Flexible nudge schedule (not limited to morning/midday/evening)

alter table public.profiles
  add column if not exists nudge_schedule jsonb,
  add column if not exists spontaneous_nudges boolean not null default true,
  add column if not exists spontaneous_jitter_minutes int not null default 45,
  add column if not exists nudges_fired text[] not null default '{}',
  add column if not exists surprise_nudge_enabled boolean not null default true;

update public.profiles
set nudge_schedule = jsonb_build_object(
  'nudges', jsonb_build_array(
    jsonb_build_object(
      'id', 'bedtime',
      'label', 'Before bed',
      'time', coalesce(to_char(evening_time, 'HH24:MI'), '21:30'),
      'enabled', true,
      'kind', 'daily'
    ),
    jsonb_build_object(
      'id', 'day',
      'label', 'Somewhere in your day',
      'time', coalesce(to_char(midday_time, 'HH24:MI'), '14:00'),
      'enabled', true,
      'kind', 'daily'
    ),
    jsonb_build_object(
      'id', 'travel',
      'label', 'Travel',
      'time', '10:30',
      'enabled', false,
      'kind', 'daily',
      'topicHint', 'travel'
    )
  ),
  'spontaneous', true,
  'jitterMinutes', 45,
  'surpriseNudge', jsonb_build_object(
    'enabled', true,
    'windowStart', '11:00',
    'windowEnd', '17:00'
  )
)
where nudge_schedule is null;

alter table public.entries drop constraint if exists entries_prompt_slot_check;
alter table public.prompt_deliveries drop constraint if exists prompt_deliveries_prompt_slot_check;

comment on column public.profiles.nudge_schedule is 'JSON: { nudges[], spontaneous, jitterMinutes, surpriseNudge }';
comment on column public.entries.prompt_slot is 'Nudge id, e.g. bedtime, travel-once, surprise';
