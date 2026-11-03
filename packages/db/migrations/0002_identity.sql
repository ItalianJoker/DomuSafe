-- Identity (phase 2 §6.1): Better Auth tables and account-level domain tables.

create table public.auth_users (
  id                 uuid primary key default uuidv7(),
  name               text not null check (char_length(name) between 1 and 80),
  email              citext not null unique,
  email_verified     boolean not null default false,
  image              text,
  two_factor_enabled boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.auth_sessions (
  id          uuid primary key default uuidv7(),
  user_id     uuid not null references public.auth_users(id) on delete cascade,
  token       text not null unique,
  expires_at  timestamptz not null,
  user_agent  text,
  ip_address  text,
  device_id   uuid,
  fresh_until timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index auth_sessions_user_idx on public.auth_sessions (user_id, expires_at desc);

create table public.auth_accounts (
  id                       uuid primary key default uuidv7(),
  user_id                  uuid not null references public.auth_users(id) on delete cascade,
  provider_id              text not null,
  account_id               text not null,
  password                 text,
  access_token             text,
  refresh_token            text,
  id_token                 text,
  access_token_expires_at  timestamptz,
  refresh_token_expires_at timestamptz,
  scope                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (provider_id, account_id)
);
create index auth_accounts_user_idx on public.auth_accounts (user_id);

create table public.auth_verifications (
  id         uuid primary key default uuidv7(),
  identifier text not null,
  value      text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index auth_verifications_identifier_idx on public.auth_verifications (identifier);

create table public.auth_two_factors (
  id                        uuid primary key default uuidv7(),
  user_id                   uuid not null unique references public.auth_users(id) on delete cascade,
  secret                    text not null,
  backup_codes              text not null,
  verified                  boolean not null default true,
  failed_verification_count integer not null default 0 check (failed_verification_count >= 0),
  locked_until              timestamptz
);

create table public.account_profiles (
  account_id        uuid primary key references public.auth_users(id) on delete cascade,
  display_name      text not null check (char_length(display_name) between 1 and 80),
  locale            text not null default 'it' check (locale in ('it', 'en')),
  theme             text not null default 'system' check (theme in ('light', 'dark', 'system')),
  primary_family_id uuid,
  last_family_id    uuid,
  last_house_id     uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger account_profiles_touch before update on public.account_profiles
  for each row execute function app.touch_updated_at();

create table public.security_events (
  id          uuid not null default uuidv7(),
  occurred_at timestamptz not null default now(),
  account_id  uuid,
  kind        text not null check (kind in ('sign_in', 'sign_in_failed', 'sign_out', 'two_factor_enabled',
                'two_factor_disabled', 'two_factor_failed', 'password_changed', 'session_revoked',
                'device_paired', 'device_revoked', 'pin_set', 'pin_failed', 'pin_locked', 'pin_reset',
                'recovery_used', 'recovery_regenerated', 'reauthenticated', 'token_created', 'token_revoked')),
  ip          inet,
  user_agent  text check (char_length(user_agent) <= 300),
  metadata    jsonb not null default '{}' check (octet_length(metadata::text) <= 2048),
  primary key (id, occurred_at)
) partition by range (occurred_at);
create index security_events_account_idx on public.security_events (account_id, occurred_at desc);
create table public.security_events_default partition of public.security_events default;
