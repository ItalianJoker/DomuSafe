-- Utility bills and payment templates (phase 2 §6.14, master prompt §4).
-- Class C. Recognition patterns and field hints live in jsonb; OCR runs in the browser.
-- System templates (family_id null) are readable by every family; family rows stay tenant-scoped.
-- Bill file blobs stay out until the files table ships — file_id is a nullable uuid only.

create type public.consumption_unit as enum ('kwh', 'smc', 'm3', 'gb');

create table public.utility_templates (
  id                     uuid primary key default uuidv7(),
  version                integer not null default 1 check (version >= 1),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references public.auth_users(id) on delete set null,
  updated_by             uuid references public.auth_users(id) on delete set null,
  family_id              uuid references public.families(id) on delete cascade,
  country                char(2) not null check (country ~ '^[A-Z]{2}$'),
  kind                   public.utility_kind not null,
  provider_name          text not null check (char_length(btrim(provider_name)) between 1 and 160),
  field_hints            jsonb not null default '{}'::jsonb
                         check (
                           jsonb_typeof(field_hints) = 'object'
                           and octet_length(field_hints::text) <= 16384
                         ),
  recognition_patterns   jsonb not null default '{}'::jsonb
                         check (
                           jsonb_typeof(recognition_patterns) = 'object'
                           and octet_length(recognition_patterns::text) <= 16384
                         ),
  active                 boolean not null default true,
  unique nulls not distinct (family_id, country, kind, provider_name),
  unique (family_id, id)
);
create index utility_templates_family_idx
  on public.utility_templates (family_id, kind)
  where active;
create trigger utility_templates_touch before update on public.utility_templates
  for each row execute function app.touch_updated_at();

create table public.utility_bills (
  id                   uuid primary key check (uuid_extract_version(id) = 7),
  version              integer not null default 1 check (version >= 1),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references public.auth_users(id) on delete set null,
  updated_by           uuid references public.auth_users(id) on delete set null,
  family_id            uuid not null references public.families(id) on delete cascade,
  house_id             uuid not null,
  utility_id           uuid not null,
  period_start         date,
  period_end           date,
  issue_date           date,
  due_date             date,
  amount_minor         bigint,
  currency             char(3) references public.currencies(code),
  consumption          numeric(14, 3),
  consumption_unit     public.consumption_unit,
  paid_on              date,
  file_id              uuid,
  extracted            jsonb not null default '{}'::jsonb
                       check (
                         jsonb_typeof(extracted) = 'object'
                         and octet_length(extracted::text) <= 65536
                       ),
  unique (family_id, id),
  foreign key (family_id, house_id) references public.houses(family_id, id) on delete cascade,
  foreign key (family_id, utility_id) references public.utilities(family_id, id) on delete cascade,
  check ((amount_minor is null) = (currency is null)),
  check (amount_minor is null or amount_minor >= 0),
  check ((consumption is null) = (consumption_unit is null)),
  check (
    period_start is null
    or period_end is null
    or period_start <= period_end
  )
);
create index utility_bills_utility_idx
  on public.utility_bills (family_id, utility_id, period_end desc nulls last, created_at desc);
create trigger utility_bills_touch before update on public.utility_bills
  for each row execute function app.touch_updated_at();

alter table public.utilities
  add column template_id uuid references public.utility_templates(id) on delete set null;

-- Built-in Italian payment templates used by browser recognition (phase 1 OCR).
insert into public.utility_templates (
  country, kind, provider_name, field_hints, recognition_patterns, active
) values
(
  'IT',
  'electricity',
  'Generico luce',
  $hints_el${
  "customerCode": "Codice cliente",
  "supplyPointCode": "Codice del punto di prelievo",
  "contractCode": "Codice contratto",
  "amount": "Importo da pagare",
  "dueDate": "Data di scadenza",
  "iban": "Coordinate bancarie del beneficiario",
  "payeeName": "Intestatario del pagamento"
}$hints_el$::jsonb,
  $pat_el${
  "customerCode": [
    "(?i)codice\\s*cliente[:\\s]+([A-Z0-9/-]{4,40})"
  ],
  "supplyPointCode": [
    "(?i)(?:pod|punto\\s*di\\s*prelievo)[:\\s]*([A-Z0-9]{10,20})",
    "(?i)\\b(IT\\d{3}E\\d{8})\\b"
  ],
  "contractCode": [
    "(?i)contratto[:\\s]+([A-Z0-9/-]{4,40})"
  ],
  "amount": [
    "(?i)(?:totale\\s*da\\s*pagare|importo)[:\\s]*€?\\s*([0-9]{1,3}(?:[.\\s][0-9]{3})*[.,][0-9]{2})"
  ],
  "dueDate": [
    "(?i)scadenza[:\\s]*([0-3]?\\d[/.-][01]?\\d[/.-](?:20)?\\d{2})"
  ],
  "iban": [
    "\\b(IT\\d{2}[A-Z]\\d{10,30})\\b"
  ],
  "payeeName": [
    "(?i)beneficiario[:\\s]+([A-Za-zÀ-ÖØ-öø-ÿ0-9 .'\\-]{3,80})"
  ],
  "providerName": [
    "(?i)\\b(enel|a2a|edison|acea|hera|iren)\\b"
  ]
}$pat_el$::jsonb,
  true
),
(
  'IT',
  'gas',
  'Generico gas',
  $hints_gas${
  "customerCode": "Codice cliente",
  "supplyPointCode": "Codice del punto di riconsegna",
  "contractCode": "Codice contratto",
  "amount": "Importo da pagare",
  "dueDate": "Data di scadenza",
  "iban": "Coordinate bancarie del beneficiario",
  "payeeName": "Intestatario del pagamento"
}$hints_gas$::jsonb,
  $pat_gas${
  "customerCode": [
    "(?i)codice\\s*cliente[:\\s]+([A-Z0-9/-]{4,40})"
  ],
  "supplyPointCode": [
    "(?i)(?:pdr|punto\\s*di\\s*riconsegna)[:\\s]*([0-9]{14})",
    "\\b([0-9]{14})\\b"
  ],
  "contractCode": [
    "(?i)contratto[:\\s]+([A-Z0-9/-]{4,40})"
  ],
  "amount": [
    "(?i)(?:totale\\s*da\\s*pagare|importo)[:\\s]*€?\\s*([0-9]{1,3}(?:[.\\s][0-9]{3})*[.,][0-9]{2})"
  ],
  "dueDate": [
    "(?i)scadenza[:\\s]*([0-3]?\\d[/.-][01]?\\d[/.-](?:20)?\\d{2})"
  ],
  "iban": [
    "\\b(IT\\d{2}[A-Z]\\d{10,30})\\b"
  ],
  "payeeName": [
    "(?i)beneficiario[:\\s]+([A-Za-zÀ-ÖØ-öø-ÿ0-9 .'\\-]{3,80})"
  ],
  "providerName": [
    "(?i)\\b(eni|plenitude|italgas|sgm|a2a|edison)\\b"
  ]
}$pat_gas$::jsonb,
  true
),
(
  'IT',
  'water',
  'Generico acqua',
  $hints_water${
  "customerCode": "Codice utente",
  "supplyPointCode": "Matricola contatore",
  "amount": "Importo da pagare",
  "dueDate": "Data di scadenza",
  "iban": "Coordinate bancarie del beneficiario"
}$hints_water$::jsonb,
  $pat_water${
  "customerCode": [
    "(?i)codice\\s*(?:utente|cliente)[:\\s]+([A-Z0-9/-]{4,40})"
  ],
  "supplyPointCode": [
    "(?i)(?:matricola|contatore)[:\\s]+([A-Z0-9/-]{4,40})"
  ],
  "amount": [
    "(?i)(?:totale\\s*da\\s*pagare|importo)[:\\s]*€?\\s*([0-9]{1,3}(?:[.\\s][0-9]{3})*[.,][0-9]{2})"
  ],
  "dueDate": [
    "(?i)scadenza[:\\s]*([0-3]?\\d[/.-][01]?\\d[/.-](?:20)?\\d{2})"
  ],
  "iban": [
    "\\b(IT\\d{2}[A-Z]\\d{10,30})\\b"
  ]
}$pat_water$::jsonb,
  true
),
(
  'IT',
  'internet',
  'Generico internet',
  $hints_net${
  "customerCode": "Codice cliente",
  "contractCode": "Numero contratto",
  "amount": "Importo da pagare",
  "dueDate": "Data di scadenza",
  "iban": "Coordinate bancarie del beneficiario"
}$hints_net$::jsonb,
  $pat_net${
  "customerCode": [
    "(?i)codice\\s*cliente[:\\s]+([A-Z0-9/-]{4,40})"
  ],
  "contractCode": [
    "(?i)(?:contratto|linea)[:\\s]+([A-Z0-9/-]{4,40})"
  ],
  "amount": [
    "(?i)(?:totale\\s*da\\s*pagare|importo|canone)[:\\s]*€?\\s*([0-9]{1,3}(?:[.\\s][0-9]{3})*[.,][0-9]{2})"
  ],
  "dueDate": [
    "(?i)scadenza[:\\s]*([0-3]?\\d[/.-][01]?\\d[/.-](?:20)?\\d{2})"
  ],
  "iban": [
    "\\b(IT\\d{2}[A-Z]\\d{10,30})\\b"
  ],
  "providerName": [
    "(?i)\\b(tim|vodafone|windtre|fastweb|linkem|eolo)\\b"
  ]
}$pat_net$::jsonb,
  true
);

alter table public.utility_templates enable row level security;
create policy read_system_or_tenant on public.utility_templates for select to domusafe_app
  using (
    family_id is null
    or (family_id = app.family_id() and (select app.is_member()))
  );
create policy family_insert on public.utility_templates for insert to domusafe_app
  with check (
    family_id = app.family_id()
    and (select app.is_member())
    and ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  );
create policy family_update on public.utility_templates for update to domusafe_app
  using (
    family_id = app.family_id()
    and (select app.is_member())
    and ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  )
  with check (
    family_id = app.family_id()
    and (select app.is_member())
    and ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  );
create policy family_delete on public.utility_templates for delete to domusafe_app
  using (
    family_id = app.family_id()
    and (select app.is_member())
    and ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  );

alter table public.utility_bills enable row level security;
create policy tenant on public.utility_bills for all to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));
create policy house_guard on public.utility_bills as restrictive for all to domusafe_app
  using ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check ((select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));
create policy managers on public.utility_bills as restrictive for all to domusafe_app
  using ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]))
  with check ((select app.principal()) = 'system' or (select app.role()) = any ('{admin,parent}'::public.member_role[]));

grant select, insert, update, delete on public.utility_templates, public.utility_bills to domusafe_app;
