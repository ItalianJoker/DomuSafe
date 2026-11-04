-- Public codes for the wall sheet and the rescue sheet.
-- The raw token is stored so the family can print it again. Lookup uses the SHA-256 hash.
-- A revoked code keeps the hash, so the public page can say the code is no longer valid.

create type public.publication_kind as enum ('house_page', 'rescue_sheet');

create table public.publications (
  id               uuid primary key default uuidv7(),
  version          integer not null default 1 check (version >= 1),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.auth_users(id) on delete set null,
  updated_by       uuid references public.auth_users(id) on delete set null,
  family_id        uuid not null references public.families(id) on delete cascade,
  house_id         uuid not null,
  kind             public.publication_kind not null,
  token            text,
  token_hash       bytea not null,
  revoked_at       timestamptz,
  last_scanned_at  timestamptz,
  scan_count       integer not null default 0 check (scan_count >= 0),
  unique (family_id, id),
  unique (token_hash),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  check ((revoked_at is null) = (token is not null)),
  check (token is null or token ~ '^[A-Za-z0-9_-]{22}$'),
  check (octet_length(token_hash) = 32)
);
create unique index publications_active_idx
  on public.publications (family_id, house_id, kind)
  where revoked_at is null;
create index publications_house_idx on public.publications (family_id, house_id, created_at desc);
create trigger publications_touch before update on public.publications
  for each row execute function app.touch_updated_at();

-- Resolves a public code without a family session. The caller passes the SHA-256 of the token.
create function app.publication_by_token(p_token_hash bytea)
  returns table (
    id uuid,
    family_id uuid,
    house_id uuid,
    kind public.publication_kind,
    revoked_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select p.id, p.family_id, p.house_id, p.kind, p.revoked_at
    from public.publications p
    where p.token_hash = p_token_hash
  $$;

alter table public.publications enable row level security;
create policy tenant on public.publications for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.publications as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
-- Only people who can edit the house, and the system principal used by the public page, can read the token.
create policy editors on public.publications as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

grant select, insert, update, delete on public.publications to domusafe_app;
grant execute on function app.publication_by_token(bytea) to domusafe_app;
