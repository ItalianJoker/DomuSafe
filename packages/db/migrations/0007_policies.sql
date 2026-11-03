-- Row-Level Security policies (phase 2 §5) and privileges of domusafe_app (phase 2 §4.1).

-- Families: members read their families; only administrators update; creation via app.create_family.
alter table public.families enable row level security;
create policy families_select on public.families for select to domusafe_app
  using (id = any ((select app.my_family_ids())::uuid[]) or (id = app.family_id() and (select app.is_member())));
create policy families_update on public.families for update to domusafe_app
  using (id = app.family_id() and (select app.role()) = 'admin')
  with check (id = app.family_id() and (select app.role()) = 'admin');

-- Memberships: own memberships everywhere, members of the current family; administrators manage.
alter table public.memberships enable row level security;
create policy memberships_select on public.memberships for select to domusafe_app
  using (account_id = app.account_id() or (family_id = app.family_id() and (select app.is_member())));
create policy memberships_update on public.memberships for update to domusafe_app
  using (family_id = app.family_id() and (select app.role()) = 'admin')
  with check (family_id = app.family_id() and (select app.role()) = 'admin');
create policy memberships_delete on public.memberships for delete to domusafe_app
  using (family_id = app.family_id() and (select app.role()) = 'admin');

-- Membership scopes: readable by members (model T), written by administrators.
alter table public.membership_houses enable row level security;
create policy tenant on public.membership_houses for select to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()));
create policy admin_write on public.membership_houses for all to domusafe_app
  using (family_id = app.family_id() and (select app.role()) = 'admin')
  with check (family_id = app.family_id() and (select app.role()) = 'admin');

alter table public.membership_residents enable row level security;
create policy tenant on public.membership_residents for select to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()));
create policy admin_write on public.membership_residents for all to domusafe_app
  using (family_id = app.family_id() and (select app.role()) = 'admin')
  with check (family_id = app.family_id() and (select app.role()) = 'admin');

-- Houses: model T + H; writes restricted to administrators (permission houses.manage).
alter table public.houses enable row level security;
create policy tenant on public.houses for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.houses as restrictive for all to domusafe_app
  using ((select app.all_houses()) or id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or id = any ((select app.house_ids())::uuid[]));
create policy admin_insert on public.houses as restrictive for insert to domusafe_app
  with check ((select app.principal()) = 'system' or (select app.role()) = 'admin');
create policy admin_update on public.houses as restrictive for update to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = 'admin');
create policy admin_delete on public.houses as restrictive for delete to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = 'admin');

-- Residents: model T + R (the row id is the resident).
alter table public.residents enable row level security;
create policy tenant on public.residents for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy resident_guard on public.residents as restrictive for all to domusafe_app
  using ((select app.all_residents()) or id = any ((select app.resident_ids())::uuid[]))
  with check ((select app.all_residents()) or id = any ((select app.resident_ids())::uuid[]));

alter table public.resident_houses enable row level security;
create policy tenant on public.resident_houses for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.resident_houses as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy resident_guard on public.resident_houses as restrictive for all to domusafe_app
  using ((select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));

-- Premium trials: the account's own trial, or the trial applied to the current family.
alter table public.premium_trials enable row level security;
create policy premium_trials_select on public.premium_trials for select to domusafe_app
  using (account_id = app.account_id() or (family_id = app.family_id() and (select app.is_member())));
create policy premium_trials_insert on public.premium_trials for insert to domusafe_app
  with check (account_id = app.account_id() and family_id = app.family_id() and (select app.role()) = 'admin');

-- Kiosk devices: model T + H + K.
alter table public.kiosk_devices enable row level security;
create policy tenant on public.kiosk_devices for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.kiosk_devices as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy kiosk_guard on public.kiosk_devices as restrictive for all to domusafe_app
  using ((select app.principal()) <> 'kiosk' or id = app.kiosk_id());

-- Account-owned tables: model A.
alter table public.account_profiles enable row level security;
create policy own on public.account_profiles for all to domusafe_app
  using (account_id = app.account_id()) with check (account_id = app.account_id());
alter table public.account_keys enable row level security;
create policy own on public.account_keys for all to domusafe_app
  using (account_id = app.account_id()) with check (account_id = app.account_id());
alter table public.account_pins enable row level security;
create policy own on public.account_pins for all to domusafe_app
  using (account_id = app.account_id()) with check (account_id = app.account_id());
alter table public.devices enable row level security;
create policy own on public.devices for all to domusafe_app
  using (account_id = app.account_id()) with check (account_id = app.account_id());

-- Key scopes, versions and grants.
alter table public.key_scopes enable row level security;
create policy tenant on public.key_scopes for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));

alter table public.scope_key_versions enable row level security;
create policy tenant on public.scope_key_versions for all to domusafe_app
  using (exists (select 1 from public.key_scopes s where s.id = scope_id))
  with check (exists (select 1 from public.key_scopes s where s.id = scope_id));

alter table public.scope_key_grants enable row level security;
create policy tenant on public.scope_key_grants for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy grantee_guard on public.scope_key_grants as restrictive for select to domusafe_app
  using (grantee_account_id = app.account_id() or grantee_kiosk_id = app.kiosk_id() or (select app.role()) = 'admin');
create policy granter_guard on public.scope_key_grants as restrictive for insert to domusafe_app
  with check (granted_by = app.account_id());

-- Audit log: append-only; readable by administrators of the family.
alter table public.audit_events enable row level security;
create policy audit_select on public.audit_events for select to domusafe_app
  using (family_id = app.family_id() and (select app.role()) = 'admin');
create policy audit_insert on public.audit_events for insert to domusafe_app
  with check (family_id is null or (family_id = app.family_id() and (select app.is_member())));

-- Security events: append-only; each account reads its own.
alter table public.security_events enable row level security;
create policy security_select on public.security_events for select to domusafe_app
  using (account_id = app.account_id());
create policy security_insert on public.security_events for insert to domusafe_app
  with check (true);

-- Revisions: append-only; models T + P + H + R.
alter table public.revisions enable row level security;
create policy tenant on public.revisions for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy personal_guard on public.revisions as restrictive for all to domusafe_app
  using (visibility = 'family' or owner_account_id = app.account_id())
  with check (visibility = 'family' or owner_account_id = app.account_id());
create policy house_guard on public.revisions as restrictive for all to domusafe_app
  using (house_id is null or (select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy resident_guard on public.revisions as restrictive for all to domusafe_app
  using (resident_id is null or (select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[]));

-- Privileges.
grant usage on schema public, app to domusafe_app;

grant select, insert, update, delete on
  public.auth_users, public.auth_sessions, public.auth_accounts, public.auth_verifications, public.auth_two_factors,
  public.account_profiles, public.account_keys, public.account_pins, public.devices,
  public.families, public.memberships, public.membership_houses, public.membership_residents,
  public.houses, public.residents, public.resident_houses, public.premium_trials, public.kiosk_devices,
  public.key_scopes, public.scope_key_versions, public.scope_key_grants
to domusafe_app;

grant select, insert on public.audit_events, public.security_events, public.revisions to domusafe_app;
grant select on public.currencies to domusafe_app;

revoke execute on all functions in schema app from public;
grant execute on all functions in schema app to domusafe_app;
