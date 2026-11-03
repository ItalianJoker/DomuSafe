-- Tenancy (phase 2 §6.2): families, houses, residents, memberships and their scopes, Premium trials, kiosks.

create table public.families (
  id               uuid primary key default uuidv7(),
  name             text not null check (char_length(name) between 1 and 120),
  owner_account_id uuid not null references public.auth_users(id) on delete restrict,
  plan             public.plan_tier not null default 'free',
  plan_source      public.plan_source not null default 'default',
  timezone         text not null default 'Europe/Rome' check (char_length(timezone) between 1 and 64),
  base_currency    char(3) not null default 'EUR' references public.currencies(code),
  locale           text not null default 'it' check (locale in ('it', 'en')),
  version          integer not null default 1 check (version >= 1),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index families_owner_idx on public.families (owner_account_id);
create trigger families_touch before update on public.families
  for each row execute function app.touch_updated_at();

alter table public.account_profiles
  add constraint account_profiles_primary_family_fk foreign key (primary_family_id)
    references public.families(id) on delete set null,
  add constraint account_profiles_last_family_fk foreign key (last_family_id)
    references public.families(id) on delete set null;

create table public.memberships (
  id            uuid primary key default uuidv7(),
  family_id     uuid not null references public.families(id) on delete cascade,
  account_id    uuid not null references public.auth_users(id) on delete cascade,
  role          public.member_role not null,
  status        public.membership_status not null default 'active',
  all_houses    boolean not null default true,
  all_residents boolean not null default true,
  vault_family  boolean not null default false,
  expires_at    timestamptz,
  version       integer not null default 1 check (version >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.auth_users(id) on delete set null,
  unique (family_id, account_id),
  unique (family_id, id),
  check (role <> 'guest' or (expires_at is not null and not all_houses and not all_residents)),
  check (role <> 'caregiver' or (not all_houses and not all_residents)),
  check (not vault_family or role in ('admin', 'parent'))
);
create index memberships_account_idx on public.memberships (account_id) where status = 'active';
create trigger memberships_touch before update on public.memberships
  for each row execute function app.touch_updated_at();

create table public.houses (
  id             uuid primary key default uuidv7(),
  family_id      uuid not null references public.families(id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 120),
  address_line   text check (char_length(address_line) <= 200),
  postal_code    text check (char_length(postal_code) <= 16),
  city           text check (char_length(city) <= 120),
  province       text check (char_length(province) <= 60),
  country        char(2) not null default 'IT' check (country ~ '^[A-Z]{2}$'),
  cover_file_id  uuid,
  sort_order     smallint not null default 0 check (sort_order >= 0),
  plan_locked_at timestamptz,
  custom_fields  jsonb not null default '{}'
                 check (jsonb_typeof(custom_fields) = 'object' and octet_length(custom_fields::text) <= 16384),
  version        integer not null default 1 check (version >= 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.auth_users(id) on delete set null,
  updated_by     uuid references public.auth_users(id) on delete set null,
  deleted_at     timestamptz,
  unique (family_id, id)
);
create index houses_family_idx on public.houses (family_id, sort_order) where deleted_at is null;
create trigger houses_touch before update on public.houses
  for each row execute function app.touch_updated_at();

alter table public.account_profiles
  add constraint account_profiles_last_house_fk foreign key (last_house_id)
    references public.houses(id) on delete set null;

create table public.residents (
  id             uuid primary key default uuidv7(),
  family_id      uuid not null references public.families(id) on delete cascade,
  display_name   text not null check (char_length(display_name) between 1 and 80),
  kind           public.resident_kind not null default 'adult',
  account_id     uuid references public.auth_users(id) on delete set null,
  color          char(7) not null default '#3f6e8c' check (color ~ '^#[0-9a-f]{6}$'),
  avatar_file_id uuid,
  sort_order     smallint not null default 0 check (sort_order >= 0),
  plan_locked_at timestamptz,
  custom_fields  jsonb not null default '{}'
                 check (jsonb_typeof(custom_fields) = 'object' and octet_length(custom_fields::text) <= 16384),
  version        integer not null default 1 check (version >= 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.auth_users(id) on delete set null,
  updated_by     uuid references public.auth_users(id) on delete set null,
  deleted_at     timestamptz,
  unique (family_id, id)
);
create unique index residents_account_idx on public.residents (family_id, account_id) where account_id is not null;
create trigger residents_touch before update on public.residents
  for each row execute function app.touch_updated_at();

create table public.resident_houses (
  family_id   uuid not null,
  resident_id uuid not null,
  house_id    uuid not null,
  primary key (resident_id, house_id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade
);

create table public.membership_houses (
  membership_id uuid not null,
  family_id     uuid not null,
  house_id      uuid not null,
  primary key (membership_id, house_id),
  foreign key (family_id, membership_id) references public.memberships(family_id, id) on delete cascade,
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade
);

create table public.membership_residents (
  membership_id uuid not null,
  family_id     uuid not null,
  resident_id   uuid not null,
  primary key (membership_id, resident_id),
  foreign key (family_id, membership_id) references public.memberships(family_id, id) on delete cascade,
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade
);

create table public.premium_trials (
  account_id uuid primary key references public.auth_users(id) on delete cascade,
  family_id  uuid not null references public.families(id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at    timestamptz not null,
  check (ends_at = started_at + interval '30 days')
);
create index premium_trials_family_idx on public.premium_trials (family_id);

create table public.kiosk_devices (
  id                  uuid primary key check (uuid_extract_version(id) = 7),
  family_id           uuid not null references public.families(id) on delete cascade,
  house_id            uuid not null,
  name                text not null check (char_length(name) between 1 and 80),
  profile             public.kiosk_profile not null default 'standard',
  resident_id         uuid,
  credential_hash     bytea not null unique check (octet_length(credential_hash) = 32),
  public_key          bytea not null check (octet_length(public_key) = 65 and get_byte(public_key, 0) = 4),
  layout              jsonb not null default '{"widgets": []}'
                      check (jsonb_typeof(layout) = 'object' and octet_length(layout::text) <= 16384),
  idle_return_seconds smallint not null default 120 check (idle_return_seconds between 15 and 3600),
  last_seen_at        timestamptz,
  revoked_at          timestamptz,
  version             integer not null default 1 check (version >= 1),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.auth_users(id) on delete set null,
  updated_by          uuid references public.auth_users(id) on delete set null,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check ((profile = 'elderly') = (resident_id is not null))
);
create trigger kiosk_devices_touch before update on public.kiosk_devices
  for each row execute function app.touch_updated_at();

-- The family owner must always hold an active admin membership (checked at commit).
create function app.check_family_owner() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
declare
  target uuid;
begin
  if tg_table_name = 'families' then
    target := new.id;
  elsif tg_op = 'DELETE' then
    target := old.family_id;
  else
    target := new.family_id;
  end if;
  if exists (select 1 from public.families f where f.id = target)
     and not exists (
       select 1
       from public.families f
       join public.memberships m on m.family_id = f.id and m.account_id = f.owner_account_id
       where f.id = target and m.role = 'admin' and m.status = 'active'
     ) then
    raise exception 'The family owner must be an active administrator'
      using errcode = '23514', constraint = 'family_owner_is_admin';
  end if;
  return null;
end
$$;

create constraint trigger families_owner_is_admin
  after insert or update of owner_account_id on public.families
  deferrable initially deferred
  for each row execute function app.check_family_owner();

create constraint trigger memberships_owner_is_admin
  after update or delete on public.memberships
  deferrable initially deferred
  for each row execute function app.check_family_owner();
