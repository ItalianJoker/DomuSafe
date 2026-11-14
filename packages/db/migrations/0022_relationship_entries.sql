-- Ethical personal CRM: contact notebook under Personale (rubrica relazioni).
-- Recurrences, last contact and user-written notes only — no scores, location or inferred data.
-- Readable class-C style fields (same approach as care coordination). Encrypted envelopes remain a later step.

create table public.relationship_entries (
  id                       uuid primary key default uuidv7(),
  version                  integer not null default 1 check (version >= 1),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid references public.auth_users(id) on delete set null,
  updated_by               uuid references public.auth_users(id) on delete set null,
  family_id                uuid not null references public.families(id) on delete cascade,
  visibility               public.visibility not null default 'personal',
  owner_account_id         uuid references public.auth_users(id) on delete cascade,
  display_name             text not null,
  relation                 text,
  last_contact_on          date,
  contact_interval_days    smallint,
  notes                    text,
  deleted_at               timestamptz,
  unique (family_id, id),
  check ((visibility = 'personal') = (owner_account_id is not null)),
  check (visibility = 'personal'),
  check (char_length(btrim(display_name)) between 1 and 120),
  check (relation is null or char_length(btrim(relation)) between 1 and 80),
  check (
    contact_interval_days is null
    or contact_interval_days between 1 and 3660
  ),
  check (notes is null or char_length(notes) <= 4000)
);
create index relationship_entries_owner_idx
  on public.relationship_entries (family_id, owner_account_id, display_name)
  where deleted_at is null;
create index relationship_entries_due_idx
  on public.relationship_entries (family_id, owner_account_id, last_contact_on, contact_interval_days)
  where deleted_at is null and contact_interval_days is not null;
create trigger relationship_entries_touch before update on public.relationship_entries
  for each row execute function app.touch_updated_at();

alter table public.relationship_entries enable row level security;
create policy tenant on public.relationship_entries for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy personal_guard on public.relationship_entries as restrictive for all to domusafe_app
  using (visibility = 'family' or owner_account_id = app.account_id())
  with check (visibility = 'family' or owner_account_id = app.account_id());
create policy not_guest on public.relationship_entries as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

grant select, insert, update, delete on public.relationship_entries to domusafe_app;
