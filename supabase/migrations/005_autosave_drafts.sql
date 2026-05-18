-- Autosaved drafts let people leave and resume without publishing empty entries.

alter table public.entries
  add column if not exists is_draft boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists entries_user_drafts
  on public.entries (user_id, is_draft, written_at desc);

drop trigger if exists entries_updated_at on public.entries;
create trigger entries_updated_at
  before update on public.entries
  for each row execute procedure public.set_updated_at();

comment on column public.entries.is_draft is 'True while autosaved in the write editor; false after Save to journal.';
