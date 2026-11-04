-- Personale: rescue cards, pets, personal services, bank metadata and the tax checklist.
-- The rescue card is readable by family members who may see health data. Full account
-- numbers and the encrypted medical diary are out of this migration.

alter table public.residents
  add column birth_year smallint,
  add column usual_bedroom text,
  add column photo text,
  add constraint residents_birth_year_check check (birth_year is null or birth_year between 1900 and 2100),
  add constraint residents_usual_bedroom_check check (usual_bedroom is null or char_length(usual_bedroom) between 1 and 80),
  add constraint residents_photo_check check (
    photo is null or (
      char_length(photo) between 32 and 180000
      and photo ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$'
    )
  );

create type public.blood_group as enum (
  'a_positive', 'a_negative', 'b_positive', 'b_negative',
  'ab_positive', 'ab_negative', 'o_positive', 'o_negative', 'unknown'
);
create type public.mobility as enum ('independent', 'assisted', 'wheelchair', 'bedridden');
create type public.pet_species as enum (
  'dog', 'cat', 'bird', 'fish', 'rabbit', 'rodent', 'reptile', 'horse', 'other'
);
create type public.tax_item_key as enum (
  'declaration', 'precompiled_return', 'isee', 'property_tax', 'waste_tax',
  'income_tax_first_instalment', 'income_tax_second_instalment'
);
create type public.tax_item_status as enum ('todo', 'in_progress', 'done', 'not_applicable');

create table public.resident_profiles (
  resident_id      uuid primary key,
  family_id        uuid not null,
  blood_group      public.blood_group,
  mobility         public.mobility,
  allergies        jsonb not null default '[]',
  conditions       jsonb not null default '[]',
  medical_devices  jsonb not null default '[]',
  version          integer not null default 1 check (version >= 1),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.auth_users(id) on delete set null,
  updated_by       uuid references public.auth_users(id) on delete set null,
  unique (family_id, resident_id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check (jsonb_typeof(allergies) = 'array' and jsonb_array_length(allergies) <= 40),
  check (jsonb_typeof(conditions) = 'array' and jsonb_array_length(conditions) <= 40),
  check (jsonb_typeof(medical_devices) = 'array' and jsonb_array_length(medical_devices) <= 40)
);
create trigger resident_profiles_touch before update on public.resident_profiles
  for each row execute function app.touch_updated_at();

create table public.lifesaving_medicines (
  id           uuid primary key default uuidv7(),
  family_id    uuid not null,
  resident_id  uuid not null,
  name         text not null check (char_length(name) between 1 and 120),
  location     text not null check (char_length(location) between 1 and 300),
  sort_order   smallint not null default 0 check (sort_order >= 0),
  unique (family_id, id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade
);
create index lifesaving_medicines_order_idx
  on public.lifesaving_medicines (family_id, resident_id, sort_order);

create table public.emergency_contacts (
  id             uuid primary key default uuidv7(),
  family_id      uuid not null,
  resident_id    uuid not null,
  display_name   text not null check (char_length(display_name) between 1 and 80),
  phone          text,
  relationship   text,
  has_keys       boolean not null default false,
  sort_order     smallint not null default 0 check (sort_order >= 0),
  unique (family_id, id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check (phone is null or phone ~ '^[+][1-9][0-9]{1,14}$'),
  check (relationship is null or char_length(relationship) between 1 and 80)
);
create index emergency_contacts_order_idx
  on public.emergency_contacts (family_id, resident_id, sort_order);

create table public.pets (
  id           uuid primary key default uuidv7(),
  version      integer not null default 1 check (version >= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.auth_users(id) on delete set null,
  updated_by   uuid references public.auth_users(id) on delete set null,
  family_id    uuid not null references public.families(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  species      public.pet_species not null,
  breed        text,
  notes        text,
  vet_name     text,
  vet_phone    text,
  vet_address  text,
  plan_locked_at timestamptz,
  deleted_at   timestamptz,
  unique (family_id, id),
  check (breed is null or char_length(breed) between 1 and 80),
  check (notes is null or char_length(notes) <= 2000),
  check (vet_name is null or char_length(vet_name) between 1 and 120),
  check (vet_phone is null or vet_phone ~ '^[+][1-9][0-9]{1,14}$'),
  check (vet_address is null or char_length(vet_address) between 1 and 300)
);
create index pets_family_idx on public.pets (family_id) where deleted_at is null;
create trigger pets_touch before update on public.pets
  for each row execute function app.touch_updated_at();

create table public.pet_houses (
  family_id  uuid not null,
  pet_id     uuid not null,
  house_id   uuid not null,
  primary key (pet_id, house_id),
  foreign key (family_id, pet_id) references public.pets(family_id, id) on delete cascade,
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade
);

create table public.phone_lines (
  id                   uuid primary key default uuidv7(),
  version              integer not null default 1 check (version >= 1),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references public.auth_users(id) on delete set null,
  updated_by           uuid references public.auth_users(id) on delete set null,
  family_id            uuid not null references public.families(id) on delete cascade,
  resident_id          uuid not null,
  operator_name        text not null check (char_length(operator_name) between 1 and 80),
  phone_number         text not null check (phone_number ~ '^[+][1-9][0-9]{1,14}$'),
  plan_name            text not null check (char_length(plan_name) between 1 and 120),
  monthly_cost_minor   integer,
  currency             char(3) references public.currencies(code),
  renewal_date         date,
  deleted_at           timestamptz,
  unique (family_id, id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check ((monthly_cost_minor is null) = (currency is null)),
  check (monthly_cost_minor is null or monthly_cost_minor >= 0)
);
create index phone_lines_resident_idx on public.phone_lines (family_id, resident_id) where deleted_at is null;
create trigger phone_lines_touch before update on public.phone_lines
  for each row execute function app.touch_updated_at();

create table public.subscriptions (
  id             uuid primary key default uuidv7(),
  version        integer not null default 1 check (version >= 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.auth_users(id) on delete set null,
  updated_by     uuid references public.auth_users(id) on delete set null,
  family_id      uuid not null references public.families(id) on delete cascade,
  resident_id    uuid not null,
  name           text not null check (char_length(name) between 1 and 120),
  provider_name  text,
  renewal_date   date,
  cost_minor     integer,
  currency       char(3) references public.currencies(code),
  notes          text,
  deleted_at     timestamptz,
  unique (family_id, id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check (provider_name is null or char_length(provider_name) between 1 and 120),
  check (notes is null or char_length(notes) <= 2000),
  check ((cost_minor is null) = (currency is null)),
  check (cost_minor is null or cost_minor >= 0)
);
create index subscriptions_resident_idx on public.subscriptions (family_id, resident_id) where deleted_at is null;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function app.touch_updated_at();

create table public.vehicles (
  id                       uuid primary key default uuidv7(),
  version                  integer not null default 1 check (version >= 1),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid references public.auth_users(id) on delete set null,
  updated_by               uuid references public.auth_users(id) on delete set null,
  family_id                uuid not null references public.families(id) on delete cascade,
  resident_id              uuid not null,
  plate                    text not null,
  make                     text,
  model                    text,
  insurance_renewal_date   date,
  road_tax_due_date        date,
  inspection_due_date      date,
  deleted_at               timestamptz,
  unique (family_id, id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check (plate ~ '^[A-Z0-9][A-Z0-9 -]{0,15}$'),
  check (make is null or char_length(make) between 1 and 80),
  check (model is null or char_length(model) between 1 and 80)
);
create unique index vehicles_plate_idx on public.vehicles (family_id, plate) where deleted_at is null;
create trigger vehicles_touch before update on public.vehicles
  for each row execute function app.touch_updated_at();

create table public.personal_bank_accounts (
  id              uuid primary key default uuidv7(),
  version         integer not null default 1 check (version >= 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.auth_users(id) on delete set null,
  updated_by      uuid references public.auth_users(id) on delete set null,
  family_id       uuid not null references public.families(id) on delete cascade,
  resident_id     uuid not null,
  institution     text not null check (char_length(institution) between 1 and 120),
  label           text not null check (char_length(label) between 1 and 80),
  reference_hint  text,
  notes           text,
  deleted_at      timestamptz,
  unique (family_id, id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check (reference_hint is null or reference_hint ~ '^[0-9]{2,8}$'),
  check (notes is null or char_length(notes) <= 500)
);
create index personal_bank_accounts_resident_idx
  on public.personal_bank_accounts (family_id, resident_id) where deleted_at is null;
create trigger personal_bank_accounts_touch before update on public.personal_bank_accounts
  for each row execute function app.touch_updated_at();

create table public.tax_checklist_items (
  id           uuid primary key default uuidv7(),
  version      integer not null default 1 check (version >= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.auth_users(id) on delete set null,
  updated_by   uuid references public.auth_users(id) on delete set null,
  family_id    uuid not null references public.families(id) on delete cascade,
  resident_id  uuid not null,
  tax_year     smallint not null check (tax_year between 2000 and 2100),
  item_key     public.tax_item_key not null,
  due_date     date,
  status       public.tax_item_status not null default 'todo',
  unique (family_id, id),
  unique (family_id, resident_id, tax_year, item_key),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade
);
create trigger tax_checklist_items_touch before update on public.tax_checklist_items
  for each row execute function app.touch_updated_at();

-- Guests never read people, even if a resident was assigned by mistake.
create policy not_guest on public.residents as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

alter table public.resident_profiles enable row level security;
create policy tenant on public.resident_profiles for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.resident_profiles as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.resident_profiles as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

alter table public.lifesaving_medicines enable row level security;
create policy tenant on public.lifesaving_medicines for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.lifesaving_medicines as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.lifesaving_medicines as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

alter table public.emergency_contacts enable row level security;
create policy tenant on public.emergency_contacts for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.emergency_contacts as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.emergency_contacts as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

alter table public.pets enable row level security;
create policy tenant on public.pets for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy not_guest on public.pets as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy managers_insert on public.pets as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.pets as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.pets as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

alter table public.pet_houses enable row level security;
create policy tenant on public.pet_houses for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.pet_houses as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy not_guest on public.pet_houses as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy managers_insert on public.pet_houses as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.pet_houses as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.pet_houses as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

alter table public.phone_lines enable row level security;
create policy tenant on public.phone_lines for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.phone_lines as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.phone_lines as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy managers_insert on public.phone_lines as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.phone_lines as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.phone_lines as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

alter table public.subscriptions enable row level security;
create policy tenant on public.subscriptions for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.subscriptions as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.subscriptions as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy managers_insert on public.subscriptions as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.subscriptions as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.subscriptions as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

alter table public.vehicles enable row level security;
create policy tenant on public.vehicles for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.vehicles as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.vehicles as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy managers_insert on public.vehicles as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.vehicles as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.vehicles as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

alter table public.personal_bank_accounts enable row level security;
create policy tenant on public.personal_bank_accounts for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.personal_bank_accounts as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.personal_bank_accounts as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy managers_insert on public.personal_bank_accounts as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.personal_bank_accounts as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.personal_bank_accounts as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

alter table public.tax_checklist_items enable row level security;
create policy tenant on public.tax_checklist_items for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.tax_checklist_items as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.tax_checklist_items as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

grant select, insert, update, delete on
  public.resident_profiles, public.lifesaving_medicines, public.emergency_contacts,
  public.pets, public.pet_houses, public.phone_lines, public.subscriptions, public.vehicles,
  public.personal_bank_accounts, public.tax_checklist_items
to domusafe_app;
