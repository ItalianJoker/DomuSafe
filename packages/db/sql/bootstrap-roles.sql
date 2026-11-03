-- Cluster-wide roles (phase 2 §4.1). Idempotent; run by the migration runner before the migrations.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'domusafe_owner') then
    create role domusafe_owner nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'domusafe_app') then
    create role domusafe_app login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end
$$;
