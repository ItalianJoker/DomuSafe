-- Session context and access functions used by RLS policies (phase 2 §4.2–§4.3).

create function app.principal() returns text
  language sql stable parallel safe
  as $$ select coalesce(nullif(current_setting('app.principal', true), ''), 'none') $$;

create function app.account_id() returns uuid
  language sql stable parallel safe
  as $$ select nullif(current_setting('app.account_id', true), '')::uuid $$;

create function app.kiosk_id() returns uuid
  language sql stable parallel safe
  as $$ select nullif(current_setting('app.kiosk_id', true), '')::uuid $$;

create function app.family_id() returns uuid
  language sql stable parallel safe
  as $$ select nullif(current_setting('app.family_id', true), '')::uuid $$;

-- Active membership of the current account in the current family (internal helper).
create function app.current_membership() returns public.memberships
  language sql stable security definer
  set search_path = public, pg_temp
  as $$
    select m.*
    from public.memberships m
    where app.principal() = 'account'
      and m.family_id = app.family_id()
      and m.account_id = app.account_id()
      and m.status = 'active'
      and (m.expires_at is null or m.expires_at > now())
  $$;

create function app.current_kiosk() returns public.kiosk_devices
  language sql stable security definer
  set search_path = public, pg_temp
  as $$
    select k.*
    from public.kiosk_devices k
    where app.principal() = 'kiosk'
      and k.id = app.kiosk_id()
      and k.family_id = app.family_id()
      and k.revoked_at is null
  $$;

create function app.is_member() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
  as $$
    select case app.principal()
      when 'account' then (select m.id from app.current_membership() m) is not null
      when 'kiosk' then (select k.id from app.current_kiosk() k) is not null
      when 'system' then exists (select 1 from public.families f where f.id = app.family_id())
      else false
    end
  $$;

create function app.role() returns public.member_role
  language sql stable security definer
  set search_path = public, pg_temp
  as $$ select m.role from app.current_membership() m $$;

create function app.all_houses() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
  as $$
    select case app.principal()
      when 'system' then true
      when 'account' then coalesce((select m.all_houses from app.current_membership() m), false)
      else false
    end
  $$;

create function app.house_ids() returns uuid[]
  language sql stable security definer
  set search_path = public, pg_temp
  as $$
    select case app.principal()
      when 'account' then array(
        select mh.house_id
        from public.membership_houses mh
        where mh.membership_id = (select m.id from app.current_membership() m))
      when 'kiosk' then array(select k.house_id from app.current_kiosk() k)
      else '{}'::uuid[]
    end
  $$;

create function app.all_residents() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
  as $$
    select case app.principal()
      when 'system' then true
      when 'account' then coalesce((select m.all_residents from app.current_membership() m), false)
      else false
    end
  $$;

create function app.resident_ids() returns uuid[]
  language sql stable security definer
  set search_path = public, pg_temp
  as $$
    select case app.principal()
      when 'account' then array(
        select mr.resident_id
        from public.membership_residents mr
        where mr.membership_id = (select m.id from app.current_membership() m)
        union
        select r.id
        from public.residents r
        where r.family_id = app.family_id() and r.account_id = app.account_id() and r.deleted_at is null)
      when 'kiosk' then array(select k.resident_id from app.current_kiosk() k where k.resident_id is not null)
      else '{}'::uuid[]
    end
  $$;

create function app.my_family_ids() returns uuid[]
  language sql stable security definer
  set search_path = public, pg_temp
  as $$
    select array(
      select m.family_id
      from public.memberships m
      where app.principal() = 'account'
        and m.account_id = app.account_id()
        and m.status = 'active'
        and (m.expires_at is null or m.expires_at > now()))
  $$;

-- Creates a family owned by the calling account with its administrator membership.
create function app.create_family(p_name text, p_timezone text, p_base_currency char(3), p_locale text)
  returns uuid
  language plpgsql volatile security definer
  set search_path = public, pg_temp
  as $$
declare
  caller uuid := app.account_id();
  new_id uuid;
begin
  if app.principal() <> 'account' or caller is null then
    raise exception 'Only an account can create a family' using errcode = '42501';
  end if;
  insert into public.families (name, owner_account_id, timezone, base_currency, locale)
    values (p_name, caller, p_timezone, p_base_currency, p_locale)
    returning id into new_id;
  insert into public.memberships (family_id, account_id, role, created_by)
    values (new_id, caller, 'admin', caller);
  update public.account_profiles
    set primary_family_id = coalesce(primary_family_id, new_id)
    where account_id = caller;
  return new_id;
end
$$;

-- Creates the current month and the next two months of every partitioned log table.
create function app.ensure_partitions(p_now timestamptz default now()) returns integer
  language plpgsql volatile security definer
  set search_path = public, pg_temp
  as $$
declare
  parent text;
  month_offset integer;
  range_start date;
  partition_name text;
  created integer := 0;
begin
  foreach parent in array array['audit_events', 'security_events'] loop
    for month_offset in 0..2 loop
      range_start := (date_trunc('month', p_now) + make_interval(months => month_offset))::date;
      partition_name := format('%s_y%sm%s', parent, to_char(range_start, 'YYYY'), to_char(range_start, 'MM'));
      if to_regclass(format('public.%I', partition_name)) is null then
        execute format(
          'create table public.%I partition of public.%I for values from (%L) to (%L)',
          partition_name, parent, range_start, (range_start + interval '1 month')::date);
        created := created + 1;
      end if;
    end loop;
  end loop;
  return created;
end
$$;

-- Drops partitions past their retention: audit_events 24 months, security_events 3 months (phase 2 §13).
create function app.drop_expired_partitions(p_now timestamptz default now()) returns integer
  language plpgsql volatile security definer
  set search_path = public, pg_temp
  as $$
declare
  part record;
  retention interval;
  dropped integer := 0;
begin
  for part in
    select c.relname as name,
           p.relname as parent,
           to_date(regexp_replace(c.relname, '^.*_y(\d{4})m(\d{2})$', '\1\2'), 'YYYYMM') as range_start
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    join pg_class p on p.oid = i.inhparent
    join pg_namespace n on n.oid = p.relnamespace
    where n.nspname = 'public'
      and p.relname in ('audit_events', 'security_events')
      and c.relname ~ '_y\d{4}m\d{2}$'
  loop
    retention := case part.parent when 'audit_events' then interval '24 months' else interval '3 months' end;
    if part.range_start + interval '1 month' <= date_trunc('month', p_now) - retention then
      execute format('drop table public.%I', part.name);
      dropped := dropped + 1;
    end if;
  end loop;
  return dropped;
end
$$;

select app.ensure_partitions();
