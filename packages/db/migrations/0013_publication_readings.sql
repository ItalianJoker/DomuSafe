-- Reading log of the public codes. One row is the time, the code kind and an optional
-- device label. Health details, vault contents, account numbers, tokens and addresses are not columns.

create table public.publication_readings (
  id            uuid primary key default uuidv7(),
  family_id     uuid not null references public.families(id) on delete cascade,
  house_id      uuid not null,
  occurred_at   timestamptz not null default now(),
  kind          public.publication_kind not null,
  device_label  text,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  check (device_label is null or device_label in ('Telefono', 'Tablet', 'Computer'))
);
create index publication_readings_house_idx
  on public.publication_readings (family_id, house_id, occurred_at desc);

alter table public.publication_readings enable row level security;
create policy tenant on public.publication_readings for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.publication_readings as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
-- People who can edit the house, and the system principal used by the public page.
create policy editors on public.publication_readings as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

grant select, insert, delete on public.publication_readings to domusafe_app;
