-- Base objects: schemas, extensions, search configuration, enums, shared trigger functions, currencies.

create schema if not exists app;

create extension if not exists citext with schema public;
create extension if not exists unaccent with schema public;
create extension if not exists pg_trgm with schema public;

create text search configuration public.domusafe_it (copy = pg_catalog.italian);
alter text search configuration public.domusafe_it
  alter mapping for hword, hword_part, word with public.unaccent, italian_stem;

create function app.f_unaccent(text) returns text
  language sql immutable parallel safe strict
  as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;

create type public.visibility        as enum ('family', 'personal');
create type public.member_role       as enum ('admin', 'parent', 'child', 'caregiver', 'guest');
create type public.membership_status as enum ('active', 'suspended', 'left');
create type public.plan_tier         as enum ('free', 'basic', 'advanced', 'premium');
create type public.plan_source       as enum ('default', 'stripe', 'operator');
create type public.scope_kind        as enum ('family', 'house_technical', 'house_guest', 'resident',
                                              'personal', 'vault_family', 'vault_personal');
create type public.grantee_key       as enum ('account', 'vault', 'kiosk');
create type public.data_class        as enum ('A', 'B', 'C');
create type public.revision_op       as enum ('create', 'update', 'delete', 'restore');
create type public.actor_kind        as enum ('account', 'kiosk', 'integration', 'system', 'anonymous');
create type public.resident_kind     as enum ('adult', 'child', 'elderly');
create type public.kiosk_profile     as enum ('standard', 'elderly');

create function app.touch_updated_at() returns trigger
  language plpgsql
  as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create table public.currencies (
  code       char(3) primary key check (code ~ '^[A-Z]{3}$'),
  minor_unit smallint not null check (minor_unit between 0 and 4),
  name_it    text not null,
  name_en    text not null
);

insert into public.currencies (code, minor_unit, name_it, name_en) values
  ('EUR', 2, 'Euro', 'Euro'),
  ('USD', 2, 'Dollaro statunitense', 'US dollar'),
  ('JPY', 0, 'Yen giapponese', 'Japanese yen'),
  ('CZK', 2, 'Corona ceca', 'Czech koruna'),
  ('DKK', 2, 'Corona danese', 'Danish krone'),
  ('GBP', 2, 'Sterlina britannica', 'Pound sterling'),
  ('HUF', 2, 'Fiorino ungherese', 'Hungarian forint'),
  ('PLN', 2, 'Zloty polacco', 'Polish zloty'),
  ('RON', 2, 'Leu rumeno', 'Romanian leu'),
  ('SEK', 2, 'Corona svedese', 'Swedish krona'),
  ('CHF', 2, 'Franco svizzero', 'Swiss franc'),
  ('ISK', 0, 'Corona islandese', 'Icelandic krona'),
  ('NOK', 2, 'Corona norvegese', 'Norwegian krone'),
  ('TRY', 2, 'Lira turca', 'Turkish lira'),
  ('AUD', 2, 'Dollaro australiano', 'Australian dollar'),
  ('BRL', 2, 'Real brasiliano', 'Brazilian real'),
  ('CAD', 2, 'Dollaro canadese', 'Canadian dollar'),
  ('CNY', 2, 'Renminbi cinese', 'Chinese yuan renminbi'),
  ('HKD', 2, 'Dollaro di Hong Kong', 'Hong Kong dollar'),
  ('IDR', 2, 'Rupia indonesiana', 'Indonesian rupiah'),
  ('ILS', 2, 'Nuovo siclo israeliano', 'Israeli shekel'),
  ('INR', 2, 'Rupia indiana', 'Indian rupee'),
  ('KRW', 0, 'Won sudcoreano', 'South Korean won'),
  ('MXN', 2, 'Peso messicano', 'Mexican peso'),
  ('MYR', 2, 'Ringgit malese', 'Malaysian ringgit'),
  ('NZD', 2, 'Dollaro neozelandese', 'New Zealand dollar'),
  ('PHP', 2, 'Peso filippino', 'Philippine peso'),
  ('SGD', 2, 'Dollaro di Singapore', 'Singapore dollar'),
  ('THB', 2, 'Baht thailandese', 'Thai baht'),
  ('ZAR', 2, 'Rand sudafricano', 'South African rand');
