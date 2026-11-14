-- Saved inventory search filters (master prompt §4, phase 2 §6.16 pin limit).
-- Class-C definitions owned by one account: name and nested AND/OR filter tree in jsonb.
-- Encrypted personal envelopes remain a later step (same approach as relationship_entries).
-- At most five filters per account per family, pinned in sidebar positions 1–5.

create table public.saved_filters (
  id               uuid primary key default uuidv7(),
  version          integer not null default 1 check (version >= 1),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.auth_users(id) on delete set null,
  updated_by       uuid references public.auth_users(id) on delete set null,
  family_id        uuid not null references public.families(id) on delete cascade,
  account_id       uuid not null references public.auth_users(id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 80),
  definition       jsonb not null
                   check (
                     jsonb_typeof(definition) = 'object'
                     and octet_length(definition::text) <= 16384
                   ),
  pinned_position  smallint not null check (pinned_position between 1 and 5),
  unique (family_id, id),
  unique (account_id, family_id, pinned_position)
);
create index saved_filters_owner_idx
  on public.saved_filters (family_id, account_id, pinned_position);
create trigger saved_filters_touch before update on public.saved_filters
  for each row execute function app.touch_updated_at();

-- Rejects a sixth filter for the same account in the family.
create function app.enforce_saved_filter_limit() returns trigger
  language plpgsql
  set search_path = public, pg_temp
  as $$
declare
  current_count integer;
begin
  select count(*)::integer into current_count
  from public.saved_filters
  where family_id = new.family_id
    and account_id = new.account_id
    and id is distinct from new.id;
  if current_count >= 5 then
    raise exception 'Saved filter limit is 5'
      using errcode = '23514', constraint = 'saved_filter_limit';
  end if;
  return new;
end
$$;

create trigger saved_filters_limit
  before insert on public.saved_filters
  for each row execute function app.enforce_saved_filter_limit();

alter table public.saved_filters enable row level security;
create policy tenant on public.saved_filters for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy owner_guard on public.saved_filters as restrictive for all to domusafe_app
  using (account_id = app.account_id())
  with check (account_id = app.account_id());
create policy not_guest on public.saved_filters as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

grant select, insert, update, delete on public.saved_filters to domusafe_app;
grant execute on function app.enforce_saved_filter_limit() to domusafe_app;
