-- Audit log (phase 2 §6.7) and revisions (phase 2 §6.6).

create table public.audit_events (
  id            uuid not null default uuidv7(),
  occurred_at   timestamptz not null default now(),
  family_id     uuid,
  actor_kind    public.actor_kind not null,
  actor_id      uuid,
  action        text not null check (action ~ '^[a-z_]+(\.[a-z_]+){1,3}$'),
  resource_type text check (resource_type ~ '^[a-z_]{2,40}$'),
  resource_id   uuid,
  outcome       text not null check (outcome in ('success', 'denied', 'failure')),
  metadata      jsonb not null default '{}' check (octet_length(metadata::text) <= 4096),
  primary key (id, occurred_at)
) partition by range (occurred_at);
create index audit_events_family_idx on public.audit_events (family_id, occurred_at desc);
create table public.audit_events_default partition of public.audit_events default;

create table public.revisions (
  id               uuid primary key default uuidv7(),
  family_id        uuid not null references public.families(id) on delete cascade,
  house_id         uuid,
  resident_id      uuid,
  visibility       public.visibility not null default 'family',
  owner_account_id uuid references public.auth_users(id) on delete cascade,
  resource_type    text not null check (resource_type ~ '^[a-z_]{2,40}$'),
  resource_id      uuid not null,
  version          integer not null check (version >= 1),
  op               public.revision_op not null,
  actor_kind       public.actor_kind not null,
  actor_id         uuid,
  data             jsonb,
  enc_scope_id     uuid,
  enc_key_version  integer,
  enc_dek          bytea,
  enc_payload      bytea,
  created_at       timestamptz not null default now(),
  unique (resource_type, resource_id, version),
  check ((visibility = 'personal') = (owner_account_id is not null)),
  check (num_nulls(enc_scope_id, enc_key_version, enc_dek, enc_payload) in (0, 4))
);
create index revisions_resource_idx on public.revisions (family_id, resource_type, resource_id, version desc);
