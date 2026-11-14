-- Family calendar: appointments, weekly schedules and downloadable calendar-file export (phase 2 §6.19).
-- Class C operational data under Famiglia. Available on every plan. Public feed tokens are a later step;
-- authenticated export returns a calendar file for download.

create type public.calendar_category as enum (
  'appointment',
  'school',
  'work',
  'health',
  'birthday',
  'holiday',
  'other'
);

create type public.calendar_source as enum ('internal', 'ics_import');

create table public.calendar_events (
  id                uuid primary key default uuidv7(),
  version           integer not null default 1 check (version >= 1),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references public.auth_users(id) on delete set null,
  updated_by        uuid references public.auth_users(id) on delete set null,
  family_id         uuid not null references public.families(id) on delete cascade,
  house_id          uuid,
  visibility        public.visibility not null default 'family',
  owner_account_id  uuid references public.auth_users(id) on delete set null,
  title             text not null,
  description       text,
  location          text,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  all_day           boolean not null default false,
  timezone          text not null,
  rrule             text,
  exdates           date[] not null default '{}',
  category          public.calendar_category not null default 'other',
  source            public.calendar_source not null default 'internal',
  ics_uid           text,
  ics_source_label  text,
  deleted_at        timestamptz,
  unique (family_id, id),
  unique (family_id, ics_uid),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  check ((visibility = 'personal') = (owner_account_id is not null)),
  check (ends_at >= starts_at),
  check (char_length(btrim(title)) between 1 and 200),
  check (description is null or char_length(description) <= 4000),
  check (location is null or char_length(location) <= 300),
  check (char_length(timezone) between 1 and 64),
  check (
    rrule is null
    or (
      char_length(rrule) between 1 and 400
      and rrule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,-]+)*$'
    )
  ),
  check (cardinality(exdates) <= 366),
  check (ics_uid is null or char_length(ics_uid) between 1 and 200),
  check (ics_source_label is null or char_length(ics_source_label) <= 120)
);
create index calendar_events_family_starts_idx
  on public.calendar_events (family_id, starts_at)
  where deleted_at is null;
create trigger calendar_events_touch before update on public.calendar_events
  for each row execute function app.touch_updated_at();

create table public.calendar_event_residents (
  family_id    uuid not null,
  event_id     uuid not null,
  resident_id  uuid not null,
  primary key (event_id, resident_id),
  foreign key (family_id, event_id) references public.calendar_events(family_id, id) on delete cascade,
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade
);
create index calendar_event_residents_resident_idx
  on public.calendar_event_residents (family_id, resident_id);

create table public.timetable_slots (
  id           uuid primary key default uuidv7(),
  version      integer not null default 1 check (version >= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.auth_users(id) on delete set null,
  updated_by   uuid references public.auth_users(id) on delete set null,
  family_id    uuid not null references public.families(id) on delete cascade,
  resident_id  uuid not null,
  weekday      smallint not null check (weekday between 1 and 7),
  starts_at    text not null,
  ends_at      text not null,
  title        text not null,
  location     text,
  valid_from   date,
  valid_to     date,
  deleted_at   timestamptz,
  unique (family_id, id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check (starts_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  check (ends_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  check (ends_at > starts_at),
  check (char_length(btrim(title)) between 1 and 140),
  check (location is null or char_length(location) <= 300),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create index timetable_slots_resident_weekday_idx
  on public.timetable_slots (family_id, resident_id, weekday)
  where deleted_at is null;
create trigger timetable_slots_touch before update on public.timetable_slots
  for each row execute function app.touch_updated_at();

alter table public.calendar_events enable row level security;
create policy tenant on public.calendar_events for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy visibility_guard on public.calendar_events as restrictive for all to domusafe_app
  using (visibility = 'family' or owner_account_id = app.account_id())
  with check (visibility = 'family' or owner_account_id = app.account_id());
create policy house_guard on public.calendar_events as restrictive for all to domusafe_app
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
create policy not_guest on public.calendar_events as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy writers_insert on public.calendar_events as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
    or (
      (select app.role()) = any ('{child,caregiver}'::public.member_role[])
      and visibility = 'personal'
      and owner_account_id = app.account_id()
    )
  );
create policy writers_update on public.calendar_events as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
    or (
      (select app.role()) = any ('{child,caregiver}'::public.member_role[])
      and visibility = 'personal'
      and owner_account_id = app.account_id()
    )
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
    or (
      (select app.role()) = any ('{child,caregiver}'::public.member_role[])
      and visibility = 'personal'
      and owner_account_id = app.account_id()
    )
  );
create policy writers_delete on public.calendar_events as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
    or (
      (select app.role()) = any ('{child,caregiver}'::public.member_role[])
      and visibility = 'personal'
      and owner_account_id = app.account_id()
    )
  );

alter table public.calendar_event_residents enable row level security;
create policy tenant on public.calendar_event_residents for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.calendar_event_residents as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.calendar_event_residents as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

alter table public.timetable_slots enable row level security;
create policy tenant on public.timetable_slots for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.timetable_slots as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.timetable_slots as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy writers_insert on public.timetable_slots as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
    or (
      (select app.role()) = any ('{child,caregiver}'::public.member_role[])
      and resident_id = any ((select app.resident_ids())::uuid[])
    )
  );
create policy writers_update on public.timetable_slots as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
    or (
      (select app.role()) = any ('{child,caregiver}'::public.member_role[])
      and resident_id = any ((select app.resident_ids())::uuid[])
    )
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
    or (
      (select app.role()) = any ('{child,caregiver}'::public.member_role[])
      and resident_id = any ((select app.resident_ids())::uuid[])
    )
  );
create policy writers_delete on public.timetable_slots as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
    or (
      (select app.role()) = any ('{child,caregiver}'::public.member_role[])
      and resident_id = any ((select app.resident_ids())::uuid[])
    )
  );

grant select, insert, update, delete on
  public.calendar_events, public.calendar_event_residents, public.timetable_slots
to domusafe_app;
