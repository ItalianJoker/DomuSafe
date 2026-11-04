-- Family vault documents. The server stores ciphertext only (phase 2 §6.12, family sections).

create type public.vault_section as enum (
  'family_accounts',
  'mortgages',
  'credit_protection',
  'insurance_policies',
  'bills_and_cancellations',
  'digital_legacy'
);

create table public.vault_items (
  id              uuid primary key,
  version         integer not null default 1 check (version >= 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.auth_users(id) on delete set null,
  updated_by      uuid references public.auth_users(id) on delete set null,
  family_id       uuid not null references public.families(id) on delete cascade,
  section         public.vault_section not null,
  deleted_at      timestamptz,
  enc_scope_id    uuid not null,
  enc_key_version integer not null check (enc_key_version >= 1),
  enc_dek         bytea not null check (octet_length(enc_dek) >= 29 and get_byte(enc_dek, 0) = 1),
  enc_payload     bytea not null check (
    octet_length(enc_payload) between 29 and 262144 and get_byte(enc_payload, 0) = 1
  ),
  unique (family_id, id),
  foreign key (family_id, enc_scope_id) references public.key_scopes(family_id, id),
  foreign key (enc_scope_id, enc_key_version) references public.scope_key_versions(scope_id, version)
);
create index vault_items_section_idx on public.vault_items (family_id, section) where deleted_at is null;
create trigger vault_items_touch before update on public.vault_items
  for each row execute function app.touch_updated_at();

-- The envelope must be the family's vault scope. Plaintext columns do not exist.
create function app.enforce_vault_envelope() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
declare
  scope_kind public.scope_kind;
begin
  select s.kind into scope_kind
  from public.key_scopes s
  where s.id = new.enc_scope_id and s.family_id = new.family_id;
  if scope_kind is distinct from 'vault_family' then
    raise exception 'Vault envelope must use the family vault scope'
      using errcode = '23514', constraint = 'vault_envelope_scope';
  end if;
  return new;
end
$$;

create trigger vault_items_envelope before insert or update on public.vault_items
  for each row execute function app.enforce_vault_envelope();

alter table public.vault_items enable row level security;
create policy tenant on public.vault_items for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy vault_role on public.vault_items as restrictive for all to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = 'admin'
    or (
      (select app.role()) = 'parent'
      and exists (
        select 1 from public.memberships m
        where m.family_id = vault_items.family_id
          and m.account_id = app.account_id()
          and m.status = 'active'
          and m.vault_family
          and (m.expires_at is null or m.expires_at > now())
      )
    )
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = 'admin'
    or (
      (select app.role()) = 'parent'
      and exists (
        select 1 from public.memberships m
        where m.family_id = vault_items.family_id
          and m.account_id = app.account_id()
          and m.status = 'active'
          and m.vault_family
          and (m.expires_at is null or m.expires_at > now())
      )
    )
  );

grant select, insert, update, delete on public.vault_items to domusafe_app;
grant execute on function app.enforce_vault_envelope() to domusafe_app;
