-- Rooms, storage units, inventory items and the unified search index (phase 2 §6.13, §6.15, §6.16).
-- Class C operational data. Photo and receipt travel as optional small data addresses until an object store exists.

create type public.room_kind as enum (
  'kitchen', 'living', 'bedroom', 'bathroom', 'office', 'laundry',
  'garage', 'cellar', 'attic', 'garden', 'balcony', 'other'
);

create type public.storage_unit_kind as enum (
  'furniture', 'wardrobe', 'shelf', 'drawer', 'box', 'container', 'other'
);

create table public.rooms (
  id            uuid primary key default uuidv7(),
  version       integer not null default 1 check (version >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.auth_users(id) on delete set null,
  updated_by    uuid references public.auth_users(id) on delete set null,
  family_id     uuid not null references public.families(id) on delete cascade,
  house_id      uuid not null,
  name          text not null check (char_length(btrim(name)) between 1 and 140),
  kind          public.room_kind not null default 'other',
  floor         smallint check (floor is null or floor between -5 and 200),
  sort_order    smallint not null default 0 check (sort_order >= 0),
  notes         text,
  custom_fields jsonb not null default '{}'
                check (jsonb_typeof(custom_fields) = 'object' and octet_length(custom_fields::text) <= 16384),
  deleted_at    timestamptz,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  check (notes is null or char_length(notes) <= 2000)
);
create index rooms_house_sort_idx
  on public.rooms (family_id, house_id, sort_order)
  where deleted_at is null;
create trigger rooms_touch before update on public.rooms
  for each row execute function app.touch_updated_at();

create table public.storage_units (
  id         uuid primary key default uuidv7(),
  version    integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.auth_users(id) on delete set null,
  updated_by uuid references public.auth_users(id) on delete set null,
  family_id  uuid not null references public.families(id) on delete cascade,
  house_id   uuid not null,
  room_id    uuid not null,
  parent_id  uuid,
  kind       public.storage_unit_kind not null default 'container',
  name       text not null check (char_length(btrim(name)) between 1 and 140),
  notes      text,
  sort_order smallint not null default 0 check (sort_order >= 0),
  deleted_at timestamptz,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, room_id) references public.rooms(family_id, id) on delete cascade,
  foreign key (family_id, parent_id) references public.storage_units(family_id, id) on delete cascade,
  check (notes is null or char_length(notes) <= 2000),
  check (parent_id is distinct from id)
);
create index storage_units_room_idx
  on public.storage_units (family_id, room_id, parent_id)
  where deleted_at is null;
create trigger storage_units_touch before update on public.storage_units
  for each row execute function app.touch_updated_at();

-- Rejects a storage unit deeper than four levels under its room.
create function app.enforce_storage_depth() returns trigger
  language plpgsql
  set search_path = public, pg_temp
  as $$
declare
  depth integer := 1;
  cursor_id uuid := new.parent_id;
  parent_room uuid;
  parent_house uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  select room_id, house_id into parent_room, parent_house
  from public.storage_units
  where family_id = new.family_id and id = new.parent_id and deleted_at is null;
  if parent_room is null then
    raise exception 'Storage parent is missing'
      using errcode = '23514', constraint = 'storage_parent_missing';
  end if;
  if parent_room is distinct from new.room_id or parent_house is distinct from new.house_id then
    raise exception 'Storage parent must share the room'
      using errcode = '23514', constraint = 'storage_parent_room';
  end if;
  while cursor_id is not null loop
    depth := depth + 1;
    if depth > 4 then
      raise exception 'Storage unit depth exceeds 4'
        using errcode = '23514', constraint = 'storage_depth';
    end if;
    select parent_id into cursor_id
    from public.storage_units
    where family_id = new.family_id and id = cursor_id and deleted_at is null;
  end loop;
  return new;
end
$$;

create trigger storage_units_depth before insert or update of parent_id, room_id, house_id
  on public.storage_units
  for each row execute function app.enforce_storage_depth();

create table public.inventory_items (
  id                   uuid primary key default uuidv7(),
  version              integer not null default 1 check (version >= 1),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references public.auth_users(id) on delete set null,
  updated_by           uuid references public.auth_users(id) on delete set null,
  family_id            uuid not null references public.families(id) on delete cascade,
  house_id             uuid not null,
  room_id              uuid not null,
  storage_unit_id      uuid,
  name                 text not null check (char_length(btrim(name)) between 1 and 160),
  category             text check (category is null or char_length(btrim(category)) between 1 and 80),
  quantity             numeric not null default 1 check (quantity > 0 and quantity <= 1000000000),
  unit                 text check (unit is null or char_length(btrim(unit)) between 1 and 40),
  brand                text check (brand is null or char_length(brand) <= 80),
  model                text check (model is null or char_length(model) <= 80),
  serial_number        text check (serial_number is null or char_length(serial_number) <= 80),
  barcode              text check (barcode is null or char_length(barcode) <= 64),
  purchase_date        date,
  purchase_price_minor bigint,
  currency             char(3) references public.currencies(code),
  warranty_until       date,
  warranty_notes       text,
  tags                 text[] not null default '{}',
  notes                text,
  photo_caption        text,
  photo_data_url       text,
  receipt_caption      text,
  receipt_data_url     text,
  custom_fields        jsonb not null default '{}'
                       check (jsonb_typeof(custom_fields) = 'object' and octet_length(custom_fields::text) <= 16384),
  deleted_at           timestamptz,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, room_id) references public.rooms(family_id, id) on delete cascade,
  foreign key (family_id, storage_unit_id) references public.storage_units(family_id, id) on delete set null,
  check (notes is null or char_length(notes) <= 4000),
  check (warranty_notes is null or char_length(warranty_notes) <= 2000),
  check (photo_caption is null or char_length(photo_caption) <= 200),
  check (receipt_caption is null or char_length(receipt_caption) <= 200),
  check ((purchase_price_minor is null) = (currency is null)),
  check (purchase_price_minor is null or purchase_price_minor >= 0),
  check (
    photo_data_url is null
    or (
      char_length(photo_data_url) between 32 and 24576
      and photo_data_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'
    )
  ),
  check (
    receipt_data_url is null
    or (
      char_length(receipt_data_url) between 32 and 24576
      and receipt_data_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'
    )
  ),
  check (cardinality(tags) <= 32)
);
create index inventory_items_house_idx
  on public.inventory_items (family_id, house_id, storage_unit_id)
  where deleted_at is null;
create index inventory_items_barcode_idx
  on public.inventory_items (family_id, barcode)
  where barcode is not null and deleted_at is null;
create index inventory_items_tags_idx
  on public.inventory_items using gin (tags)
  where deleted_at is null;
create trigger inventory_items_touch before update on public.inventory_items
  for each row execute function app.touch_updated_at();

-- Rejects empty or overlong tags (CHECK cannot use a subquery).
create function app.enforce_inventory_tags() returns trigger
  language plpgsql
  set search_path = public, pg_temp
  as $$
declare
  tag text;
begin
  foreach tag in array new.tags loop
    if char_length(btrim(tag)) < 1 or char_length(tag) > 40 then
      raise exception 'Inventory tag length is invalid'
        using errcode = '23514', constraint = 'inventory_tags';
    end if;
  end loop;
  return new;
end
$$;

create trigger inventory_items_tags
  before insert or update of tags
  on public.inventory_items
  for each row execute function app.enforce_inventory_tags();

-- Keeps an item in the same room as its storage unit when a unit is set.
create function app.enforce_inventory_storage_room() returns trigger
  language plpgsql
  set search_path = public, pg_temp
  as $$
declare
  unit_room uuid;
  unit_house uuid;
begin
  if new.storage_unit_id is null then
    return new;
  end if;
  select room_id, house_id into unit_room, unit_house
  from public.storage_units
  where family_id = new.family_id and id = new.storage_unit_id and deleted_at is null;
  if unit_room is null then
    raise exception 'Storage unit is missing'
      using errcode = '23514', constraint = 'inventory_storage_missing';
  end if;
  if unit_room is distinct from new.room_id or unit_house is distinct from new.house_id then
    raise exception 'Inventory item must share the storage room'
      using errcode = '23514', constraint = 'inventory_storage_room';
  end if;
  return new;
end
$$;

create trigger inventory_items_storage_room
  before insert or update of storage_unit_id, room_id, house_id
  on public.inventory_items
  for each row execute function app.enforce_inventory_storage_room();

create table public.search_index (
  resource_type    text not null check (resource_type ~ '^[a-z_]{2,40}$'),
  resource_id      uuid not null,
  family_id        uuid not null references public.families(id) on delete cascade,
  house_id         uuid,
  resident_id      uuid,
  visibility       public.visibility not null default 'family',
  owner_account_id uuid,
  audience_guest   boolean not null default false,
  title            text not null check (char_length(title) between 1 and 300),
  body             text not null default '' check (char_length(body) <= 20000),
  tags             text[] not null default '{}',
  updated_at       timestamptz not null default now(),
  tsv              tsvector generated always as (
                     setweight(to_tsvector('public.domusafe_it', title), 'A')
                     || setweight(to_tsvector('public.domusafe_it', body), 'B')
                   ) stored,
  primary key (resource_type, resource_id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade
);
create index search_index_tsv_idx on public.search_index using gin (tsv);
create index search_index_trgm_idx on public.search_index using gin (app.f_unaccent(title) gin_trgm_ops);
create index search_index_tags_idx on public.search_index using gin (tags);
create index search_index_family_idx on public.search_index (family_id, resource_type);

-- Row-level security: members read, managers write; guests are excluded.
alter table public.rooms enable row level security;
create policy tenant on public.rooms for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.rooms as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy not_guest on public.rooms as restrictive for select to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy managers_insert on public.rooms as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.rooms as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.rooms as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

alter table public.storage_units enable row level security;
create policy tenant on public.storage_units for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.storage_units as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy not_guest on public.storage_units as restrictive for select to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy managers_insert on public.storage_units as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.storage_units as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.storage_units as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

alter table public.inventory_items enable row level security;
create policy tenant on public.inventory_items for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.inventory_items as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy not_guest on public.inventory_items as restrictive for select to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy managers_insert on public.inventory_items as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.inventory_items as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.inventory_items as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

alter table public.search_index enable row level security;
create policy tenant on public.search_index for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.search_index as restrictive for all to domusafe_app
  using (house_id is null or (select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check (house_id is null or (select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy personal_guard on public.search_index as restrictive for all to domusafe_app
  using (visibility = 'family' or owner_account_id = app.account_id())
  with check (visibility = 'family' or owner_account_id = app.account_id());
create policy guest_guard on public.search_index as restrictive for select to domusafe_app
  using ((select app.role()) is distinct from 'guest' or audience_guest);
create policy managers_write on public.search_index as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_update on public.search_index as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));
create policy managers_delete on public.search_index as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

grant select, insert, update, delete on
  public.rooms, public.storage_units, public.inventory_items, public.search_index
to domusafe_app;

grant execute on function
  app.enforce_storage_depth(),
  app.enforce_inventory_storage_room(),
  app.enforce_inventory_tags()
to domusafe_app;
