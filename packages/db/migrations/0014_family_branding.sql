-- Host mark of one family: name, one color, a short welcome sentence and a small logo.
-- There is no object store yet, so the logo is a short data address (at most 24576 characters).
-- The row is class C. It is not a vault document and must not hold account numbers.

create table public.family_branding (
  family_id      uuid primary key references public.families(id) on delete cascade,
  version        integer not null default 1 check (version >= 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.auth_users(id) on delete set null,
  updated_by     uuid references public.auth_users(id) on delete set null,
  display_name   text,
  accent_color   char(7),
  welcome        text,
  logo_data_url  text,
  check (display_name is null or (char_length(btrim(display_name)) between 1 and 80 and display_name !~ '[0-9]{8}')),
  check (accent_color is null or accent_color ~ '^#[0-9a-f]{6}$'),
  check (welcome is null or (char_length(btrim(welcome)) between 1 and 160 and welcome !~ '[0-9]{8}')),
  check (
    logo_data_url is null
    or (
      char_length(logo_data_url) between 32 and 24576
      and logo_data_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'
    )
  ),
  check (
    display_name is not null
    or accent_color is not null
    or welcome is not null
    or logo_data_url is not null
  )
);

create trigger family_branding_touch before update on public.family_branding
  for each row execute function app.touch_updated_at();

alter table public.family_branding enable row level security;

create policy tenant_read on public.family_branding for select to domusafe_app
  using (family_id = app.family_id() and (select app.is_member()));

create policy admin_insert on public.family_branding for insert to domusafe_app
  with check (family_id = app.family_id() and (select app.role()) = 'admin');

create policy admin_update on public.family_branding for update to domusafe_app
  using (family_id = app.family_id() and (select app.role()) = 'admin')
  with check (family_id = app.family_id() and (select app.role()) = 'admin');

create policy admin_delete on public.family_branding for delete to domusafe_app
  using (family_id = app.family_id() and (select app.role()) = 'admin');

grant select, insert, update, delete on public.family_branding to domusafe_app;
