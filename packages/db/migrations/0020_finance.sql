-- Family finance: multi-currency double-entry ledger (phase 2 §6.21).
-- Class C operational data under Extra. Plan feature `finance` (Basic+).
-- Child read is limited to own piggy-bank accounts, family budgets and own savings goals.

create type public.fin_account_type as enum ('asset', 'liability', 'equity', 'income', 'expense');
create type public.fin_account_subtype as enum (
  'cash', 'bank', 'card', 'savings', 'piggy_bank', 'loan', 'mortgage',
  'investment', 'currency_exchange', 'opening_balance', 'category'
);
create type public.fin_transaction_status as enum ('pending', 'cleared', 'reconciled');
create type public.fin_budget_period as enum ('monthly', 'yearly');

create table public.fx_rates (
  base       char(3) not null default 'EUR' references public.currencies(code),
  quote      char(3) not null references public.currencies(code),
  rate_date  date not null,
  rate       numeric(20, 10) not null check (rate > 0),
  source     text not null default 'ecb',
  primary key (base, quote, rate_date),
  check (char_length(btrim(source)) between 1 and 40),
  check (base <> quote)
);
create index fx_rates_quote_date_idx on public.fx_rates (quote, rate_date desc);

create table public.fin_accounts (
  id                uuid primary key default uuidv7(),
  version           integer not null default 1 check (version >= 1),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references public.auth_users(id) on delete set null,
  updated_by        uuid references public.auth_users(id) on delete set null,
  family_id         uuid not null references public.families(id) on delete cascade,
  visibility        public.visibility not null default 'family',
  owner_account_id  uuid references public.auth_users(id) on delete cascade,
  resident_id       uuid,
  type              public.fin_account_type not null,
  subtype           public.fin_account_subtype not null,
  name              text not null,
  currency          char(3) not null references public.currencies(code),
  parent_id         uuid,
  archived_at       timestamptz,
  deleted_at        timestamptz,
  unique (family_id, id),
  unique nulls not distinct (family_id, parent_id, name) deferrable initially immediate,
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  foreign key (family_id, parent_id) references public.fin_accounts(family_id, id) on delete set null,
  check ((visibility = 'personal') = (owner_account_id is not null)),
  check (char_length(btrim(name)) between 1 and 120),
  check (
    (subtype = 'piggy_bank' and resident_id is not null)
    or (subtype <> 'piggy_bank')
  ),
  check (
    (subtype = 'category' and type in ('income', 'expense'))
    or (subtype <> 'category')
  ),
  check (
    (subtype = 'currency_exchange' and type = 'asset')
    or (subtype <> 'currency_exchange')
  )
);
create index fin_accounts_family_name_idx
  on public.fin_accounts (family_id, name)
  where deleted_at is null;
create trigger fin_accounts_touch before update on public.fin_accounts
  for each row execute function app.touch_updated_at();

create table public.fin_transactions (
  id            uuid primary key default uuidv7(),
  version       integer not null default 1 check (version >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.auth_users(id) on delete set null,
  updated_by    uuid references public.auth_users(id) on delete set null,
  family_id     uuid not null references public.families(id) on delete cascade,
  booked_on     date not null,
  description   text not null,
  payee         text,
  status        public.fin_transaction_status not null default 'cleared',
  recurring_id  uuid,
  tags          text[] not null default '{}',
  notes         text,
  deleted_at    timestamptz,
  unique (family_id, id),
  check (char_length(btrim(description)) between 1 and 200),
  check (payee is null or char_length(btrim(payee)) between 1 and 120),
  check (notes is null or char_length(notes) <= 2000),
  check (cardinality(tags) <= 32)
);
create index fin_transactions_date_idx
  on public.fin_transactions (family_id, booked_on desc, id desc)
  where deleted_at is null;
create trigger fin_transactions_touch before update on public.fin_transactions
  for each row execute function app.touch_updated_at();

create table public.fin_postings (
  id                 uuid primary key default uuidv7(),
  family_id          uuid not null references public.families(id) on delete cascade,
  transaction_id     uuid not null,
  account_id         uuid not null,
  amount_minor       bigint not null check (amount_minor <> 0),
  currency           char(3) not null references public.currencies(code),
  fx_rate            numeric(20, 10) not null default 1 check (fx_rate > 0),
  base_amount_minor  bigint not null,
  memo               text,
  unique (family_id, id),
  foreign key (family_id, transaction_id) references public.fin_transactions(family_id, id) on delete cascade,
  foreign key (family_id, account_id) references public.fin_accounts(family_id, id),
  check (memo is null or char_length(memo) <= 200)
);
create index fin_postings_account_idx
  on public.fin_postings (family_id, account_id, transaction_id);
create index fin_postings_tx_idx
  on public.fin_postings (family_id, transaction_id);

create function app.check_fin_posting_currency() returns trigger
  language plpgsql
  as $$
declare
  account_currency char(3);
begin
  select a.currency into account_currency
  from public.fin_accounts a
  where a.family_id = new.family_id and a.id = new.account_id and a.deleted_at is null;
  if account_currency is null then
    raise exception 'finance posting account missing' using errcode = '23514';
  end if;
  if new.currency is distinct from account_currency then
    raise exception 'finance posting currency must match account' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger fin_postings_currency
  before insert or update on public.fin_postings
  for each row execute function app.check_fin_posting_currency();

create function app.check_transaction_balanced() returns trigger
  language plpgsql
  as $$
declare
  tx_id uuid := coalesce(new.transaction_id, old.transaction_id);
  fam_id uuid := coalesce(new.family_id, old.family_id);
  posting_count integer;
  unbalanced integer;
begin
  select count(*)::integer into posting_count
  from public.fin_postings p
  where p.family_id = fam_id and p.transaction_id = tx_id;
  if posting_count = 0 then
    return coalesce(new, old);
  end if;
  if posting_count < 2 then
    raise exception 'finance transaction needs at least two postings' using errcode = '23514';
  end if;
  select count(*)::integer into unbalanced
  from (
    select p.currency
    from public.fin_postings p
    where p.family_id = fam_id and p.transaction_id = tx_id
    group by p.currency
    having sum(p.amount_minor) <> 0
  ) bad;
  if unbalanced > 0 then
    raise exception 'finance transaction must balance per currency' using errcode = '23514';
  end if;
  return coalesce(new, old);
end
$$;

create constraint trigger fin_postings_balanced
  after insert or update or delete on public.fin_postings
  deferrable initially deferred
  for each row execute function app.check_transaction_balanced();

create table public.fin_budgets (
  id            uuid primary key default uuidv7(),
  version       integer not null default 1 check (version >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.auth_users(id) on delete set null,
  updated_by    uuid references public.auth_users(id) on delete set null,
  family_id     uuid not null references public.families(id) on delete cascade,
  account_id    uuid not null,
  period        public.fin_budget_period not null,
  starts_on     date not null,
  amount_minor  bigint not null check (amount_minor > 0),
  currency      char(3) not null references public.currencies(code),
  rollover      boolean not null default false,
  deleted_at    timestamptz,
  unique (family_id, id),
  unique (family_id, account_id, period, starts_on),
  foreign key (family_id, account_id) references public.fin_accounts(family_id, id)
);
create trigger fin_budgets_touch before update on public.fin_budgets
  for each row execute function app.touch_updated_at();

create table public.fin_savings_goals (
  id            uuid primary key default uuidv7(),
  version       integer not null default 1 check (version >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.auth_users(id) on delete set null,
  updated_by    uuid references public.auth_users(id) on delete set null,
  family_id     uuid not null references public.families(id) on delete cascade,
  resident_id   uuid,
  account_id    uuid not null,
  name          text not null,
  target_minor  bigint not null check (target_minor > 0),
  target_date   date,
  deleted_at    timestamptz,
  unique (family_id, id),
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  foreign key (family_id, account_id) references public.fin_accounts(family_id, id),
  check (char_length(btrim(name)) between 1 and 120)
);
create index fin_savings_goals_family_idx
  on public.fin_savings_goals (family_id, created_at desc)
  where deleted_at is null;
create trigger fin_savings_goals_touch before update on public.fin_savings_goals
  for each row execute function app.touch_updated_at();

create table public.fin_recurring (
  id            uuid primary key default uuidv7(),
  version       integer not null default 1 check (version >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.auth_users(id) on delete set null,
  updated_by    uuid references public.auth_users(id) on delete set null,
  family_id     uuid not null references public.families(id) on delete cascade,
  description   text not null,
  rrule         text not null,
  next_run_on   date not null,
  end_on        date,
  template      jsonb not null,
  auto_post     boolean not null default false,
  active        boolean not null default true,
  deleted_at    timestamptz,
  unique (family_id, id),
  check (char_length(btrim(description)) between 1 and 200),
  check (
    char_length(rrule) between 1 and 400
    and rrule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z0-9=-]+)*$'
  ),
  check (end_on is null or end_on >= next_run_on),
  check (jsonb_typeof(template) = 'object'),
  check (octet_length(template::text) <= 16384)
);
create index fin_recurring_due_idx
  on public.fin_recurring (next_run_on)
  where active and deleted_at is null;
create trigger fin_recurring_touch before update on public.fin_recurring
  for each row execute function app.touch_updated_at();

alter table public.fin_transactions
  add constraint fin_transactions_recurring_fk
  foreign key (family_id, recurring_id) references public.fin_recurring(family_id, id) on delete set null;

create table public.fin_split_shares (
  id                       uuid primary key default uuidv7(),
  family_id                uuid not null references public.families(id) on delete cascade,
  transaction_id           uuid not null,
  resident_id              uuid not null,
  share_minor              bigint not null check (share_minor > 0),
  currency                 char(3) not null references public.currencies(code),
  settled_transaction_id   uuid,
  unique (family_id, id),
  unique (family_id, transaction_id, resident_id),
  foreign key (family_id, transaction_id) references public.fin_transactions(family_id, id) on delete cascade,
  foreign key (family_id, resident_id) references public.residents(family_id, id) on delete cascade,
  foreign key (family_id, settled_transaction_id) references public.fin_transactions(family_id, id) on delete set null
);
create index fin_split_shares_tx_idx
  on public.fin_split_shares (family_id, transaction_id);

create function app.check_split_shares_total() returns trigger
  language plpgsql
  as $$
declare
  tx_id uuid := coalesce(new.transaction_id, old.transaction_id);
  fam_id uuid := coalesce(new.family_id, old.family_id);
  share_total bigint;
  expense_total bigint;
begin
  select coalesce(sum(s.share_minor), 0) into share_total
  from public.fin_split_shares s
  where s.family_id = fam_id and s.transaction_id = tx_id;
  if share_total = 0 then
    return coalesce(new, old);
  end if;
  select coalesce(sum(p.amount_minor) filter (where p.amount_minor > 0), 0) into expense_total
  from public.fin_postings p
  where p.family_id = fam_id and p.transaction_id = tx_id;
  if share_total <> expense_total then
    raise exception 'finance split shares must equal positive posting total' using errcode = '23514';
  end if;
  return coalesce(new, old);
end
$$;

create constraint trigger fin_split_shares_total
  after insert or update or delete on public.fin_split_shares
  deferrable initially deferred
  for each row execute function app.check_split_shares_total();

-- Accounts: members in tenant; managers write; children only own piggy banks.
alter table public.fin_accounts enable row level security;
create policy tenant on public.fin_accounts for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy child_piggy_select on public.fin_accounts as restrictive for select to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) is distinct from 'child'
    or (
      subtype = 'piggy_bank'
      and resident_id is not null
      and resident_id = any ((select app.resident_ids())::uuid[])
    )
  );
create policy managers_insert on public.fin_accounts as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_update on public.fin_accounts as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_delete on public.fin_accounts as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );

-- Transactions: managers write; children see rows that touch their piggy banks.
alter table public.fin_transactions enable row level security;
create policy tenant on public.fin_transactions for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy child_piggy_select on public.fin_transactions as restrictive for select to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) is distinct from 'child'
    or exists (
      select 1
      from public.fin_postings p
      join public.fin_accounts a
        on a.family_id = p.family_id and a.id = p.account_id and a.deleted_at is null
      where p.family_id = fin_transactions.family_id
        and p.transaction_id = fin_transactions.id
        and a.subtype = 'piggy_bank'
        and a.resident_id = any ((select app.resident_ids())::uuid[])
    )
  );
create policy managers_insert on public.fin_transactions as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_update on public.fin_transactions as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_delete on public.fin_transactions as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );

alter table public.fin_postings enable row level security;
create policy tenant on public.fin_postings for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy child_piggy_select on public.fin_postings as restrictive for select to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) is distinct from 'child'
    or exists (
      select 1
      from public.fin_accounts a
      where a.family_id = fin_postings.family_id
        and a.id = fin_postings.account_id
        and a.deleted_at is null
        and a.subtype = 'piggy_bank'
        and a.resident_id = any ((select app.resident_ids())::uuid[])
    )
  );
create policy managers_insert on public.fin_postings as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_update on public.fin_postings as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_delete on public.fin_postings as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );

-- Budgets: children may read; managers write.
alter table public.fin_budgets enable row level security;
create policy tenant on public.fin_budgets for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy not_guest on public.fin_budgets as restrictive for select to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent,child}'::public.member_role[])
  );
create policy managers_insert on public.fin_budgets as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_update on public.fin_budgets as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_delete on public.fin_budgets as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );

-- Savings goals: children read own resident; managers write.
alter table public.fin_savings_goals enable row level security;
create policy tenant on public.fin_savings_goals for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy child_own_select on public.fin_savings_goals as restrictive for select to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) is distinct from 'child'
    or (
      resident_id is not null
      and resident_id = any ((select app.resident_ids())::uuid[])
    )
  );
create policy managers_insert on public.fin_savings_goals as restrictive for insert to domusafe_app
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_update on public.fin_savings_goals as restrictive for update to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );
create policy managers_delete on public.fin_savings_goals as restrictive for delete to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );

alter table public.fin_recurring enable row level security;
create policy tenant on public.fin_recurring for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy managers_all on public.fin_recurring as restrictive for all to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );

alter table public.fin_split_shares enable row level security;
create policy tenant on public.fin_split_shares for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy managers_all on public.fin_split_shares as restrictive for all to domusafe_app
  using (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  )
  with check (
    (select app.principal()) = 'system'
    or (select app.role()) = any ('{admin,parent}'::public.member_role[])
  );

grant select on public.fx_rates to domusafe_app;
grant select, insert, update, delete on
  public.fin_accounts,
  public.fin_transactions,
  public.fin_postings,
  public.fin_budgets,
  public.fin_savings_goals,
  public.fin_recurring,
  public.fin_split_shares
to domusafe_app;
