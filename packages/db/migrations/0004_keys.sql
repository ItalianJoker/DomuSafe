-- Keys (phase 2 §6.3): account key material, vault PIN, devices, scopes, versions and grants.

create table public.account_keys (
  account_id                   uuid primary key references public.auth_users(id) on delete cascade,
  public_key                   bytea not null check (octet_length(public_key) = 65 and get_byte(public_key, 0) = 4),
  wrapped_private_key          bytea not null check (octet_length(wrapped_private_key) >= 29),
  recovery_public_key          bytea not null check (octet_length(recovery_public_key) = 65 and get_byte(recovery_public_key, 0) = 4),
  recovery_wrapped_private_key bytea not null check (octet_length(recovery_wrapped_private_key) >= 29),
  recovery_wrapped_account_key bytea not null check (octet_length(recovery_wrapped_account_key) >= 29),
  recovery_verifier_sha256     bytea not null check (octet_length(recovery_verifier_sha256) = 32),
  vault_public_key             bytea check (octet_length(vault_public_key) = 65 and get_byte(vault_public_key, 0) = 4),
  wrapped_vault_private_key    bytea check (octet_length(wrapped_vault_private_key) >= 29),
  recovery_sealed_vault_key    bytea check (octet_length(recovery_sealed_vault_key) >= 95),
  fingerprint                  text not null check (fingerprint ~ '^[a-z]+( [a-z]+){5}$'),
  key_generation               smallint not null default 1 check (key_generation >= 1),
  version                      integer not null default 1 check (version >= 1),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  check (num_nulls(vault_public_key, wrapped_vault_private_key, recovery_sealed_vault_key) in (0, 3))
);
create trigger account_keys_touch before update on public.account_keys
  for each row execute function app.touch_updated_at();

create table public.account_pins (
  account_id          uuid primary key references public.auth_users(id) on delete cascade,
  pin_salt            bytea not null check (octet_length(pin_salt) = 16),
  kdf_memory_kib      integer not null default 65536 check (kdf_memory_kib >= 19456),
  kdf_iterations      smallint not null default 3 check (kdf_iterations >= 2),
  kdf_parallelism     smallint not null default 1 check (kdf_parallelism between 1 and 4),
  verifier_hash       text not null check (verifier_hash like '$argon2id$%'),
  server_share_sealed bytea not null check (get_byte(server_share_sealed, 0) = 83),
  failed_attempts     smallint not null default 0 check (failed_attempts between 0 and 5),
  locked_at           timestamptz,
  pin_generation      integer not null default 1 check (pin_generation >= 1),
  updated_at          timestamptz not null default now(),
  check ((failed_attempts = 5) = (locked_at is not null))
);
create trigger account_pins_touch before update on public.account_pins
  for each row execute function app.touch_updated_at();

create table public.devices (
  id                  uuid primary key check (uuid_extract_version(id) = 7),
  account_id          uuid not null references public.auth_users(id) on delete cascade,
  label               text not null check (char_length(label) between 1 and 80),
  platform            text not null check (platform in ('android', 'ios', 'windows', 'macos', 'linux', 'other')),
  wrapped_account_key bytea check (octet_length(wrapped_account_key) >= 29),
  paired_via          text not null check (paired_via in ('signup', 'pairing', 'recovery')),
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz,
  revoked_at          timestamptz,
  check ((revoked_at is null) = (wrapped_account_key is not null))
);
create index devices_account_idx on public.devices (account_id) where revoked_at is null;

alter table public.auth_sessions
  add constraint auth_sessions_device_fk foreign key (device_id) references public.devices(id) on delete set null;

create table public.key_scopes (
  id                   uuid primary key check (uuid_extract_version(id) = 7),
  family_id            uuid not null references public.families(id) on delete cascade,
  kind                 public.scope_kind not null,
  house_id             uuid,
  resident_id          uuid,
  owner_account_id     uuid references public.auth_users(id) on delete cascade,
  current_version      integer not null default 1 check (current_version >= 1),
  rotation_required_at timestamptz,
  created_at           timestamptz not null default now(),
  created_by           uuid references public.auth_users(id) on delete set null,
  unique (family_id, id),
  unique nulls not distinct (family_id, kind, house_id, resident_id, owner_account_id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  check ((kind in ('house_technical', 'house_guest')) = (house_id is not null)),
  check ((kind = 'resident') = (resident_id is not null)),
  check ((kind in ('personal', 'vault_personal')) = (owner_account_id is not null))
);

create table public.scope_key_versions (
  scope_id   uuid not null references public.key_scopes(id) on delete cascade,
  version    integer not null check (version >= 1),
  created_at timestamptz not null default now(),
  created_by uuid references public.auth_users(id) on delete set null,
  primary key (scope_id, version)
);

create table public.scope_key_grants (
  id                 uuid primary key default uuidv7(),
  family_id          uuid not null references public.families(id) on delete cascade,
  scope_id           uuid not null,
  version            integer not null,
  grantee            public.grantee_key not null,
  grantee_account_id uuid references public.auth_users(id) on delete cascade,
  grantee_kiosk_id   uuid,
  grant_blob         bytea not null check (octet_length(grant_blob) >= 95 and get_byte(grant_blob, 0) = 1),
  granted_by         uuid references public.auth_users(id) on delete set null,
  created_at         timestamptz not null default now(),
  foreign key (family_id, scope_id) references public.key_scopes(family_id, id) on delete cascade,
  foreign key (scope_id, version) references public.scope_key_versions(scope_id, version) on delete cascade,
  foreign key (family_id, grantee_kiosk_id) references public.kiosk_devices(family_id, id) on delete cascade,
  check ((grantee = 'kiosk') = (grantee_kiosk_id is not null)),
  check ((grantee in ('account', 'vault')) = (grantee_account_id is not null)),
  unique nulls not distinct (scope_id, version, grantee, grantee_account_id, grantee_kiosk_id)
);
create index scope_key_grants_grantee_idx on public.scope_key_grants (family_id, grantee_account_id);

-- Vault scopes can only be granted to vault keys; every other scope only to general or kiosk keys.
create function app.check_grant_key() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
declare
  scope_kind public.scope_kind;
begin
  select s.kind into scope_kind from public.key_scopes s where s.id = new.scope_id;
  if (scope_kind in ('vault_family', 'vault_personal')) <> (new.grantee = 'vault') then
    raise exception 'Grant key kind does not match scope kind'
      using errcode = '23514', constraint = 'grant_key_matches_scope';
  end if;
  return new;
end
$$;

create trigger scope_key_grants_key_kind before insert or update on public.scope_key_grants
  for each row execute function app.check_grant_key();
