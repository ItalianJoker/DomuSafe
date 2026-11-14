-- Product news catalogue and per-account read cursor (phase 2 §6.9).
-- news_items: global catalogue (RLS model G) — SELECT only for domusafe_app.
-- news_reads: account-owned last-read marker (RLS model A).
-- Seeded tips are product guidance visible on Panoramica; Italian and English rows.

create table public.news_items (
  id             uuid primary key default uuidv7(),
  published_at   timestamptz not null,
  locale         text not null check (locale in ('it', 'en')),
  title          text not null check (char_length(title) between 1 and 140),
  body           text not null check (char_length(body) between 1 and 1000),
  link           text check (
                   link is null
                   or (char_length(link) between 1 and 500 and link like '/%')
                 )
);
create index news_items_locale_published_idx
  on public.news_items (locale, published_at desc);

create table public.news_reads (
  account_id     uuid primary key references public.auth_users(id) on delete cascade,
  last_read_at   timestamptz not null
);

-- Product tips for every plan (Free perimeter includes the dashboard feed).
insert into public.news_items (id, published_at, locale, title, body, link) values
  (
    '019a2600-0000-7000-8000-000000000001',
    '2026-11-01T09:00:00Z',
    'it',
    'Completa Casa e i dati di soccorso',
    'Sul cruscotto trovi cosa fare dopo: chiusure di acqua, gas e luce, residenti e informazioni utili in emergenza. Apri Casa o Personale e completa un passo alla volta.',
    '/'
  ),
  (
    '019a2600-0000-7000-8000-000000000002',
    '2026-11-01T09:00:00Z',
    'en',
    'Finish Home and rescue details',
    'On the dashboard you see what to do next: water, gas and electricity shutoffs, residents and details useful in an emergency. Open Home or Personal and finish one step at a time.',
    '/'
  ),
  (
    '019a2600-0000-7000-8000-000000000003',
    '2026-11-05T10:00:00Z',
    'it',
    'Scadenze e avvisi in un colpo d’occhio',
    'Le scadenze del cruscotto sono suddivise in scadute, questa settimana e questo mese. Gli avvisi recenti sono anche nella casella in alto: puoi segnarli come letti uno per uno o tutti insieme.',
    '/'
  ),
  (
    '019a2600-0000-7000-8000-000000000004',
    '2026-11-05T10:00:00Z',
    'en',
    'Deadlines and alerts at a glance',
    'Dashboard deadlines are split into overdue, this week and this month. Recent alerts also appear in the header inbox: mark them read one by one or all at once.',
    '/'
  ),
  (
    '019a2600-0000-7000-8000-000000000005',
    '2026-11-10T11:00:00Z',
    'it',
    'Calendario di famiglia e file da scaricare',
    'In Famiglia trovi appuntamenti, orari settimanali e faccende insieme. Puoi scaricare il file calendario per usarlo anche fuori da DomuSafe.',
    '/famiglia'
  ),
  (
    '019a2600-0000-7000-8000-000000000006',
    '2026-11-10T11:00:00Z',
    'en',
    'Family calendar and downloadable file',
    'Under Family you find appointments, weekly schedules and chores together. You can download the calendar file to use it outside DomuSafe too.',
    '/famiglia'
  ),
  (
    '019a2600-0000-7000-8000-000000000007',
    '2026-11-12T12:00:00Z',
    'it',
    'Inventario: stanze, contenitori e ricerca',
    'In Casa › Inventario organizzi stanze, armadi e oggetti. Puoi cercare a testo libero e salvare fino a cinque filtri nella barra laterale.',
    '/casa'
  ),
  (
    '019a2600-0000-7000-8000-000000000008',
    '2026-11-12T12:00:00Z',
    'en',
    'Inventory: rooms, containers and search',
    'Under Home › Inventory you organise rooms, cupboards and items. You can search with free text and save up to five filters in the sidebar.',
    '/casa'
  );

alter table public.news_reads enable row level security;
create policy own on public.news_reads for all to domusafe_app
  using (account_id = app.account_id())
  with check (account_id = app.account_id());

grant select on public.news_items to domusafe_app;
grant select, insert, update, delete on public.news_reads to domusafe_app;
