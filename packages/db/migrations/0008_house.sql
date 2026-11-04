-- House manual, contacts, utilities and maintenance (phase 2 §6.13–§6.15).
-- Rooms, bills, templates and inventory stay out of this migration.

create type public.guide_audience as enum ('guest', 'technical');
create type public.guide_topic as enum (
  'wifi', 'intercom', 'gate', 'parcels', 'waste', 'pets', 'plants',
  'heating', 'appliances', 'rules', 'check_in', 'check_out', 'other'
);
create type public.shutoff_kind as enum ('water', 'gas', 'electricity', 'boiler', 'other');
create type public.waste_fraction as enum (
  'organic', 'paper', 'plastic', 'glass', 'metal', 'residual', 'bulky', 'green', 'other'
);
create type public.contact_kind as enum (
  'craftsman', 'supplier', 'doctor', 'veterinarian', 'neighbor', 'emergency_service', 'other'
);
create type public.utility_kind as enum (
  'electricity', 'gas', 'water', 'internet', 'waste_tax', 'heating', 'other'
);
create type public.billing_frequency as enum ('monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual');
create type public.maintenance_category as enum (
  'heating', 'cooling', 'plumbing', 'electrical', 'appliances',
  'structure', 'roof', 'garden', 'safety', 'cleaning', 'other'
);
create type public.maintenance_priority as enum ('low', 'medium', 'high', 'urgent');

-- Rejects an envelope whose scope kind does not match the manual audience.
create function app.enforce_guide_envelope() returns trigger
  language plpgsql
  set search_path = public, pg_temp
  as $$
declare
  scope_kind public.scope_kind;
  scope_house uuid;
begin
  if num_nulls(new.enc_scope_id, new.enc_key_version, new.enc_dek, new.enc_payload) = 4 then
    return new;
  end if;
  select s.kind, s.house_id into scope_kind, scope_house
  from public.key_scopes s
  where s.id = new.enc_scope_id and s.family_id = new.family_id;
  if scope_kind is null
     or scope_house is distinct from new.house_id
     or (new.audience = 'guest' and scope_kind is distinct from 'house_guest')
     or (new.audience = 'technical' and scope_kind is distinct from 'house_technical') then
    raise exception 'Guide envelope scope does not match the audience'
      using errcode = '23514', constraint = 'guide_envelope_scope';
  end if;
  return new;
end
$$;

-- Rejects a utility envelope that is not the family scope.
create function app.enforce_utility_envelope() returns trigger
  language plpgsql
  set search_path = public, pg_temp
  as $$
declare
  scope_kind public.scope_kind;
begin
  if num_nulls(new.enc_scope_id, new.enc_key_version, new.enc_dek, new.enc_payload) = 4 then
    return new;
  end if;
  select s.kind into scope_kind
  from public.key_scopes s
  where s.id = new.enc_scope_id and s.family_id = new.family_id and s.house_id is null;
  if scope_kind is distinct from 'family' then
    raise exception 'Utility envelope must use the family scope'
      using errcode = '23514', constraint = 'utility_envelope_scope';
  end if;
  return new;
end
$$;

create table public.house_guide_entries (
  id               uuid primary key check (uuid_extract_version(id) = 7),
  version          integer not null default 1 check (version >= 1),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.auth_users(id) on delete set null,
  updated_by       uuid references public.auth_users(id) on delete set null,
  family_id        uuid not null references public.families(id) on delete cascade,
  house_id         uuid not null,
  audience         public.guide_audience not null,
  topic            public.guide_topic not null,
  title            text not null check (char_length(title) between 1 and 160),
  body             text not null default '' check (char_length(body) <= 8000),
  sort_order       smallint not null default 0 check (sort_order >= 0),
  custom_fields    jsonb not null default '{}'
                   check (jsonb_typeof(custom_fields) = 'object' and octet_length(custom_fields::text) <= 16384),
  deleted_at       timestamptz,
  enc_scope_id     uuid,
  enc_key_version  integer,
  enc_dek          bytea,
  enc_payload      bytea,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, enc_scope_id) references public.key_scopes(family_id, id),
  foreign key (enc_scope_id, enc_key_version) references public.scope_key_versions(scope_id, version),
  check (num_nulls(enc_scope_id, enc_key_version, enc_dek, enc_payload) in (0, 4)),
  check (enc_dek is null or octet_length(enc_dek) >= 29),
  check (enc_payload is null or octet_length(enc_payload) between 29 and 262144)
);
create index house_guide_entries_order_idx
  on public.house_guide_entries (family_id, house_id, audience, sort_order)
  where deleted_at is null;
create trigger house_guide_entries_touch before update on public.house_guide_entries
  for each row execute function app.touch_updated_at();
create trigger house_guide_entries_envelope before insert or update on public.house_guide_entries
  for each row execute function app.enforce_guide_envelope();

create table public.house_shutoffs (
  id                 uuid primary key default uuidv7(),
  version            integer not null default 1 check (version >= 1),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.auth_users(id) on delete set null,
  updated_by         uuid references public.auth_users(id) on delete set null,
  family_id          uuid not null references public.families(id) on delete cascade,
  house_id           uuid not null,
  kind               public.shutoff_kind not null,
  location           text not null check (char_length(location) between 1 and 300),
  instructions       text not null default '' check (char_length(instructions) <= 2000),
  visible_to_guests  boolean not null default true,
  custom_fields      jsonb not null default '{}'
                     check (jsonb_typeof(custom_fields) = 'object' and octet_length(custom_fields::text) <= 16384),
  deleted_at         timestamptz,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade
);
create index house_shutoffs_kind_idx
  on public.house_shutoffs (family_id, house_id, kind)
  where deleted_at is null;
create trigger house_shutoffs_touch before update on public.house_shutoffs
  for each row execute function app.touch_updated_at();

create table public.waste_collections (
  id               uuid primary key default uuidv7(),
  version          integer not null default 1 check (version >= 1),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.auth_users(id) on delete set null,
  updated_by       uuid references public.auth_users(id) on delete set null,
  family_id        uuid not null references public.families(id) on delete cascade,
  house_id         uuid not null,
  fraction         public.waste_fraction not null,
  rrule            text,
  collection_time  text,
  instructions     text,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  check (rrule is null or (char_length(rrule) <= 400 and rrule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;|$)')),
  check (collection_time is null or collection_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  check (instructions is null or char_length(instructions) <= 2000)
);
create index waste_collections_house_idx on public.waste_collections (family_id, house_id);
create trigger waste_collections_touch before update on public.waste_collections
  for each row execute function app.touch_updated_at();

create table public.contacts (
  id                 uuid primary key default uuidv7(),
  version            integer not null default 1 check (version >= 1),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.auth_users(id) on delete set null,
  updated_by         uuid references public.auth_users(id) on delete set null,
  family_id          uuid not null references public.families(id) on delete cascade,
  visibility         public.visibility not null default 'family',
  owner_account_id   uuid references public.auth_users(id) on delete cascade,
  house_id           uuid,
  kind               public.contact_kind not null,
  trade              text,
  display_name       text not null check (char_length(display_name) between 1 and 120),
  company            text,
  phone              text,
  email              citext,
  website            text,
  address            text,
  notes              text,
  rating             smallint,
  visible_to_guests  boolean not null default false,
  custom_fields      jsonb not null default '{}'
                     check (jsonb_typeof(custom_fields) = 'object' and octet_length(custom_fields::text) <= 16384),
  deleted_at         timestamptz,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  check ((visibility = 'personal') = (owner_account_id is not null)),
  check (trade is null or char_length(trade) <= 80),
  check (company is null or char_length(company) <= 160),
  check (phone is null or phone ~ '^[+][1-9][0-9]{1,14}$'),
  check (website is null or char_length(website) <= 300),
  check (address is null or char_length(address) <= 300),
  check (notes is null or char_length(notes) <= 2000),
  check (rating is null or rating between 1 and 5)
);
create index contacts_kind_idx on public.contacts (family_id, kind) where deleted_at is null;
create trigger contacts_touch before update on public.contacts
  for each row execute function app.touch_updated_at();

create table public.utilities (
  id                   uuid primary key check (uuid_extract_version(id) = 7),
  version              integer not null default 1 check (version >= 1),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references public.auth_users(id) on delete set null,
  updated_by           uuid references public.auth_users(id) on delete set null,
  family_id            uuid not null references public.families(id) on delete cascade,
  house_id             uuid not null,
  kind                 public.utility_kind not null,
  provider_name        text not null check (char_length(provider_name) between 1 and 160),
  customer_code        text,
  contract_code        text,
  supply_point_code    text,
  tariff_name          text,
  start_date           date,
  renewal_date         date,
  billing_frequency    public.billing_frequency,
  estimated_cost_minor bigint,
  currency             char(3) references public.currencies(code),
  autopay              boolean not null default false,
  notes                text,
  custom_fields        jsonb not null default '{}'
                       check (jsonb_typeof(custom_fields) = 'object' and octet_length(custom_fields::text) <= 16384),
  deleted_at           timestamptz,
  enc_scope_id         uuid,
  enc_key_version      integer,
  enc_dek              bytea,
  enc_payload          bytea,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, enc_scope_id) references public.key_scopes(family_id, id),
  foreign key (enc_scope_id, enc_key_version) references public.scope_key_versions(scope_id, version),
  check (customer_code is null or char_length(customer_code) <= 80),
  check (contract_code is null or char_length(contract_code) <= 80),
  check (supply_point_code is null or char_length(supply_point_code) <= 80),
  check (tariff_name is null or char_length(tariff_name) <= 120),
  check (notes is null or char_length(notes) <= 2000),
  check ((estimated_cost_minor is null) = (currency is null)),
  check (estimated_cost_minor is null or estimated_cost_minor >= 0),
  check (num_nulls(enc_scope_id, enc_key_version, enc_dek, enc_payload) in (0, 4)),
  check (enc_dek is null or octet_length(enc_dek) >= 29),
  check (enc_payload is null or octet_length(enc_payload) between 29 and 262144)
);
create index utilities_kind_idx on public.utilities (family_id, house_id, kind) where deleted_at is null;
create trigger utilities_touch before update on public.utilities
  for each row execute function app.touch_updated_at();
create trigger utilities_envelope before insert or update on public.utilities
  for each row execute function app.enforce_utility_envelope();

create table public.maintenance_tasks (
  id                   uuid primary key default uuidv7(),
  version              integer not null default 1 check (version >= 1),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references public.auth_users(id) on delete set null,
  updated_by           uuid references public.auth_users(id) on delete set null,
  family_id            uuid not null references public.families(id) on delete cascade,
  house_id             uuid not null,
  contact_id           uuid,
  category             public.maintenance_category not null,
  priority             public.maintenance_priority not null default 'medium',
  title                text not null check (char_length(title) between 1 and 140),
  description          text,
  rrule                text,
  next_due_date        date,
  last_done_on         date,
  estimated_cost_minor bigint,
  currency             char(3) references public.currencies(code),
  active               boolean not null default true,
  custom_fields        jsonb not null default '{}'
                       check (jsonb_typeof(custom_fields) = 'object' and octet_length(custom_fields::text) <= 16384),
  deleted_at           timestamptz,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, contact_id) references public.contacts(family_id, id),
  check (description is null or char_length(description) <= 4000),
  check (rrule is null or (char_length(rrule) <= 400 and rrule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;|$)')),
  check ((estimated_cost_minor is null) = (currency is null)),
  check (estimated_cost_minor is null or estimated_cost_minor >= 0)
);
create index maintenance_tasks_due_idx
  on public.maintenance_tasks (family_id, house_id, next_due_date)
  where active and deleted_at is null;
create trigger maintenance_tasks_touch before update on public.maintenance_tasks
  for each row execute function app.touch_updated_at();

-- Row-level security.
alter table public.house_guide_entries enable row level security;
create policy tenant on public.house_guide_entries for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.house_guide_entries as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy guest_guard on public.house_guide_entries as restrictive for all to domusafe_app
  using ((select app.role()) is distinct from 'guest' or audience = 'guest')
  with check ((select app.role()) is distinct from 'guest' or audience = 'guest');
create policy managers_insert on public.house_guide_entries as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.house_guide_entries as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.house_guide_entries as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

alter table public.house_shutoffs enable row level security;
create policy tenant on public.house_shutoffs for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.house_shutoffs as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy guest_guard on public.house_shutoffs as restrictive for all to domusafe_app
  using ((select app.role()) is distinct from 'guest' or visible_to_guests)
  with check ((select app.role()) is distinct from 'guest' or visible_to_guests);
create policy managers_insert on public.house_shutoffs as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.house_shutoffs as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.house_shutoffs as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

alter table public.waste_collections enable row level security;
create policy tenant on public.waste_collections for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.waste_collections as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy managers_insert on public.waste_collections as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.waste_collections as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.waste_collections as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

alter table public.contacts enable row level security;
create policy tenant on public.contacts for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy personal_guard on public.contacts as restrictive for all to domusafe_app
  using (visibility = 'family' or owner_account_id = app.account_id())
  with check (visibility = 'family' or owner_account_id = app.account_id());
create policy house_guard on public.contacts as restrictive for all to domusafe_app
  using (house_id is null or (select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check (house_id is null or (select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy guest_guard on public.contacts as restrictive for all to domusafe_app
  using ((select app.role()) is distinct from 'guest' or visible_to_guests)
  with check ((select app.role()) is distinct from 'guest' or visible_to_guests);
create policy managers_insert on public.contacts as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.contacts as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.contacts as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

alter table public.utilities enable row level security;
create policy tenant on public.utilities for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.utilities as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy managers on public.utilities as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

alter table public.maintenance_tasks enable row level security;
create policy tenant on public.maintenance_tasks for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.maintenance_tasks as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy not_guest on public.maintenance_tasks as restrictive for select to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy managers_insert on public.maintenance_tasks as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.maintenance_tasks as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.maintenance_tasks as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

grant select, insert, update, delete on
  public.house_guide_entries, public.house_shutoffs, public.waste_collections,
  public.contacts, public.utilities, public.maintenance_tasks
to domusafe_app;

grant execute on function app.enforce_guide_envelope(), app.enforce_utility_envelope() to domusafe_app;
