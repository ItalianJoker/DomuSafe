-- In-app notifications, Web Push subscriptions and per-category preferences (phase 2 §6.9).
-- Class C. Account-owned rows (model A) with system access for the deadline push worker.
-- Payload of a push stays minimal: title, body and an internal path — never vault or PIN material.

create table public.notifications (
  id             uuid primary key default uuidv7(),
  account_id     uuid not null references public.auth_users(id) on delete cascade,
  family_id      uuid not null references public.families(id) on delete cascade,
  category       text not null
                 check (category in (
                   'deadline', 'vault_reminder', 'emergency_scan', 'sos',
                   'chore', 'approval', 'security', 'system'
                 )),
  title          text not null check (char_length(title) between 1 and 140),
  body           text not null check (char_length(body) between 1 and 1000),
  link           text check (link is null or (char_length(link) between 1 and 500 and link like '/%')),
  resource_type  text check (resource_type is null or char_length(resource_type) between 1 and 80),
  resource_id    uuid,
  created_at     timestamptz not null default now(),
  read_at        timestamptz,
  push_sent_at   timestamptz,
  unique (family_id, id)
);
create index notifications_unread_idx
  on public.notifications (account_id, created_at desc)
  where read_at is null;
create index notifications_dedupe_idx
  on public.notifications (account_id, family_id, category, resource_type, resource_id, created_at desc);

create table public.push_subscriptions (
  id               uuid primary key default uuidv7(),
  account_id       uuid not null references public.auth_users(id) on delete cascade,
  device_id        uuid references public.devices(id) on delete set null,
  endpoint         text not null unique check (char_length(endpoint) between 1 and 2048),
  p256dh           bytea not null check (octet_length(p256dh) between 16 and 128),
  auth             bytea not null check (octet_length(auth) between 8 and 64),
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  failure_count    smallint not null default 0 check (failure_count >= 0),
  disabled_at      timestamptz
);
create index push_subscriptions_account_idx
  on public.push_subscriptions (account_id)
  where disabled_at is null;

create table public.notification_preferences (
  account_id   uuid not null references public.auth_users(id) on delete cascade,
  family_id    uuid not null references public.families(id) on delete cascade,
  category     text not null
               check (category in (
                 'deadline', 'vault_reminder', 'emergency_scan', 'sos',
                 'chore', 'approval', 'security', 'system'
               )),
  in_app       boolean not null default true,
  push         boolean not null default false,
  email        boolean not null default false,
  quiet_start  text check (quiet_start is null or quiet_start ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  quiet_end    text check (quiet_end is null or quiet_end ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  primary key (account_id, family_id, category),
  unique (family_id, account_id, category),
  check (
    (quiet_start is null and quiet_end is null)
    or (quiet_start is not null and quiet_end is not null)
  )
);

-- Lists active families for the deadline push worker (phase 2 §4.3 app.due_work pattern).
create function app.families_for_deadline_push()
  returns table (family_id uuid, timezone text)
  language plpgsql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
begin
  if app.principal() is distinct from 'system' then
    raise exception 'Only the system principal may list families for deadline push'
      using errcode = '42501';
  end if;
  return query
    select f.id, f.timezone
    from public.families f
    where f.deleted_at is null;
end
$$;

alter table public.notifications enable row level security;
create policy own_or_system on public.notifications for all to domusafe_app
  using (account_id = app.account_id() or (select app.principal()) = 'system')
  with check (account_id = app.account_id() or (select app.principal()) = 'system');

alter table public.push_subscriptions enable row level security;
create policy own_or_system on public.push_subscriptions for all to domusafe_app
  using (account_id = app.account_id() or (select app.principal()) = 'system')
  with check (account_id = app.account_id() or (select app.principal()) = 'system');

alter table public.notification_preferences enable row level security;
create policy own_or_system on public.notification_preferences for all to domusafe_app
  using (account_id = app.account_id() or (select app.principal()) = 'system')
  with check (
    (account_id = app.account_id() and family_id = any ((select app.my_family_ids())::uuid[]))
    or (select app.principal()) = 'system'
  );

grant select, insert, update, delete on public.notifications to domusafe_app;
grant select, insert, update, delete on public.push_subscriptions to domusafe_app;
grant select, insert, update, delete on public.notification_preferences to domusafe_app;
grant execute on function app.families_for_deadline_push() to domusafe_app;
