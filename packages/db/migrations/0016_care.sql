-- Care coordination: vital parameters diary, «Chi sono» identity sheet, caregiver handovers.
-- Readable class-C style fields (same approach as the rescue card) so caregivers can edit without
-- a client-side key ceremony. Encrypted envelopes remain a later architectural step.

create type public.handover_audience as enum ('family', 'guest');

create table public.vital_entries (
  id                         uuid primary key default uuidv7(),
  version                    integer not null default 1 check (version >= 1),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  created_by                 uuid references public.auth_users(id) on delete set null,
  updated_by                 uuid references public.auth_users(id) on delete set null,
  family_id                  uuid not null references public.families(id) on delete cascade,
  resident_id                uuid not null,
  measured_at                timestamptz not null,
  systolic_mmhg              smallint check (systolic_mmhg is null or systolic_mmhg between 40 and 300),
  diastolic_mmhg             smallint check (diastolic_mmhg is null or diastolic_mmhg between 20 and 200),
  heart_rate_bpm             smallint check (heart_rate_bpm is null or heart_rate_bpm between 20 and 300),
  temperature_celsius        numeric check (
    temperature_celsius is null or temperature_celsius between 30.0 and 45.0
  ),
  blood_glucose_mg_dl        smallint check (
    blood_glucose_mg_dl is null or blood_glucose_mg_dl between 20 and 800
  ),
  weight_kg                  numeric check (weight_kg is null or weight_kg between 1.0 and 500.0),
  oxygen_saturation_percent  smallint check (
    oxygen_saturation_percent is null or oxygen_saturation_percent between 50 and 100
  ),
  notes                      text,
  deleted_at                 timestamptz,
  unique (family_id, id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check (notes is null or char_length(notes) <= 2000),
  check (
    (systolic_mmhg is null) = (diastolic_mmhg is null)
  ),
  check (
    systolic_mmhg is not null
    or heart_rate_bpm is not null
    or temperature_celsius is not null
    or blood_glucose_mg_dl is not null
    or weight_kg is not null
    or oxygen_saturation_percent is not null
    or (notes is not null and char_length(btrim(notes)) > 0)
  )
);
create index vital_entries_resident_measured_idx
  on public.vital_entries (family_id, resident_id, measured_at desc)
  where deleted_at is null;
create trigger vital_entries_touch before update on public.vital_entries
  for each row execute function app.touch_updated_at();

create table public.resident_about_cards (
  resident_id          uuid primary key,
  family_id            uuid not null,
  preferred_name       text,
  how_to_address       text,
  likes                jsonb not null default '[]',
  dislikes             jsonb not null default '[]',
  daily_routine        text,
  calming_tips         text,
  communication_tips   text,
  important_notes      text,
  version              integer not null default 1 check (version >= 1),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references public.auth_users(id) on delete set null,
  updated_by           uuid references public.auth_users(id) on delete set null,
  unique (family_id, resident_id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check (preferred_name is null or char_length(btrim(preferred_name)) between 1 and 80),
  check (how_to_address is null or char_length(how_to_address) <= 500),
  check (jsonb_typeof(likes) = 'array' and jsonb_array_length(likes) <= 40),
  check (jsonb_typeof(dislikes) = 'array' and jsonb_array_length(dislikes) <= 40),
  check (daily_routine is null or char_length(daily_routine) <= 4000),
  check (calming_tips is null or char_length(calming_tips) <= 4000),
  check (communication_tips is null or char_length(communication_tips) <= 4000),
  check (important_notes is null or char_length(important_notes) <= 4000)
);
create trigger resident_about_cards_touch before update on public.resident_about_cards
  for each row execute function app.touch_updated_at();

create table public.handovers (
  id                 uuid primary key default uuidv7(),
  version            integer not null default 1 check (version >= 1),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.auth_users(id) on delete set null,
  updated_by         uuid references public.auth_users(id) on delete set null,
  family_id          uuid not null references public.families(id) on delete cascade,
  house_id           uuid,
  resident_id        uuid,
  audience           public.handover_audience not null default 'family',
  body               text not null check (char_length(btrim(body)) between 1 and 4000),
  posted_at          timestamptz not null default now(),
  acknowledged_at    timestamptz,
  acknowledged_by    uuid references public.auth_users(id) on delete set null,
  deleted_at         timestamptz,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check (acknowledged_at is null or acknowledged_by is not null),
  check (acknowledged_at is null or acknowledged_at >= posted_at)
);
create index handovers_family_posted_idx
  on public.handovers (family_id, posted_at desc)
  where deleted_at is null;
create index handovers_house_posted_idx
  on public.handovers (family_id, house_id, posted_at desc)
  where deleted_at is null and house_id is not null;
create trigger handovers_touch before update on public.handovers
  for each row execute function app.touch_updated_at();

-- Vital diary and Chi sono: non-guests with resident scope; caregivers write through the API.
alter table public.vital_entries enable row level security;
create policy tenant on public.vital_entries for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.vital_entries as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.vital_entries as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

alter table public.resident_about_cards enable row level security;
create policy tenant on public.resident_about_cards for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.resident_about_cards as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.resident_about_cards as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

-- Handovers: guests only see and acknowledge notes written for guests.
alter table public.handovers enable row level security;
create policy tenant on public.handovers for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.handovers as restrictive for all to domusafe_app
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
create policy resident_guard on public.handovers as restrictive for all to domusafe_app
  using (
    resident_id is null
    or (select app.all_residents())
    or resident_id = any ((select app.resident_ids())::uuid[])
  )
  with check (
    resident_id is null
    or (select app.all_residents())
    or resident_id = any ((select app.resident_ids())::uuid[])
  );
create policy guest_select on public.handovers as restrictive for select to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) is distinct from 'guest'
    or audience = 'guest'
  );
create policy care_insert on public.handovers as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
    or ((select app.role()) = 'guest' and audience = 'guest')
  );
create policy care_update on public.handovers as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
    or ((select app.role()) = 'guest' and audience = 'guest')
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
    or ((select app.role()) = 'guest' and audience = 'guest')
  );
create policy care_delete on public.handovers as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,caregiver}'::public.member_role[])
  );

grant select, insert, update, delete on
  public.vital_entries, public.resident_about_cards, public.handovers
to domusafe_app;
