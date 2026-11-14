-- Home automation bridge: Home Assistant and MQTT connections, devices, zones, events and temporary lock codes
-- (phase 2 §6.17). Class C operational rows; connection tokens and broker passwords are class S (`S1` blobs).
-- Writes on connections are admin-only. Caregivers may read alarm and sensor devices of assigned houses.

create type public.ha_connection_kind as enum (
  'home_assistant_webhook',
  'home_assistant_api',
  'mqtt'
);

create type public.ha_connection_status as enum ('active', 'error', 'disabled');

create type public.ha_device_kind as enum (
  'temperature',
  'humidity',
  'power',
  'energy',
  'solar_production',
  'battery',
  'ev_charger',
  'water_leak',
  'smoke',
  'door_window',
  'motion',
  'alarm_panel',
  'lock',
  'other'
);

create type public.ha_event_kind as enum (
  'alarm_triggered',
  'alarm_cleared',
  'leak_detected',
  'smoke_detected',
  'lock_locked',
  'lock_unlocked',
  'door_opened',
  'battery_low',
  'device_offline',
  'state_changed'
);

create type public.ha_zone_alarm_state as enum (
  'disarmed',
  'armed_home',
  'armed_away',
  'triggered'
);

create type public.ha_lock_code_status as enum ('active', 'revoked', 'expired');

create table public.ha_connections (
  id                              uuid primary key default uuidv7(),
  version                         integer not null default 1 check (version >= 1),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  created_by                      uuid references public.auth_users(id) on delete set null,
  updated_by                      uuid references public.auth_users(id) on delete set null,
  family_id                       uuid not null references public.families(id) on delete cascade,
  house_id                        uuid not null,
  kind                            public.ha_connection_kind not null,
  name                            text not null,
  base_url                        text,
  mqtt_url                        text,
  mqtt_topic_prefix               text,
  mqtt_username                   text,
  credentials_sealed              bytea,
  inbound_secret_current_sealed   bytea,
  inbound_secret_previous_sealed  bytea,
  secret_rotated_at               timestamptz,
  status                          public.ha_connection_status not null default 'active',
  last_event_at                   timestamptz,
  last_checked_at                 timestamptz,
  last_error_code                 text,
  deleted_at                      timestamptz,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  check (char_length(btrim(name)) between 1 and 140),
  check (base_url is null or char_length(base_url) between 1 and 2048),
  check (mqtt_url is null or char_length(mqtt_url) between 1 and 2048),
  check (mqtt_topic_prefix is null or char_length(mqtt_topic_prefix) between 1 and 200),
  check (mqtt_username is null or char_length(btrim(mqtt_username)) between 1 and 200),
  check (last_error_code is null or char_length(last_error_code) between 1 and 80),
  check (
    credentials_sealed is null
    or (octet_length(credentials_sealed) >= 29 and get_byte(credentials_sealed, 0) = 83)
  ),
  check (
    inbound_secret_current_sealed is null
    or (octet_length(inbound_secret_current_sealed) >= 29 and get_byte(inbound_secret_current_sealed, 0) = 83)
  ),
  check (
    inbound_secret_previous_sealed is null
    or (octet_length(inbound_secret_previous_sealed) >= 29 and get_byte(inbound_secret_previous_sealed, 0) = 83)
  ),
  check (
    (kind = 'mqtt' and mqtt_url is not null)
    or (kind in ('home_assistant_webhook', 'home_assistant_api') and base_url is not null)
  )
);
create index ha_connections_house_idx
  on public.ha_connections (family_id, house_id, created_at desc, id desc)
  where deleted_at is null;
create trigger ha_connections_touch before update on public.ha_connections
  for each row execute function app.touch_updated_at();

create table public.ha_zones (
  id           uuid primary key default uuidv7(),
  version      integer not null default 1 check (version >= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.auth_users(id) on delete set null,
  updated_by   uuid references public.auth_users(id) on delete set null,
  family_id    uuid not null references public.families(id) on delete cascade,
  house_id     uuid not null,
  name         text not null,
  external_id  text,
  alarm_state  public.ha_zone_alarm_state not null default 'disarmed',
  deleted_at   timestamptz,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  check (char_length(btrim(name)) between 1 and 140),
  check (external_id is null or char_length(btrim(external_id)) between 1 and 200)
);
create index ha_zones_house_idx
  on public.ha_zones (family_id, house_id, created_at desc, id desc)
  where deleted_at is null;
create trigger ha_zones_touch before update on public.ha_zones
  for each row execute function app.touch_updated_at();

create table public.ha_devices (
  id              uuid primary key default uuidv7(),
  version         integer not null default 1 check (version >= 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.auth_users(id) on delete set null,
  updated_by      uuid references public.auth_users(id) on delete set null,
  family_id       uuid not null references public.families(id) on delete cascade,
  house_id        uuid not null,
  connection_id   uuid not null,
  zone_id         uuid,
  room_id         uuid,
  external_id     text not null,
  kind            public.ha_device_kind not null default 'other',
  name            text not null,
  unit            text,
  last_value      double precision,
  last_state      text,
  last_seen_at    timestamptz,
  deleted_at      timestamptz,
  unique (family_id, id),
  unique (connection_id, external_id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, connection_id) references public.ha_connections(family_id, id) on delete cascade,
  foreign key (family_id, zone_id) references public.ha_zones(family_id, id) on delete set null,
  foreign key (family_id, room_id) references public.rooms(family_id, id) on delete set null,
  check (char_length(btrim(external_id)) between 1 and 200),
  check (char_length(btrim(name)) between 1 and 160),
  check (unit is null or char_length(btrim(unit)) between 1 and 40),
  check (last_state is null or char_length(last_state) <= 200)
);
create index ha_devices_house_kind_idx
  on public.ha_devices (family_id, house_id, kind, created_at desc, id desc)
  where deleted_at is null;
create trigger ha_devices_touch before update on public.ha_devices
  for each row execute function app.touch_updated_at();

create table public.ha_events (
  id           uuid primary key default uuidv7(),
  family_id    uuid not null references public.families(id) on delete cascade,
  house_id     uuid not null,
  device_id    uuid,
  occurred_at  timestamptz not null,
  kind         public.ha_event_kind not null,
  state        jsonb not null default '{}'::jsonb
               check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 2048),
  notified_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, device_id) references public.ha_devices(family_id, id) on delete set null
);
create index ha_events_house_occurred_idx
  on public.ha_events (family_id, house_id, occurred_at desc, id desc);

create table public.ha_lock_codes (
  id            uuid primary key default uuidv7(),
  version       integer not null default 1 check (version >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.auth_users(id) on delete set null,
  updated_by    uuid references public.auth_users(id) on delete set null,
  family_id     uuid not null references public.families(id) on delete cascade,
  house_id      uuid not null,
  device_id     uuid not null,
  label         text not null,
  valid_from    timestamptz not null,
  valid_until   timestamptz not null,
  code_suffix   text not null,
  status        public.ha_lock_code_status not null default 'active',
  external_slot text,
  deleted_at    timestamptz,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, device_id) references public.ha_devices(family_id, id) on delete cascade,
  check (char_length(btrim(label)) between 1 and 140),
  check (char_length(code_suffix) between 1 and 8),
  check (valid_until > valid_from),
  check (external_slot is null or char_length(btrim(external_slot)) between 1 and 80)
);
create index ha_lock_codes_house_idx
  on public.ha_lock_codes (family_id, house_id, valid_until desc, id desc)
  where deleted_at is null;
create trigger ha_lock_codes_touch before update on public.ha_lock_codes
  for each row execute function app.touch_updated_at();

-- Connections: members of the house may read; only admins write (automation.manage).
alter table public.ha_connections enable row level security;
create policy tenant on public.ha_connections for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.ha_connections as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy not_guest on public.ha_connections as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy admin_write_insert on public.ha_connections as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = 'admin');
create policy admin_write_update on public.ha_connections as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = 'admin')
  with check ((select app.principal()) = 'system' or (select app.role()) = 'admin');
create policy admin_write_delete on public.ha_connections as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = 'admin');

alter table public.ha_zones enable row level security;
create policy tenant on public.ha_zones for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.ha_zones as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy not_guest on public.ha_zones as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy managers_write_insert on public.ha_zones as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_write_update on public.ha_zones as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_write_delete on public.ha_zones as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );

alter table public.ha_devices enable row level security;
create policy tenant on public.ha_devices for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.ha_devices as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy not_guest on public.ha_devices as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy managers_write_insert on public.ha_devices as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_write_update on public.ha_devices as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_write_delete on public.ha_devices as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );

alter table public.ha_events enable row level security;
create policy tenant on public.ha_events for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.ha_events as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy not_guest on public.ha_events as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

alter table public.ha_lock_codes enable row level security;
create policy tenant on public.ha_lock_codes for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.ha_lock_codes as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy not_guest on public.ha_lock_codes as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy admin_write_insert on public.ha_lock_codes as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = 'admin');
create policy admin_write_update on public.ha_lock_codes as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = 'admin')
  with check ((select app.principal()) = 'system' or (select app.role()) = 'admin');
create policy admin_write_delete on public.ha_lock_codes as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = 'admin');

-- Resolves a webhook connection without a family session (system principal then switches family).
create function app.ha_connection_by_id(p_connection_id uuid)
  returns table (
    id uuid,
    family_id uuid,
    house_id uuid,
    status public.ha_connection_status,
    deleted_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select c.id, c.family_id, c.house_id, c.status, c.deleted_at
    from public.ha_connections c
    where c.id = p_connection_id
  $$;

grant select, insert, update, delete on
  public.ha_connections, public.ha_zones, public.ha_devices, public.ha_events, public.ha_lock_codes
to domusafe_app;
grant execute on function app.ha_connection_by_id(uuid) to domusafe_app;
