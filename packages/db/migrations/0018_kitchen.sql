-- Kitchen recipes and shopping lists by store and aisle (phase 2 §6.20).
-- Class C operational data under Extra. Meal planner and pantry stay out of this migration.
-- Recipe URL import is synchronous in the API with SSRF guards; rows keep a short audit trail.

create type public.recipe_import_status as enum ('queued', 'running', 'succeeded', 'failed');

create table public.recipes (
  id              uuid primary key default uuidv7(),
  version         integer not null default 1 check (version >= 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.auth_users(id) on delete set null,
  updated_by      uuid references public.auth_users(id) on delete set null,
  family_id       uuid not null references public.families(id) on delete cascade,
  title           text not null,
  description     text,
  servings        smallint check (servings is null or servings between 1 and 99),
  prep_minutes    smallint check (prep_minutes is null or prep_minutes between 0 and 24 * 60),
  cook_minutes    smallint check (cook_minutes is null or cook_minutes between 0 and 24 * 60),
  ingredients     jsonb not null default '[]'::jsonb,
  steps           jsonb not null default '[]'::jsonb,
  tags            text[] not null default '{}',
  source_url      text,
  source_name     text,
  custom_fields   jsonb not null default '{}'
                  check (jsonb_typeof(custom_fields) = 'object' and octet_length(custom_fields::text) <= 16384),
  deleted_at      timestamptz,
  unique (family_id, id),
  check (char_length(btrim(title)) between 1 and 160),
  check (description is null or char_length(description) <= 4000),
  check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) <= 200),
  check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 200),
  check (cardinality(tags) <= 32),
  check (source_url is null or char_length(source_url) between 1 and 2048),
  check (source_name is null or char_length(btrim(source_name)) between 1 and 160)
);
create index recipes_family_created_idx
  on public.recipes (family_id, created_at desc, id desc)
  where deleted_at is null;
create trigger recipes_touch before update on public.recipes
  for each row execute function app.touch_updated_at();

create table public.recipe_imports (
  id           uuid primary key default uuidv7(),
  family_id    uuid not null references public.families(id) on delete cascade,
  url          text not null,
  status       public.recipe_import_status not null default 'queued',
  error_code   text,
  recipe_id    uuid,
  created_by   uuid references public.auth_users(id) on delete set null,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz,
  unique (family_id, id),
  foreign key (family_id, recipe_id) references public.recipes(family_id, id) on delete set null,
  check (char_length(url) between 1 and 2048),
  check (error_code is null or char_length(error_code) between 1 and 80),
  check (
    (status in ('queued', 'running') and finished_at is null and recipe_id is null)
    or (status = 'succeeded' and finished_at is not null and recipe_id is not null and error_code is null)
    or (status = 'failed' and finished_at is not null and recipe_id is null)
  )
);
create index recipe_imports_family_created_idx
  on public.recipe_imports (family_id, created_at desc);

create table public.stores (
  id           uuid primary key default uuidv7(),
  version      integer not null default 1 check (version >= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.auth_users(id) on delete set null,
  updated_by   uuid references public.auth_users(id) on delete set null,
  family_id    uuid not null references public.families(id) on delete cascade,
  name         text not null,
  aisle_order  text[] not null default '{}',
  deleted_at   timestamptz,
  unique (family_id, id),
  check (char_length(btrim(name)) between 1 and 140),
  check (cardinality(aisle_order) <= 64)
);
create index stores_family_created_idx
  on public.stores (family_id, created_at desc, id desc)
  where deleted_at is null;
create trigger stores_touch before update on public.stores
  for each row execute function app.touch_updated_at();

create table public.shopping_lists (
  id           uuid primary key default uuidv7(),
  version      integer not null default 1 check (version >= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.auth_users(id) on delete set null,
  updated_by   uuid references public.auth_users(id) on delete set null,
  family_id    uuid not null references public.families(id) on delete cascade,
  house_id     uuid,
  store_id     uuid,
  name         text not null,
  archived_at  timestamptz,
  deleted_at   timestamptz,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, store_id) references public.stores(family_id, id) on delete set null,
  check (char_length(btrim(name)) between 1 and 140)
);
create index shopping_lists_family_created_idx
  on public.shopping_lists (family_id, created_at desc, id desc)
  where deleted_at is null;
create trigger shopping_lists_touch before update on public.shopping_lists
  for each row execute function app.touch_updated_at();

create table public.shopping_items (
  id           uuid primary key default uuidv7(),
  version      integer not null default 1 check (version >= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.auth_users(id) on delete set null,
  updated_by   uuid references public.auth_users(id) on delete set null,
  family_id    uuid not null references public.families(id) on delete cascade,
  list_id      uuid not null,
  name         text not null,
  quantity     numeric(12, 3),
  unit         text,
  aisle        text,
  position     integer not null default 0 check (position between 0 and 100000),
  checked_at   timestamptz,
  checked_by   uuid references public.auth_users(id) on delete set null,
  deleted_at   timestamptz,
  unique (family_id, id),
  foreign key (family_id, list_id) references public.shopping_lists(family_id, id) on delete cascade,
  check (char_length(btrim(name)) between 1 and 160),
  check (quantity is null or quantity > 0),
  check (unit is null or char_length(btrim(unit)) between 1 and 40),
  check (aisle is null or char_length(btrim(aisle)) between 1 and 80),
  check (checked_at is null or checked_by is not null)
);
create index shopping_items_list_open_idx
  on public.shopping_items (family_id, list_id, checked_at nulls first, position, id)
  where deleted_at is null;
create trigger shopping_items_touch before update on public.shopping_items
  for each row execute function app.touch_updated_at();

-- Recipes: members read; admin, parent and caregiver write (kitchen.write). Guests and children cannot write.
alter table public.recipes enable row level security;
create policy tenant on public.recipes for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy kitchen_writers_insert on public.recipes as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );
create policy kitchen_writers_update on public.recipes as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );
create policy kitchen_writers_delete on public.recipes as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );

alter table public.recipe_imports enable row level security;
create policy tenant on public.recipe_imports for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy not_guest on public.recipe_imports as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy kitchen_writers_insert on public.recipe_imports as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );
create policy kitchen_writers_update on public.recipe_imports as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );

-- Shopping: every member may read and write (shopping.*). Optional house scope on lists.
alter table public.stores enable row level security;
create policy tenant on public.stores for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));

alter table public.shopping_lists enable row level security;
create policy tenant on public.shopping_lists for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.shopping_lists as restrictive for all to domusafe_app
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

alter table public.shopping_items enable row level security;
create policy tenant on public.shopping_items for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));

grant select, insert, update, delete on
  public.recipes, public.recipe_imports, public.stores, public.shopping_lists, public.shopping_items
to domusafe_app;
