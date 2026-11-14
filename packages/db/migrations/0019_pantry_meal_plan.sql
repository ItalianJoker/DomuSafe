-- Pantry stock and weekly meal plan entries (phase 2 §6.20).
-- Completes kitchen under Extra with recipes and shopping from 0018.
-- Barcode product catalogue is family-scoped; pantry rows belong to a house.
-- Meal plan PDF export stays in the browser.

create type public.meal_slot as enum ('breakfast', 'lunch', 'dinner', 'snack');

create table public.meal_plan_entries (
  id           uuid primary key default uuidv7(),
  version      integer not null default 1 check (version >= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.auth_users(id) on delete set null,
  updated_by   uuid references public.auth_users(id) on delete set null,
  family_id    uuid not null references public.families(id) on delete cascade,
  house_id     uuid,
  plan_date    date not null,
  slot         public.meal_slot not null,
  recipe_id    uuid,
  title        text,
  servings     smallint check (servings is null or servings between 1 and 99),
  notes        text,
  deleted_at   timestamptz,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, recipe_id) references public.recipes(family_id, id) on delete set null,
  check (recipe_id is not null or (title is not null and char_length(btrim(title)) between 1 and 160)),
  check (title is null or char_length(btrim(title)) between 1 and 160),
  check (notes is null or char_length(notes) <= 2000)
);
create index meal_plan_entries_family_date_idx
  on public.meal_plan_entries (family_id, plan_date, slot, id)
  where deleted_at is null;
create trigger meal_plan_entries_touch before update on public.meal_plan_entries
  for each row execute function app.touch_updated_at();

create table public.pantry_items (
  id               uuid primary key default uuidv7(),
  version          integer not null default 1 check (version >= 1),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.auth_users(id) on delete set null,
  updated_by       uuid references public.auth_users(id) on delete set null,
  family_id        uuid not null references public.families(id) on delete cascade,
  house_id         uuid not null,
  name             text not null,
  barcode          text,
  quantity         numeric(12, 3) not null default 1 check (quantity >= 0),
  unit             text,
  storage_unit_id  uuid,
  expiry_date      date,
  min_quantity     numeric(12, 3) check (min_quantity is null or min_quantity >= 0),
  custom_fields    jsonb not null default '{}'
                   check (jsonb_typeof(custom_fields) = 'object' and octet_length(custom_fields::text) <= 16384),
  deleted_at       timestamptz,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, storage_unit_id) references public.storage_units(family_id, id) on delete set null,
  check (char_length(btrim(name)) between 1 and 160),
  check (barcode is null or char_length(btrim(barcode)) between 1 and 64),
  check (unit is null or char_length(btrim(unit)) between 1 and 40)
);
create index pantry_items_house_expiry_idx
  on public.pantry_items (family_id, house_id, expiry_date, id)
  where deleted_at is null;
create index pantry_items_barcode_idx
  on public.pantry_items (family_id, barcode)
  where deleted_at is null and barcode is not null;
create trigger pantry_items_touch before update on public.pantry_items
  for each row execute function app.touch_updated_at();

-- Rejects a pantry storage unit that is missing or belongs to another house.
create function app.enforce_pantry_storage_house() returns trigger
  language plpgsql
  set search_path = public, pg_temp
  as $$
declare
  unit_house uuid;
begin
  if new.storage_unit_id is null then
    return new;
  end if;
  select house_id into unit_house
  from public.storage_units
  where family_id = new.family_id and id = new.storage_unit_id and deleted_at is null;
  if unit_house is null then
    raise exception 'Pantry storage unit is missing'
      using errcode = '23514', constraint = 'pantry_storage_missing';
  end if;
  if unit_house is distinct from new.house_id then
    raise exception 'Pantry storage unit must share the house'
      using errcode = '23514', constraint = 'pantry_storage_house';
  end if;
  return new;
end;
$$;

create trigger pantry_items_storage_house
  before insert or update of storage_unit_id, house_id
  on public.pantry_items
  for each row execute function app.enforce_pantry_storage_house();

create table public.barcode_products (
  id            uuid primary key default uuidv7(),
  family_id     uuid not null references public.families(id) on delete cascade,
  barcode       text not null,
  name          text not null,
  brand         text,
  default_unit  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (family_id, barcode),
  unique (family_id, id),
  check (char_length(btrim(barcode)) between 1 and 64),
  check (char_length(btrim(name)) between 1 and 160),
  check (brand is null or char_length(btrim(brand)) between 1 and 120),
  check (default_unit is null or char_length(btrim(default_unit)) between 1 and 40)
);
create trigger barcode_products_touch before update on public.barcode_products
  for each row execute function app.touch_updated_at();

-- Meal plan and pantry: members read; admin, parent and caregiver write (kitchen.write).
alter table public.meal_plan_entries enable row level security;
create policy tenant on public.meal_plan_entries for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.meal_plan_entries as restrictive for all to domusafe_app
  using (
    house_id is null
    or (select app.all_houses())
    or house_id = any ((select app.house_ids())::uuid[])
  )
  with check (
    house_id is null
    or (select app.all_houses())
    or house_id = any ((select app.house_ids())::uuid[])
  );
create policy kitchen_writers_insert on public.meal_plan_entries as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );
create policy kitchen_writers_update on public.meal_plan_entries as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );
create policy kitchen_writers_delete on public.meal_plan_entries as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );

alter table public.pantry_items enable row level security;
create policy tenant on public.pantry_items for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.pantry_items as restrictive for all to domusafe_app
  using (
    (select app.all_houses())
    or house_id = any ((select app.house_ids())::uuid[])
  )
  with check (
    (select app.all_houses())
    or house_id = any ((select app.house_ids())::uuid[])
  );
create policy kitchen_writers_insert on public.pantry_items as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );
create policy kitchen_writers_update on public.pantry_items as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );
create policy kitchen_writers_delete on public.pantry_items as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );

alter table public.barcode_products enable row level security;
create policy tenant on public.barcode_products for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy kitchen_writers_write on public.barcode_products as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );
create policy kitchen_writers_update on public.barcode_products as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );
create policy kitchen_writers_delete on public.barcode_products as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );

grant select, insert, update, delete on
  public.meal_plan_entries, public.pantry_items, public.barcode_products
to domusafe_app;
