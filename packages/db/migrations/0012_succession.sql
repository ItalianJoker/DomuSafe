-- Family succession checklist. Activities live on the family, not inside a vault envelope.
-- The inheritance kit is assembled in the browser from these rows alone.

create type public.succession_kind as enum (
  'documents',
  'will',
  'notary',
  'titles',
  'declaration',
  'utility_transfers',
  'custom'
);

create table public.succession_items (
  id             uuid primary key default uuidv7(),
  version        integer not null default 1 check (version >= 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.auth_users(id) on delete set null,
  updated_by     uuid references public.auth_users(id) on delete set null,
  family_id      uuid not null references public.families(id) on delete cascade,
  kind           public.succession_kind not null,
  title          text,
  notes          text,
  deadline_note  text,
  done           boolean not null default false,
  completed_at   timestamptz,
  sort_order     smallint not null default 0 check (sort_order >= 0),
  deleted_at     timestamptz,
  unique (family_id, id),
  check (kind <> 'custom' or title is not null),
  check (done = (completed_at is not null)),
  check (title is null or (char_length(btrim(title)) between 1 and 200 and title !~ '[0-9]{8}')),
  check (notes is null or (char_length(btrim(notes)) between 1 and 2000 and notes !~ '[0-9]{8}')),
  check (
    deadline_note is null
    or (char_length(btrim(deadline_note)) between 1 and 200 and deadline_note !~ '[0-9]{8}')
  )
);

create unique index succession_items_standard_idx
  on public.succession_items (family_id, kind)
  where kind <> 'custom' and deleted_at is null;
create index succession_items_family_idx
  on public.succession_items (family_id, sort_order)
  where deleted_at is null;
create trigger succession_items_touch before update on public.succession_items
  for each row execute function app.touch_updated_at();

alter table public.succession_items enable row level security;
create policy tenant on public.succession_items for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy succession_role on public.succession_items as restrictive for all to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = 'admin'
    or (
      (select app.role()) = 'parent'
      and exists (
        select 1 from public.memberships m
        where m.family_id = succession_items.family_id
          and m.account_id = app.account_id()
          and m.status = 'active'
          and m.vault_family
          and (m.expires_at is null or m.expires_at > now())
      )
    )
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = 'admin'
    or (
      (select app.role()) = 'parent'
      and exists (
        select 1 from public.memberships m
        where m.family_id = succession_items.family_id
          and m.account_id = app.account_id()
          and m.status = 'active'
          and m.vault_family
          and (m.expires_at is null or m.expires_at > now())
      )
    )
  );

grant select, insert, update, delete on public.succession_items to domusafe_app;
