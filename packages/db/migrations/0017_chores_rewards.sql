-- Family chores, points, streaks and the rewards store (phase 2 §6.19).
-- Class C operational data under Famiglia. Optional proof photo on completions uses a small
-- data address until an object store exists (same approach as inventory photos).

create type public.chore_assignment as enum ('fixed', 'rotation');
create type public.chore_completion_status as enum ('pending_approval', 'approved', 'rejected');
create type public.point_source as enum ('chore', 'reward', 'manual', 'streak_bonus');
create type public.reward_redemption_status as enum ('requested', 'approved', 'rejected', 'fulfilled');

create table public.chores (
  id                       uuid primary key default uuidv7(),
  version                  integer not null default 1 check (version >= 1),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid references public.auth_users(id) on delete set null,
  updated_by               uuid references public.auth_users(id) on delete set null,
  family_id                uuid not null references public.families(id) on delete cascade,
  house_id                 uuid,
  title                    text not null,
  description              text,
  rrule                    text,
  points                   smallint not null default 1 check (points between 0 and 1000),
  assignment               public.chore_assignment not null default 'fixed',
  assigned_resident_ids    uuid[] not null default '{}',
  next_due_date            date,
  requires_approval        boolean not null default true,
  active                   boolean not null default true,
  deleted_at               timestamptz,
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  check (char_length(btrim(title)) between 1 and 140),
  check (description is null or char_length(description) <= 2000),
  check (
    rrule is null
    or (
      char_length(rrule) between 1 and 400
      and rrule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,-]+)*$'
    )
  ),
  check (cardinality(assigned_resident_ids) <= 32)
);
create index chores_family_due_idx
  on public.chores (family_id, next_due_date)
  where active and deleted_at is null;
create trigger chores_touch before update on public.chores
  for each row execute function app.touch_updated_at();

create table public.chore_completions (
  id                   uuid primary key default uuidv7(),
  family_id            uuid not null references public.families(id) on delete cascade,
  chore_id             uuid not null,
  resident_id          uuid not null,
  due_date             date not null,
  completed_at         timestamptz not null default now(),
  status               public.chore_completion_status not null default 'pending_approval',
  decided_by           uuid references public.auth_users(id) on delete set null,
  decided_at           timestamptz,
  points_awarded       smallint not null default 0 check (points_awarded >= 0),
  proof_photo_data_url text,
  note                 text,
  created_by           uuid references public.auth_users(id) on delete set null,
  unique (family_id, id),
  unique (chore_id, due_date, resident_id),
  foreign key (family_id, chore_id) references public.chores(family_id, id) on delete cascade,
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check (decided_at is null or decided_by is not null),
  check (decided_at is null or decided_at >= completed_at),
  check (note is null or char_length(note) <= 1000),
  check (
    proof_photo_data_url is null
    or (
      char_length(proof_photo_data_url) between 32 and 24576
      and proof_photo_data_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'
    )
  )
);
create index chore_completions_family_status_idx
  on public.chore_completions (family_id, status, completed_at desc);
create index chore_completions_resident_idx
  on public.chore_completions (family_id, resident_id, completed_at desc);

create table public.point_entries (
  id           uuid primary key default uuidv7(),
  family_id    uuid not null references public.families(id) on delete cascade,
  resident_id  uuid not null,
  delta        integer not null check (delta <> 0),
  reason       text not null,
  source       public.point_source not null,
  source_id    uuid,
  created_by   uuid references public.auth_users(id) on delete set null,
  approved_by  uuid references public.auth_users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (family_id, id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check (char_length(btrim(reason)) between 1 and 200)
);
create index point_entries_resident_created_idx
  on public.point_entries (family_id, resident_id, created_at desc);

create table public.rewards (
  id           uuid primary key default uuidv7(),
  version      integer not null default 1 check (version >= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.auth_users(id) on delete set null,
  updated_by   uuid references public.auth_users(id) on delete set null,
  family_id    uuid not null references public.families(id) on delete cascade,
  title        text not null,
  description  text,
  cost_points  integer not null check (cost_points > 0 and cost_points <= 100000),
  stock        integer check (stock is null or stock >= 0),
  active       boolean not null default true,
  deleted_at   timestamptz,
  unique (family_id, id),
  check (char_length(btrim(title)) between 1 and 140),
  check (description is null or char_length(description) <= 2000)
);
create index rewards_family_active_idx
  on public.rewards (family_id)
  where active and deleted_at is null;
create trigger rewards_touch before update on public.rewards
  for each row execute function app.touch_updated_at();

create table public.reward_redemptions (
  id              uuid primary key default uuidv7(),
  version         integer not null default 1 check (version >= 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.auth_users(id) on delete set null,
  updated_by      uuid references public.auth_users(id) on delete set null,
  family_id       uuid not null references public.families(id) on delete cascade,
  resident_id     uuid not null,
  reward_id       uuid not null,
  status          public.reward_redemption_status not null default 'requested',
  decided_by      uuid references public.auth_users(id) on delete set null,
  decided_at      timestamptz,
  point_entry_id  uuid,
  unique (family_id, id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  foreign key (family_id, reward_id) references public.rewards(family_id, id) on delete cascade,
  foreign key (family_id, point_entry_id) references public.point_entries(family_id, id) on delete set null,
  check (decided_at is null or decided_by is not null)
);
create index reward_redemptions_family_status_idx
  on public.reward_redemptions (family_id, status, created_at desc);
create trigger reward_redemptions_touch before update on public.reward_redemptions
  for each row execute function app.touch_updated_at();

create table public.resident_streaks (
  family_id           uuid not null,
  resident_id         uuid not null,
  current_days        integer not null default 0 check (current_days >= 0),
  best_days           integer not null default 0 check (best_days >= 0),
  last_completed_on   date,
  primary key (family_id, resident_id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check (best_days >= current_days)
);

-- Chores: members read; managers write; house scope when house_id is set.
alter table public.chores enable row level security;
create policy tenant on public.chores for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.chores as restrictive for all to domusafe_app
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
create policy not_guest on public.chores as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy managers_insert on public.chores as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_update on public.chores as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_delete on public.chores as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );

-- Completions: resident scope; children insert their own rows through the API.
alter table public.chore_completions enable row level security;
create policy tenant on public.chore_completions for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.chore_completions as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.chore_completions as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

alter table public.point_entries enable row level security;
create policy tenant on public.point_entries for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.point_entries as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.point_entries as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

alter table public.rewards enable row level security;
create policy tenant on public.rewards for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy not_guest on public.rewards as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');
create policy managers_insert on public.rewards as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_update on public.rewards as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_delete on public.rewards as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );

alter table public.reward_redemptions enable row level security;
create policy tenant on public.reward_redemptions for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.reward_redemptions as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.reward_redemptions as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

alter table public.resident_streaks enable row level security;
create policy tenant on public.resident_streaks for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.resident_streaks as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));
create policy not_guest on public.resident_streaks as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest')
  with check ((select app.principal()) = 'system' or (select app.role()) is distinct from 'guest');

grant select, insert, update, delete on
  public.chores, public.chore_completions, public.rewards, public.reward_redemptions, public.resident_streaks
to domusafe_app;
-- point_entries are append-only (phase 2 §3).
grant select, insert on public.point_entries to domusafe_app;
