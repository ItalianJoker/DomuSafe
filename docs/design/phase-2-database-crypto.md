# DomuSafe Suite — Fase 2: schema database e crittografia

> **Stato:** approvata in autonomia il 3 novembre 2026 su istruzione esplicita dell'utente ("conferma ogni fase e prosegui"). È la base vincolante della [fase 3](phase-3-api-rbac.md).
> **Fonti:** [fase 1 — stack e architettura](phase-1-stack-architecture.md) (le 11 decisioni della §10 restano valide) · [prompt master](master-prompt.md) · [standard di codice](coding-standards.md).
> **Verifica:** i vettori di test della §11 sono stati calcolati il 3 novembre 2026 con Node.js 26.13 (Web Crypto nativa), hash-wasm 4.12.0 e @scure/bip39 2.4.0; nessun valore è inventato.

---

## 1. Sintesi

| Tema | Decisione |
| :--- | :--- |
| Database | PostgreSQL 18, schema `public` per i dati, schema `app` per funzioni di contesto e sicurezza, schema `pgboss` per le code |
| Chiavi primarie | `uuidv7()` generato dal database; per i record cifrati l'id è generato dal browser (UUIDv7) perché entra nei dati associati autenticati |
| Isolamento | Row-Level Security su ogni tabella di dominio, con modelli di policy riutilizzati (§5) e chiavi esterne composte `(family_id, id)` che rendono impossibile un riferimento tra famiglie |
| Classi di dati | A Cassaforte · B Sensibili · C Operativi (più S segreti di servizio e P pubblicazioni) — §2 |
| Cifratura client | AES-256-GCM, HKDF-SHA-256, ECDH P-256 (Web Crypto); Argon2id in WebAssembly per PIN e backup |
| Formati | busta `DS-ENV v1`, concessione `DS-GRANT v1`, flusso a blocchi `DS-STREAM v1`, backup `DS-BACKUP v1`, segreti server `S1` — §8.2 |
| Gerarchia | chiave dispositivo → chiave account → coppie di chiavi (generale, Cassaforte, recupero) → chiavi d'ambito versionate → chiave per record — §8.5 |
| PIN | Argon2id nel browser + Argon2id sul server + quota server da 32 byte; 5 errori consecutivi bloccano; sblocco e reimpostazione con la frase di recupero — §8.7 |
| Recupero | 24 parole italiane (256 bit), coppia di chiavi di recupero dedicata, verifica senza rivelare la frase — §8.8 |
| Conservazione | registro attività 24 mesi, eventi di sicurezza con indirizzo IP 90 giorni, telemetria grezza 13 mesi — §13 |

## 2. Classi di dati

### 2.1 Definizioni

| Classe | Significato | Chi cifra | Forma nel database | Il server legge? |
| :--- | :--- | :--- | :--- | :--- |
| **A — Cassaforte** | patrimonio, conti, polizze, previdenza, documenti di lavoro e fiscali, eredità digitale, kit password, checklist di successione | browser, chiavi d'ambito `vault_family` / `vault_personal`, disponibili solo dopo lo sblocco con PIN | colonne busta (`enc_*`) | No |
| **B — Sensibili** | salute, farmaci, diario parametri, "Chi sono", consegne, note della rubrica relazioni, contatti di emergenza, codici di accesso, PIN e PUK della SIM, dati di pagamento | browser, chiavi d'ambito `family`, `house_technical`, `house_guest`, `resident`, `personal` | colonne busta (`enc_*`), anche opzionali in record misti | No |
| **C — Operativi** | tutto il resto: case, stanze, inventario, utenze (esclusi i dati di pagamento), scadenze, calendario, faccende, punti, cucina, contabilità, telemetria | TLS in transito; cifratura del disco e del bucket a riposo | colonne normali | Sì |
| **S — Segreti di servizio** | quote server del PIN, token Home Assistant, credenziali MQTT, segreti webhook, chiave API del modello AI | server, formato `S1` con chiave master | `bytea` in formato `S1` | Solo il processo |
| **P — Pubblicazioni** | istantanea del QR emergenza | browser, chiave casuale nel frammento dell'URL | `bytea` in formato `DS-ENV` | No |

### 2.2 Regole

1. **La classe è della sezione, non del singolo valore.** Ogni tabella dichiara la propria classe (§6); le colonne busta portano la parte A o B dei record misti.
2. **Record misti:** campi C in chiaro per ciò che il server deve elaborare (date, importi, nomi di fornitore, ricorrenze) e una busta B per il resto. La busta è opzionale solo dove indicato con `⟨busta?⟩`.
3. **File:** `files.data_class` è uguale alla classe del record proprietario; i file A e B sono cifrati con `DS-STREAM v1` e il nome originale sta in una busta dei metadati.
4. **Campi personalizzati:** nelle sezioni C stanno nella colonna `custom_fields`; nelle sezioni A e B stanno dentro la busta del record. Nelle sezioni A e B anche l'etichetta del campo è cifrata (§6.24).
5. **Promemoria neutri:** una scadenza di un record A o B genera un promemoria C con testo neutro scritto dal browser (es. "Scadenza documento Cassaforte"); il collegamento al record di origine sta dentro la busta del record A/B, non nel promemoria.
6. **Ricerca:** l'indice full-text del server contiene solo testo C; la ricerca su A e B avviene nel browser con un indice in memoria mai salvato.

### 2.3 Campi A e B nei record misti

| Tabella | Campi in chiaro (C) | Campi nella busta | Classe busta | Ambito della chiave |
| :--- | :--- | :--- | :--- | :--- |
| `utilities` | tipo, fornitore, codice cliente, codice del punto di fornitura, tariffa, date, importo stimato | IBAN o carta di addebito, intestatario del pagamento | B | `family` |
| `subscriptions_services` | nome, fornitore, costo, frequenza, rinnovo, preavviso di disdetta | dati di pagamento | B | `family` o `personal` |
| `house_guide_entries` | titolo, testo del manuale, argomento, pubblico | password Wi‑Fi, codici di cancello, citofono e allarme | B | `house_guest` o `house_technical` |
| `phone_lines` | operatore, numero, piano, costo, rinnovo | PIN e PUK della SIM, codice di migrazione | B | `personal` o `resident` |
| `fin_accounts` | nome, tipo, valuta | IBAN, numero di conto o di carta | B | `family` o `personal` |
| `relationship_entries` | nome, relazione, data dell'ultimo contatto, intervallo | note | B | `personal` o `family` |
| `emergency_settings` | attivazione SOS, canali | testo del messaggio e destinatari | B | `family` |
| `residents` | nome visualizzato, tipo, colore | — (la scheda "Chi sono" è in `resident_cards`) | — | — |

## 3. Convenzioni dello schema

### 3.1 Nomi e tipi

- Identificatori SQL in inglese, `snake_case`, tabelle al plurale. Etichette italiane solo nell'interfaccia (i18n).
- Date e ore `timestamptz`; date di calendario locali `date`, interpretate nel fuso orario della famiglia (`families.timezone`).
- Importi in **unità minori** `bigint` (centesimi per EUR) con `currency char(3)` riferita a `currencies(code)`; nessun tipo `money` o `numeric` per gli importi.
- Testo libero con limite esplicito via `check (char_length(...) <= n)`; i limiti coincidono con gli schemi Zod di `packages/contracts`.
- Enumerazioni come tipi `enum` di PostgreSQL quando l'insieme è chiuso e stabile; `text` con `check` quando cresce spesso (es. `action` del registro).
- Testi binari (`bytea`) per chiavi pubbliche, buste e hash; nelle API sono codificati in base64url senza riempimento.

### 3.2 Gruppi di colonne

Nel codice ogni gruppo è una funzione Drizzle condivisa in `packages/db/src/columns.ts`; qui è indicato tra parentesi angolari.

| Gruppo | Colonne e vincoli |
| :--- | :--- |
| `⟨base⟩` | `id uuid primary key default uuidv7()`, `version integer not null default 1 check (version >= 1)`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `created_by uuid references auth_users(id) on delete set null`, `updated_by uuid references auth_users(id) on delete set null` |
| `⟨base-client⟩` | come `⟨base⟩`, ma `id uuid primary key check (uuid_extract_version(id) = 7)` senza valore predefinito: l'id è generato dal browser |
| `⟨tenant⟩` | `family_id uuid not null references families(id) on delete cascade`, `unique (family_id, id)` |
| `⟨house⟩` / `⟨house?⟩` | `house_id uuid not null` (oppure null), `foreign key (family_id, house_id) references houses(family_id, id) on delete cascade` |
| `⟨resident⟩` / `⟨resident?⟩` | `resident_id uuid not null` (oppure null), `foreign key (family_id, resident_id) references residents(family_id, id) on delete cascade` |
| `⟨visibility⟩` | `visibility visibility not null default 'family'`, `owner_account_id uuid references auth_users(id) on delete cascade`, `check ((visibility = 'personal') = (owner_account_id is not null))` |
| `⟨trash⟩` | `deleted_at timestamptz` — cestino di 30 giorni, poi eliminazione definitiva da parte del job `purge-trash` |
| `⟨busta⟩` | `enc_scope_id uuid not null`, `enc_key_version integer not null`, `enc_dek bytea not null`, `enc_payload bytea not null check (octet_length(enc_payload) between 29 and 262144)`, `foreign key (family_id, enc_scope_id) references key_scopes(family_id, id)`, `foreign key (enc_scope_id, enc_key_version) references scope_key_versions(scope_id, version)`, trigger `app.check_envelope_scope(<tipi d'ambito ammessi>)` |
| `⟨busta?⟩` | le stesse quattro colonne ammettono null, con `check (num_nulls(enc_scope_id, enc_key_version, enc_dek, enc_payload) in (0, 4))` |
| `⟨custom⟩` | `custom_fields jsonb not null default '{}' check (jsonb_typeof(custom_fields) = 'object' and octet_length(custom_fields::text) <= 16384)` |

Regole collegate:

- **Chiavi esterne composte.** Ogni riferimento a una risorsa di famiglia usa `(family_id, <colonna>)`: un record non può puntare a una casa, a un residente o a un ambito di chiavi di un'altra famiglia, anche per errore applicativo.
- **Versione e concorrenza.** `version` aumenta di 1 a ogni scrittura riuscita (`update … set version = version + 1 where id = $1 and version = $2`); zero righe aggiornate significa conflitto (risposta 409 in fase 3). L'ETag HTTP è `"<version>"`.
- **`updated_at`** è aggiornato dal trigger `app.touch_updated_at()`.
- **Trigger `app.check_envelope_scope(kinds…)`**: verifica che `enc_scope_id` appartenga alla stessa famiglia, che il tipo d'ambito sia tra quelli ammessi dalla tabella e, per le righe `personal`, che `key_scopes.owner_account_id = owner_account_id`.
- **Dimensione delle buste:** 29 byte è il minimo di `DS-ENV v1` (1 + 12 + 16); 256 KiB è il massimo per un record. Contenuti più grandi diventano file.

### 3.3 Tipi enumerati comuni

```sql
create type visibility        as enum ('family', 'personal');
create type member_role       as enum ('admin', 'parent', 'child', 'caregiver', 'guest');
create type membership_status as enum ('active', 'suspended', 'left');
create type plan_tier         as enum ('free', 'basic', 'advanced', 'premium');
create type plan_source       as enum ('default', 'stripe', 'operator');
create type scope_kind        as enum ('family', 'house_technical', 'house_guest', 'resident',
                                       'personal', 'vault_family', 'vault_personal');
create type grantee_key       as enum ('account', 'vault', 'kiosk');
create type data_class        as enum ('A', 'B', 'C');
create type revision_op       as enum ('create', 'update', 'delete', 'restore');
create type actor_kind        as enum ('account', 'kiosk', 'integration', 'system', 'anonymous');
```

Gli altri enum sono definiti con la tabella che li usa (§6).

### 3.4 Estensioni e configurazione di ricerca

```sql
create extension if not exists citext;
create extension if not exists unaccent;
create extension if not exists pg_trgm;

create text search configuration domusafe_it (copy = pg_catalog.italian);
alter text search configuration domusafe_it
  alter mapping for hword, hword_part, word with unaccent, italian_stem;

create function app.f_unaccent(text) returns text
  language sql immutable parallel safe strict
  as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;
```

`app.f_unaccent` è la versione immutabile di `unaccent`, necessaria per gli indici a trigrammi. Le colonne `tsvector` generate usano la forma a due argomenti `to_tsvector('domusafe_it', …)`, che è immutabile.

## 4. Ruoli, privilegi e contesto di sessione

### 4.1 Ruoli database

| Ruolo | Uso | Attributi |
| :--- | :--- | :--- |
| `domusafe_owner` | esegue le migrazioni; proprietario di tabelle, tipi e funzioni `security definer` | `NOLOGIN` in produzione; le migrazioni usano un utente con `SET ROLE domusafe_owner` |
| `domusafe_app` | API e worker | `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE` |

Privilegi di `domusafe_app`:

- `SELECT, INSERT, UPDATE, DELETE` sulle tabelle di dominio, filtrate da RLS;
- solo `SELECT, INSERT` su `audit_events`, `security_events`, `point_entries` e `revisions` (append-only);
- solo `SELECT` sulle tabelle di catalogo globali (`currencies`, `news_items`), più `INSERT, UPDATE` su `fx_rates`;
- `EXECUTE` sulle funzioni dello schema `app`;
- uso completo dello schema `pgboss`.

`domusafe_owner` non ha `FORCE ROW LEVEL SECURITY`: le funzioni `security definer` che esso possiede (§4.3) leggono senza RLS e per questo restituiscono solo le colonne strettamente necessarie.

### 4.2 Variabili di contesto

Ogni transazione dell'API e del worker inizia con `SET LOCAL` (in `packages/db/src/context.ts`, unico punto che le imposta):

| Variabile | Valore | Impostata quando |
| :--- | :--- | :--- |
| `app.principal` | `account` · `kiosk` · `integration` · `system` | sempre |
| `app.account_id` | uuid dell'account | principal `account` |
| `app.kiosk_id` | uuid del dispositivo kiosk | principal `kiosk` |
| `app.integration_id` | uuid della connessione domotica | principal `integration` |
| `app.family_id` | uuid della famiglia del percorso | richieste dentro `/families/{familyId}`, job per famiglia |

Le richieste senza famiglia nel percorso (account, dispositivi, elenco famiglie) impostano solo `app.principal` e `app.account_id`.

### 4.3 Funzioni di contesto

```sql
create function app.principal() returns text language sql stable parallel safe
  as $$ select coalesce(nullif(current_setting('app.principal', true), ''), 'none') $$;
create function app.account_id() returns uuid language sql stable parallel safe
  as $$ select nullif(current_setting('app.account_id', true), '')::uuid $$;
create function app.kiosk_id() returns uuid language sql stable parallel safe
  as $$ select nullif(current_setting('app.kiosk_id', true), '')::uuid $$;
create function app.integration_id() returns uuid language sql stable parallel safe
  as $$ select nullif(current_setting('app.integration_id', true), '')::uuid $$;
create function app.family_id() returns uuid language sql stable parallel safe
  as $$ select nullif(current_setting('app.family_id', true), '')::uuid $$;
```

Funzioni `security definer` (proprietario `domusafe_owner`, `set search_path = public, pg_temp`), richiamate nelle policy dentro `(select …)` così PostgreSQL le valuta una sola volta per istruzione:

| Funzione | Restituisce |
| :--- | :--- |
| `app.is_member()` | `true` se il principal ha accesso attivo a `app.family_id()`: appartenenza `active` non scaduta (account), kiosk non revocato della famiglia, connessione domotica attiva della famiglia, oppure principal `system` con famiglia esistente |
| `app.role()` | ruolo `member_role` dell'account nella famiglia corrente, null per gli altri principal |
| `app.all_houses()` | `true` per appartenenze con `all_houses` e per `system`; `false` per kiosk e integrazioni |
| `app.house_ids()` | `uuid[]` delle case consentite: `membership_houses` per appartenenze ristrette, la casa del kiosk o della connessione |
| `app.all_residents()` | `true` per appartenenze con `all_residents` e per `system` |
| `app.resident_ids()` | `uuid[]` dei residenti consentiti: `membership_residents`, il residente collegato all'account, il residente del profilo anziani del kiosk |
| `app.my_family_ids()` | `uuid[]` delle famiglie in cui l'account ha un'appartenenza `active` |

Funzioni `security definer` per gli accessi che avvengono prima di avere un contesto di famiglia; restituiscono solo i campi elencati:

| Funzione | Uso | Campi restituiti |
| :--- | :--- | :--- |
| `app.create_family(name, timezone, base_currency, locale)` | registrazione e nuove famiglie | id della famiglia; inserisce famiglia e appartenenza `admin` del chiamante come Proprietario |
| `app.invitation_by_token(token_hash)` | apertura di un invito | id, famiglia (nome), ruolo, scadenza, stato, pacchetto di chiavi |
| `app.accept_invitation(token_hash)` | accettazione | id dell'appartenenza creata; segna l'invito come usato nella stessa istruzione |
| `app.create_access_request(join_token_hash, role, message)` | richiesta di accesso da non membro | id della richiesta |
| `app.emergency_snapshot(token_hash)` | pagina emergenza anonima | id, versione, testo cifrato, stato di revoca, id della famiglia; aggiorna `last_scanned_at` e `scan_count` |
| `app.ics_feed(token_hash)` | feed calendario | id della famiglia e ambito del feed; aggiorna `last_fetched_at` |
| `app.kiosk_by_credential(credential_hash)` | autenticazione kiosk | id del kiosk, famiglia, casa, stato |
| `app.integration_secrets(connection_id)` | verifica HMAC dei webhook domotici | famiglia, casa, segreti `S1` attuale e precedente, stato |
| `app.host_allowed(hostname)` | autorizzazione TLS su richiesta di Caddy | booleano: host verificato di una famiglia Premium |
| `app.family_by_host(hostname)` | marchio white-label | id della famiglia |
| `app.public_keys(account_ids uuid[])` | directory chiavi | chiavi pubbliche e impronta solo per account che condividono una famiglia con il chiamante o che hanno una richiesta di accesso aperta verso una famiglia di cui il chiamante è Amministratore |
| `app.due_work(kind, until)` | scansioni del worker tra famiglie | coppie `(family_id, id)` dei promemoria, delle ricorrenze o dei job dovuti; il worker poi elabora ogni famiglia con il proprio contesto |
| `app.ensure_partitions()` · `app.drop_expired_partitions()` | manutenzione delle partizioni (§7) | numero di partizioni create o eliminate |
| `app.prune_revisions()` · `app.purge_trash()` · `app.purge_family(family_id)` | conservazione (§13) sulle tabelle append-only e cestino | numero di righe eliminate; unico modo per eliminare revisioni e voci punti |

## 5. Modelli di policy RLS

Ogni tabella di dominio ha `ENABLE ROW LEVEL SECURITY` e una **policy permissiva di tenant** più eventuali **policy restrittive** (combinate in AND). Le sigle sono usate nella §6.

| Sigla | Tipo | Condizione |
| :--- | :--- | :--- |
| **T** | permissiva, `for all` | `family_id = app.family_id() and (select app.is_member())` (sia `using` sia `with check`) |
| **P** | restrittiva | `visibility = 'family' or owner_account_id = app.account_id()` |
| **H** | restrittiva | `house_id is null or (select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[])` |
| **R** | restrittiva | `resident_id is null or (select app.all_residents()) or resident_id = any ((select app.resident_ids())::uuid[])` |
| **O** | restrittiva | `(select app.role()) is distinct from 'guest' or <colonna di visibilità per ospiti>` (es. `audience = 'guest'`, `visible_to_guests`) |
| **Q(ruoli)** | restrittiva | `(select app.principal()) = 'system' or (select app.role()) = any ('{<ruoli>}'::member_role[])`; dove indicato vale solo per alcuni comandi |
| **K** | restrittiva | `(select app.principal()) <> 'kiosk' or <condizione sul kiosk>` |
| **A** | permissiva, `for all` | `account_id = app.account_id()` (tabelle dell'account, fuori dal tenant) |
| **G** | nessuna RLS | catalogo globale in sola lettura per `domusafe_app` |
| **X** | nessuna RLS | tabelle di identità e di fatturazione toccate solo dai moduli `identity` e `billing`; privilegi ristretti |

Esempio completo per una tabella con P e H:

```sql
alter table house_guide_entries enable row level security;

create policy tenant on house_guide_entries for all to domusafe_app
  using      (family_id = app.family_id() and (select app.is_member()))
  with check (family_id = app.family_id() and (select app.is_member()));

create policy house_guard on house_guide_entries as restrictive for all to domusafe_app
  using      (house_id is null or (select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]))
  with check (house_id is null or (select app.all_houses()) or house_id = any ((select app.house_ids())::uuid[]));

create policy guest_guard on house_guide_entries as restrictive for all to domusafe_app
  using ((select app.role()) is distinct from 'guest' or audience = 'guest');
```

La RLS è una **rete di sicurezza**: le regole di dettaglio per ruolo e azione stanno nelle policy dei moduli (fase 3). La RLS garantisce comunque che un errore applicativo non esponga dati di un'altra famiglia, dati personali di un altro account, case o residenti fuori dall'ambito di Caregiver, Ospite e kiosk, e contenuti tecnici agli Ospiti.

## 6. Schema per modulo

Legenda: classe · policy RLS · `rev` = scrive revisioni (§6.6) · `ric` = alimenta l'indice di ricerca (§6.16) · `cf` = supporta campi personalizzati.

### 6.1 `identity`

Tabelle gestite da Better Auth (adapter Drizzle, id uuid, nomi `auth_*`). Classe C/S · RLS X.

```sql
create table auth_users (
  id                 uuid primary key default uuidv7(),
  name               text not null check (char_length(name) between 1 and 80),
  email              citext not null unique,
  email_verified     boolean not null default false,
  image              text,
  two_factor_enabled boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table auth_sessions (
  id          uuid primary key default uuidv7(),
  user_id     uuid not null references auth_users(id) on delete cascade,
  token       text not null unique,
  expires_at  timestamptz not null,
  user_agent  text,
  ip_address  text,                      -- sempre null: tracciamento IP disattivato in Better Auth
  device_id   uuid,                      -- dispositivo abbinato che ha aperto la sessione
  fresh_until timestamptz,               -- ri-autenticazione recente (5 minuti)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index auth_sessions_user_idx on auth_sessions (user_id, expires_at desc);

create table auth_accounts (              -- collegamenti a credenziali e provider (non è l'"account" di dominio)
  id                       uuid primary key default uuidv7(),
  user_id                  uuid not null references auth_users(id) on delete cascade,
  provider_id              text not null,  -- 'credential', 'google', 'keycloak', 'authentik'
  account_id               text not null,  -- id presso il provider
  password                 text,           -- stringa PHC Argon2id (solo 'credential')
  access_token             text,           -- cifrato da Better Auth (encryptOAuthTokens)
  refresh_token            text,
  id_token                 text,
  access_token_expires_at  timestamptz,
  refresh_token_expires_at timestamptz,
  scope                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (provider_id, account_id)
);
create index auth_accounts_user_idx on auth_accounts (user_id);

create table auth_verifications (
  id         uuid primary key default uuidv7(),
  identifier text not null,
  value      text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index auth_verifications_identifier_idx on auth_verifications (identifier);

create table auth_two_factors (
  id                        uuid primary key default uuidv7(),
  user_id                   uuid not null unique references auth_users(id) on delete cascade,
  secret                    text not null,     -- cifrato dal plugin two-factor con il segreto Better Auth
  backup_codes              text not null,     -- cifrati dal plugin (modalità 'encrypted')
  verified                  boolean not null default true,
  failed_verification_count integer not null default 0,
  locked_until              timestamptz        -- blocco temporaneo dopo troppi codici errati
);
```

Il segreto di Better Auth (`BETTER_AUTH_SECRET`) è derivato all'avvio dalla chiave master di classe S con HKDF (etichetta `domusafe/s1/better-auth`): ruotare la chiave master ruota anche quello.

Tabelle di dominio dell'identità:

| Tabella | Colonne | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- |
| `account_profiles` | `account_id` pk → `auth_users`, `display_name`, `locale` (`it`, `en`), `theme` (`light`, `dark`, `system`), `primary_family_id`, `last_family_id`, `last_house_id`, `updated_at` | `primary_family_id` valorizzato da `app.create_family` alla creazione della prima famiglia; finché è null l'interfaccia apre la procedura "Crea la tua famiglia" | A |
| `personal_access_tokens` | `id`, `account_id`, `family_id`, `name`, `token_hash bytea(32) unique`, `scopes text[]`, `expires_at` (max 365 giorni), `last_used_at`, `revoked_at`, `created_at` | indice `(account_id) where revoked_at is null` | A |
| `security_events` | vedi §6.7 | partizionata | A in lettura |

`personal_access_tokens` serve a client esterni e al server MCP: il token (256 bit casuali, prefisso `dst_`) è mostrato una sola volta; si conserva solo SHA-256.

### 6.2 `tenancy`

```sql
create table families (
  id               uuid primary key default uuidv7(),
  name             text not null check (char_length(name) between 1 and 120),
  owner_account_id uuid not null references auth_users(id) on delete restrict,
  plan             plan_tier not null default 'free',
  plan_source      plan_source not null default 'default',
  timezone         text not null default 'Europe/Rome',
  base_currency    char(3) not null default 'EUR' references currencies(code),
  locale           text not null default 'it' check (locale in ('it', 'en')),
  version          integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
-- RLS: id = any((select app.my_family_ids())) in lettura; scrittura solo con id = app.family_id()
-- e ruolo admin (Q(admin)); creazione solo tramite app.create_family.

create table memberships (
  id            uuid primary key default uuidv7(),
  family_id     uuid not null references families(id) on delete cascade,
  account_id    uuid not null references auth_users(id) on delete cascade,
  role          member_role not null,
  status        membership_status not null default 'active',
  all_houses    boolean not null default true,
  all_residents boolean not null default true,
  vault_family  boolean not null default false,   -- concessione Cassaforte di famiglia (Genitore)
  expires_at    timestamptz,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth_users(id) on delete set null,
  unique (family_id, account_id),
  unique (family_id, id),
  check (role <> 'guest' or (expires_at is not null and not all_houses and not all_residents)),
  check (role <> 'caregiver' or (not all_houses and not all_residents)),
  check (not vault_family or role in ('admin', 'parent'))
);
create index memberships_account_idx on memberships (account_id) where status = 'active';
-- RLS: account_id = app.account_id() (le proprie appartenenze in tutte le famiglie)
--      oppure T (i membri della famiglia corrente); scrittura Q(admin).

create table membership_houses (
  membership_id uuid not null,
  family_id     uuid not null,
  house_id      uuid not null,
  primary key (membership_id, house_id),
  foreign key (family_id, membership_id) references memberships(family_id, id) on delete cascade,
  foreign key (family_id, house_id) references houses(family_id, id) on delete cascade
);
create table membership_residents (            -- stessa forma con resident_id
  membership_id uuid not null,
  family_id     uuid not null,
  resident_id   uuid not null,
  primary key (membership_id, resident_id),
  foreign key (family_id, membership_id) references memberships(family_id, id) on delete cascade,
  foreign key (family_id, resident_id) references residents(family_id, id) on delete cascade
);
```

Un trigger differito su `families` e `memberships` garantisce che `owner_account_id` abbia sempre un'appartenenza `active` con ruolo `admin`.

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `houses` | C | `⟨base⟩ ⟨tenant⟩ ⟨trash⟩`, `name` (1–120), `address_line`, `postal_code`, `city`, `province`, `country char(2) default 'IT'`, `cover_file_id`, `sort_order smallint`, `plan_locked_at` | indice `(family_id, sort_order) where deleted_at is null` | T, H · `rev` · `ric` · `cf` |
| `invitations` | C + chiavi | `⟨base-client⟩ ⟨tenant⟩`, `role`, `all_houses`, `all_residents`, `house_ids uuid[]`, `resident_ids uuid[]`, `membership_expires_at`, `token_hash bytea(32) unique`, `key_package bytea` (`DS-ENV`), `key_package_scopes jsonb` (elenco `{scopeId, version}`), `delivery` (`link`, `qr`, `email`), `email citext`, `expires_at` (max 14 giorni), `used_at`, `used_by`, `revoked_at` | `check (role <> 'guest' or membership_expires_at is not null)`; indice `(family_id, created_at desc)` | T, Q(admin, parent) — il Genitore crea solo inviti `guest` (policy del modulo) |
| `family_join_links` | C | `⟨base⟩ ⟨tenant⟩`, `token_hash bytea(32) unique`, `default_role` (`parent`, `child`, `caregiver`), `expires_at`, `revoked_at` | — | T, Q(admin) |
| `access_requests` | C | `⟨base⟩ ⟨tenant⟩`, `requester_account_id`, `requested_role`, `requested_all_houses`, `requested_house_ids uuid[]`, `requested_all_residents`, `requested_resident_ids uuid[]`, `message` (≤500), `status` (`pending`, `approved`, `rejected`, `withdrawn`), `decided_by`, `decided_at` | indice unico `(family_id, requester_account_id) where status = 'pending'` | lettura: richiedente (`requester_account_id = app.account_id()`) oppure T + Q(admin); creazione da non membro solo con `app.create_access_request` |
| `ownership_transfers` | C | `⟨base⟩ ⟨tenant⟩`, `from_account_id`, `to_account_id`, `status` (`pending`, `accepted`, `cancelled`, `expired`), `expires_at` (7 giorni), `decided_at` | indice unico `(family_id) where status = 'pending'` | T, Q(admin) |

### 6.3 `keys`

```sql
create table account_keys (
  account_id                    uuid primary key references auth_users(id) on delete cascade,
  public_key                    bytea not null check (octet_length(public_key) = 65 and get_byte(public_key, 0) = 4),
  wrapped_private_key           bytea not null,   -- DS-ENV, KEK = HKDF(AK, "domusafe/v1/account-private-key-kek")
  recovery_public_key           bytea not null check (octet_length(recovery_public_key) = 65),
  recovery_wrapped_private_key  bytea not null,   -- DS-ENV, KEK = HKDF(entropia, "domusafe/v1/recovery/private-key-kek")
  recovery_wrapped_account_key  bytea not null,   -- DS-ENV, KEK = HKDF(entropia, "domusafe/v1/recovery/account-key-kek")
  recovery_verifier_sha256      bytea not null check (octet_length(recovery_verifier_sha256) = 32),
  vault_public_key              bytea check (octet_length(vault_public_key) = 65),
  wrapped_vault_private_key     bytea,            -- DS-ENV, KEK = chiave di sblocco Cassaforte (§8.7)
  recovery_sealed_vault_key     bytea,            -- DS-GRANT verso recovery_public_key
  fingerprint                   text not null,    -- 6 parole (§8.5)
  key_generation                smallint not null default 1,
  version                       integer not null default 1,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  check (num_nulls(vault_public_key, wrapped_vault_private_key, recovery_sealed_vault_key) in (0, 3))
);
-- RLS A: ogni account legge e scrive solo la propria riga; le chiavi pubbliche altrui
-- si ottengono solo da app.public_keys().

create table account_pins (
  account_id          uuid primary key references auth_users(id) on delete cascade,
  pin_salt            bytea not null check (octet_length(pin_salt) = 16),
  kdf_memory_kib      integer not null default 65536 check (kdf_memory_kib >= 19456),
  kdf_iterations      smallint not null default 3 check (kdf_iterations >= 2),
  kdf_parallelism     smallint not null default 1 check (kdf_parallelism between 1 and 4),
  verifier_hash       text not null,              -- PHC Argon2id calcolato sul server
  server_share_sealed bytea not null,             -- S1, AAD "domusafe/s1|account_pins.server_share|<accountId>"
  failed_attempts     smallint not null default 0 check (failed_attempts between 0 and 5),
  locked_at           timestamptz,
  pin_generation      integer not null default 1,
  updated_at          timestamptz not null default now(),
  check ((failed_attempts = 5) = (locked_at is not null))
);
-- RLS A.

create table devices (
  id                  uuid primary key check (uuid_extract_version(id) = 7),   -- generato dal browser
  account_id          uuid not null references auth_users(id) on delete cascade,
  label               text not null check (char_length(label) between 1 and 80),
  platform            text not null check (platform in ('android', 'ios', 'windows', 'macos', 'linux', 'other')),
  wrapped_account_key bytea,                      -- DS-ENV con la chiave dispositivo; null dopo la revoca
  paired_via          text not null check (paired_via in ('signup', 'pairing', 'recovery')),
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz,
  revoked_at          timestamptz,
  check ((revoked_at is null) = (wrapped_account_key is not null))
);
create index devices_account_idx on devices (account_id) where revoked_at is null;
-- RLS A.

create table key_scopes (
  id                   uuid primary key check (uuid_extract_version(id) = 7),  -- generato dal browser
  family_id            uuid not null references families(id) on delete cascade,
  kind                 scope_kind not null,
  house_id             uuid,
  resident_id          uuid,
  owner_account_id     uuid references auth_users(id) on delete cascade,
  current_version      integer not null default 1,
  rotation_required_at timestamptz,
  created_at           timestamptz not null default now(),
  created_by           uuid references auth_users(id) on delete set null,
  unique (family_id, id),
  unique nulls not distinct (family_id, kind, house_id, resident_id, owner_account_id),
  foreign key (family_id, house_id) references houses(family_id, id) on delete cascade,
  foreign key (family_id, resident_id) references residents(family_id, id) on delete cascade,
  check ((kind in ('house_technical', 'house_guest')) = (house_id is not null)),
  check ((kind = 'resident') = (resident_id is not null)),
  check ((kind in ('personal', 'vault_personal')) = (owner_account_id is not null))
);
-- RLS T.

create table scope_key_versions (
  scope_id   uuid not null references key_scopes(id) on delete cascade,
  version    integer not null check (version >= 1),
  created_at timestamptz not null default now(),
  created_by uuid references auth_users(id) on delete set null,
  primary key (scope_id, version)
);
-- RLS: exists sulla key_scopes visibile (policy con sottoquery su key_scopes).

create table scope_key_grants (
  id                 uuid primary key default uuidv7(),
  family_id          uuid not null references families(id) on delete cascade,
  scope_id           uuid not null,
  version            integer not null,
  grantee            grantee_key not null,         -- 'account', 'vault' o 'kiosk'
  grantee_account_id uuid references auth_users(id) on delete cascade,
  grantee_kiosk_id   uuid,
  grant_blob         bytea not null,               -- DS-GRANT v1
  granted_by         uuid references auth_users(id) on delete set null,
  created_at         timestamptz not null default now(),
  foreign key (family_id, scope_id) references key_scopes(family_id, id) on delete cascade,
  foreign key (scope_id, version) references scope_key_versions(scope_id, version) on delete cascade,
  foreign key (family_id, grantee_kiosk_id) references kiosk_devices(family_id, id) on delete cascade,
  check ((grantee = 'kiosk') = (grantee_kiosk_id is not null)),
  check ((grantee in ('account', 'vault')) = (grantee_account_id is not null)),
  unique nulls not distinct (scope_id, version, grantee, grantee_account_id, grantee_kiosk_id)
);
create index scope_key_grants_grantee_idx on scope_key_grants (family_id, grantee_account_id);
-- RLS T + restrittiva: grantee_account_id = app.account_id()
--   or grantee_kiosk_id = app.kiosk_id() or (select app.role()) = 'admin'.
-- Trigger: gli ambiti vault_* accettano solo grantee 'vault'; gli altri solo 'account' o 'kiosk'.
```

Il canale di abbinamento dei dispositivi (§8.9) è effimero e sta in Valkey con scadenza di 5 minuti, non nel database.

### 6.4 `billing`

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `subscriptions` | C | `id`, `family_id unique`, `provider` (`stripe`), `customer_ref`, `subscription_ref unique`, `plan`, `status` (`trialing`, `active`, `past_due`, `canceled`, `incomplete`), `payer_account_id`, `current_period_end`, `cancel_at`, `updated_at` | — | T in lettura con Q(admin); scrittura solo principal `system` (webhook del provider) |
| `premium_trials` | C | `account_id` pk, `family_id`, `started_at`, `ends_at` | `check (ends_at = started_at + interval '30 days')`; la chiave primaria su `account_id` impone "una volta per account" | lettura: `account_id = app.account_id()` oppure T |
| `billing_events` | C | `provider_event_id text unique`, `type`, `family_id`, `received_at`, `processed_at`, `error_code` | idempotenza dei webhook del provider | X |

Il piano effettivo è calcolato da `packages/plans`: il maggiore tra `families.plan` e Premium se esiste una prova attiva dell'attuale Proprietario su quella famiglia. Al declassamento le case e i residenti oltre il limite ricevono `plan_locked_at` (scelti dal Proprietario, in mancanza i più recenti) e diventano di sola lettura (decisione 11 della fase 1).

### 6.5 `media`

```sql
create type file_status as enum ('pending', 'stored', 'failed');
create table files (
  id               uuid primary key check (uuid_extract_version(id) = 7),  -- generato dal browser
  family_id        uuid not null references families(id) on delete cascade,
  house_id         uuid,
  resident_id      uuid,
  visibility       visibility not null default 'family',
  owner_account_id uuid references auth_users(id) on delete cascade,
  data_class       data_class not null,
  resource_type    text not null check (resource_type ~ '^[a-z_]{2,40}$'),
  resource_id      uuid not null,
  role             text not null default 'attachment'
                   check (role in ('attachment', 'photo', 'photo_day', 'photo_evening', 'photo_lights_off',
                                   'cover', 'logo', 'bill_scan', 'document', 'avatar')),
  object_key       text not null unique,          -- '<familyId>/<fileId>'
  size_bytes       bigint not null check (size_bytes between 1 and 104857600),
  content_type     text not null,                 -- C: tipo reale da lista consentita; A/B: application/octet-stream
  file_name        text check (char_length(file_name) <= 255),
  sha256           bytea check (octet_length(sha256) = 32),
  status           file_status not null default 'pending',
  enc_scope_id     uuid,
  enc_key_version  integer,
  enc_dek          bytea,
  enc_meta         bytea,                          -- DS-ENV con la DEK: {name, type, width, height}
  version          integer not null default 1,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth_users(id) on delete set null,
  deleted_at       timestamptz,
  unique (family_id, id),
  check ((visibility = 'personal') = (owner_account_id is not null)),
  check ((data_class = 'C') = (enc_dek is null)),
  check ((data_class = 'C') = (file_name is not null)),
  check (num_nulls(enc_scope_id, enc_key_version, enc_dek, enc_meta) in (0, 4)),
  foreign key (family_id, house_id) references houses(family_id, id) on delete cascade,
  foreign key (family_id, resident_id) references residents(family_id, id) on delete cascade,
  foreign key (family_id, enc_scope_id) references key_scopes(family_id, id),
  foreign key (enc_scope_id, enc_key_version) references scope_key_versions(scope_id, version)
);
create index files_resource_idx on files (family_id, resource_type, resource_id) where deleted_at is null;
create index files_pending_idx on files (created_at) where status = 'pending';
-- RLS T, P, H, R.
```

Flusso di caricamento: riga `pending` → URL prefirmato `PUT` con `Content-Length` e `Content-Type` vincolati → caricamento diretto nel bucket → conferma → verifica `HEAD` della dimensione → `stored`. Le righe `pending` più vecchie di 1 ora vengono eliminate con l'oggetto. I file sono immutabili: sostituire una foto crea un nuovo file.

### 6.6 `sync` — revisioni

```sql
create table revisions (
  id               uuid primary key default uuidv7(),
  family_id        uuid not null references families(id) on delete cascade,
  house_id         uuid,
  resident_id      uuid,
  visibility       visibility not null default 'family',
  owner_account_id uuid references auth_users(id) on delete cascade,
  resource_type    text not null,
  resource_id      uuid not null,
  version          integer not null,
  op               revision_op not null,
  actor_kind       actor_kind not null,
  actor_id         uuid,
  data             jsonb,               -- istantanea delle colonne C (senza colonne enc_*)
  enc_scope_id     uuid,
  enc_key_version  integer,
  enc_dek          bytea,
  enc_payload      bytea,
  created_at       timestamptz not null default now(),
  unique (resource_type, resource_id, version),
  check (num_nulls(enc_scope_id, enc_key_version, enc_dek, enc_payload) in (0, 4))
);
create index revisions_resource_idx on revisions (family_id, resource_type, resource_id, version desc);
-- RLS T, P, H, R; privilegi SELECT e INSERT.
```

- Ogni scrittura su una tabella marcata `rev` inserisce, **nella stessa transazione**, la revisione della nuova versione (helper `writeWithRevision` in `packages/db`).
- `delete` registra l'ultima istantanea; il record va nel cestino (`deleted_at`).
- Ripristino: il browser legge la revisione scelta (per A/B la decifra), scrive i valori come nuova versione con `op = 'restore'`; nessuna revisione viene modificata.
- Le revisioni A/B conservano la busta originale con la sua `enc_key_version`: dopo una rotazione restano leggibili da chi possiede ancora quella versione.

### 6.7 `audit` — registro attività ed eventi di sicurezza

```sql
create table audit_events (
  id            uuid not null default uuidv7(),
  occurred_at   timestamptz not null default now(),
  family_id     uuid,
  actor_kind    actor_kind not null,
  actor_id      uuid,
  action        text not null check (action ~ '^[a-z_]+(\.[a-z_]+){1,3}$'),
  resource_type text,
  resource_id   uuid,
  outcome       text not null check (outcome in ('success', 'denied', 'failure')),
  metadata      jsonb not null default '{}' check (octet_length(metadata::text) <= 4096),
  primary key (id, occurred_at)
) partition by range (occurred_at);
create index audit_events_family_idx on audit_events (family_id, occurred_at desc);
-- RLS: lettura T + Q(admin); inserimento con family_id null oppure = app.family_id(). Privilegi SELECT e INSERT.

create table security_events (
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
create index security_events_account_idx on security_events (account_id, occurred_at desc);
-- RLS: lettura account_id = app.account_id(); inserimento libero per domusafe_app. Privilegi SELECT e INSERT.
```

`metadata` accetta solo chiavi dichiarate nel catalogo delle azioni (`packages/contracts`): id, versioni, conteggi, nomi di ruolo, codici di errore. Mai contenuti, nomi di campi A/B, importi, testi liberi. Gli indirizzi IP esistono solo in `security_events`.

### 6.8 `webhooks`

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `webhook_endpoints` | C + S | `⟨base⟩ ⟨tenant⟩`, `url` (https; http solo self-host con opzione esplicita), `description`, `events text[]`, `secret_current_sealed`, `secret_previous_sealed`, `secret_rotated_at`, `active`, `consecutive_failures smallint`, `disabled_at` | disattivazione automatica dopo 20 errori consecutivi | T, Q(admin) |
| `webhook_deliveries` | C | `id`, `family_id`, `endpoint_id`, `event_id uuid`, `event_type`, `payload jsonb` (≤64 KiB, solo dati C), `attempt smallint`, `status` (`pending`, `succeeded`, `failed`), `next_attempt_at`, `response_status smallint`, `created_at`, `delivered_at` | indice `(status, next_attempt_at) where status = 'pending'`; unico `(endpoint_id, event_id)` | T, Q(admin) |

I webhook in entrata di Home Assistant usano i segreti di `ha_connections` (§6.17); quelli del provider di pagamento usano la firma del provider e `billing_events`.

### 6.9 `notifications`, `deadlines`, `dashboard`, `onboarding`, `preferences`

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `reminders` | C | `⟨base⟩ ⟨tenant⟩ ⟨visibility⟩ ⟨house?⟩ ⟨resident?⟩ ⟨trash⟩`, `source_module`, `source_id`, `source_key`, `title` (1–140), `due_date date`, `due_time time`, `rrule` (RFC 5545, validata), `lead_days smallint[] default '{7,1}'`, `priority smallint` (1–3), `status` (`open`, `done`, `dismissed`), `completed_at`, `completed_by` | unico `(family_id, source_module, source_id, source_key) where source_id is not null`; indice `(family_id, status, due_date) where deleted_at is null` | T, P, H, R · `rev` |
| `notifications` | C | `id`, `account_id`, `family_id`, `category` (`deadline`, `vault_reminder`, `emergency_scan`, `sos`, `chore`, `approval`, `security`, `system`), `title` (≤140), `body` (≤1000), `link` (percorso interno), `resource_type`, `resource_id`, `created_at`, `read_at`, `push_sent_at` | indice `(account_id, created_at desc) where read_at is null` | A |
| `push_subscriptions` | C | `id`, `account_id`, `device_id`, `endpoint text unique`, `p256dh bytea`, `auth bytea`, `created_at`, `last_success_at`, `failure_count`, `disabled_at` | disattivazione alla risposta 404/410 del servizio push | A |
| `notification_preferences` | C | `account_id`, `family_id`, `category`, `in_app`, `push`, `email`, `quiet_start time`, `quiet_end time` | pk `(account_id, family_id, category)` | A |
| `dashboard_dismissals` | C | `account_id`, `family_id`, `suggestion_key`, `dismissed_until` | pk `(account_id, family_id, suggestion_key)` | A |
| `news_items` | C | `id`, `published_at`, `locale`, `title`, `body`, `link` | indice `(locale, published_at desc)` | G |
| `news_reads` | C | `account_id` pk, `last_read_at` | — | A |
| `onboarding_progress` | C | `account_id`, `family_id`, `wizard_key`, `current_step`, `completed_at`, `skipped_at` | pk `(account_id, family_id, wizard_key)` | A |

I raggruppamenti "Scadute / Questa settimana / Questo mese" sono calcolati in query su `reminders.due_date` rispetto alla data odierna nel fuso della famiglia. Le preferenze di tema e lingua stanno in `account_profiles`; il colore dei membri in `residents.color`.

### 6.10 `kiosk`

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `kiosk_devices` | C | `⟨base-client⟩ ⟨tenant⟩ ⟨house⟩`, `name`, `profile` (`standard`, `elderly`), `resident_id` (profilo anziani), `credential_hash bytea(32) unique`, `public_key bytea(65)`, `layout jsonb` (galleria widget validata da Zod, ≤16 KiB), `idle_return_seconds smallint default 120`, `last_seen_at`, `revoked_at` | `check ((profile = 'elderly') = (resident_id is not null))` | T, H, K(`id = app.kiosk_id()`), Q(admin) in scrittura |

Il kiosk riceve per concessione solo gli ambiti scelti dall'Amministratore (`house_guest` della sua casa e, nel profilo anziani, `resident` del residente assistito). La credenziale (256 bit) si conserva come SHA-256.

### 6.11 `assistant`

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `assistant_settings` | C + S | `family_id` pk, `enabled`, `provider_kind` (`openai_compatible`, `openai`, `anthropic`, `google`), `base_url`, `model`, `api_key_sealed`, `server_side_allowed`, `version`, `updated_by` | — | T, Q(admin) |
| `assistant_proposals` | C | `⟨base⟩ ⟨tenant⟩ ⟨house?⟩`, `origin` (`in_app`, `mcp`), `action` (es. `maintenance.create`), `target_resource_type`, `target_resource_id`, `payload jsonb` (≤32 KiB, solo C), `summary` (≤500), `status` (`pending`, `approved`, `rejected`, `applied`, `failed`, `expired`), `decided_by`, `decided_at`, `applied_at`, `error_code`, `expires_at` (7 giorni) | indice `(family_id, status, created_at desc)` | T, H, Q(admin, parent) per la decisione |

I dati A/B arrivano a un modello solo dal browser, con consenso esplicito e mai salvati sul server.

### 6.12 `vault`, `succession`, `personal`, `taxes` — dati A

```sql
create type vault_section as enum (
  'family_accounts', 'mortgages', 'credit_protection', 'insurance_policies', 'bills_and_cancellations',
  'social_security', 'pension_fund', 'severance_pay', 'employment_documents', 'digital_legacy',
  'password_kit', 'personal_accounts', 'personal_assets', 'tax_documents', 'succession_task'
);
create table vault_items (
  -- ⟨base-client⟩ ⟨tenant⟩ ⟨visibility⟩ ⟨resident?⟩ ⟨trash⟩ ⟨busta⟩ (ambiti ammessi: vault_family, vault_personal)
  section vault_section not null,
  check (section not in ('personal_accounts', 'personal_assets', 'tax_documents') or visibility = 'personal'),
  check (section not in ('family_accounts', 'succession_task') or visibility = 'family')
);
create index vault_items_section_idx on vault_items (family_id, section) where deleted_at is null;
-- RLS T, P, R, Q(admin, parent, child, caregiver) · rev · cf (dentro la busta).
```

| Sezione (`section`) | Etichetta in interfaccia | Visibilità | Piano |
| :--- | :--- | :--- | :--- |
| `family_accounts` | Conti di famiglia | famiglia | Advanced |
| `mortgages` | Mutui | famiglia o personale | Advanced (famiglia), Premium (personale) |
| `credit_protection` | Coperture del credito | famiglia o personale | come sopra |
| `insurance_policies` | Polizze e beneficiari | famiglia o personale | come sopra |
| `bills_and_cancellations` | Dove sono bollette e disdette | famiglia o personale | come sopra |
| `social_security` | Previdenza | famiglia o personale | come sopra |
| `pension_fund` | Fondo pensione | famiglia o personale | come sopra |
| `severance_pay` | Trattamento di fine rapporto | famiglia o personale | come sopra |
| `employment_documents` | Documenti di lavoro | famiglia o personale | come sopra |
| `digital_legacy` | Eredità digitale Apple e Google | famiglia o personale | come sopra |
| `password_kit` | Kit password | famiglia o personale | come sopra |
| `personal_accounts` | Conti personali | personale | Premium |
| `personal_assets` | Patrimonio personale | personale | Premium |
| `tax_documents` | Documenti fiscali | personale | Premium |
| `succession_task` | Checklist di successione | famiglia | Premium |

Il contenuto della busta segue uno schema Zod per sezione (`packages/contracts/src/vault/*.ts`, versione nel campo `schema`). La percentuale di completamento della checklist di successione e il Kit Eredità PDF sono calcolati nel browser.

Altre tabelle di `personal` e `taxes`:

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `phone_lines` | C + busta B | `⟨base-client⟩ ⟨tenant⟩ ⟨visibility⟩ ⟨resident?⟩ ⟨trash⟩ ⟨busta?⟩ ⟨custom⟩`, `operator`, `phone_number` (E.164), `plan_name`, `monthly_cost_minor`, `currency`, `renewal_date`, `contract_end_date` | indice `(family_id, renewal_date)` | T, P, R · `rev` · `ric` |
| `vehicles` | C | `⟨base⟩ ⟨tenant⟩ ⟨visibility⟩ ⟨resident?⟩ ⟨trash⟩ ⟨custom⟩`, `plate` (unico per famiglia), `make`, `model`, `year smallint`, `fuel` (`petrol`, `diesel`, `lpg`, `methane`, `hybrid`, `electric`, `other`), `insurance_company`, `insurance_renewal_date`, `road_tax_due_date`, `inspection_due_date`, `service_due_date`, `odometer_km integer`, `notes` | unico `(family_id, plate) where deleted_at is null` | T, P, R · `rev` · `ric` |
| `tax_checklist_items` | C | `⟨base⟩ ⟨tenant⟩ ⟨visibility⟩ ⟨resident?⟩`, `tax_year smallint`, `item_key` (`income_certificate`, `precompiled_return`, `form_730`, `isee`, `imu_first_installment`, `imu_second_installment`, `waste_tax`, `irpef_first_advance`, `irpef_second_advance`, `custom`), `label` (obbligatoria se `custom`), `due_date`, `status` (`todo`, `in_progress`, `done`, `not_applicable`), `completed_at` | unico `nulls not distinct (family_id, resident_id, owner_account_id, tax_year, item_key, label)` | T, P, R · `rev` |

Le etichette estese della checklist fiscale ("Certificazione Unica", "Dichiarazione precompilata", "Modello 730", "Indicatore della situazione economica equivalente", "Imposta municipale propria — prima rata", "Tassa sui rifiuti", "Acconto dell'imposta sul reddito — primo") stanno nei messaggi i18n; le scadenze predefinite per anno sono calcolate da `packages/plans/src/tax-calendar.ts` e modificabili per voce.

### 6.13 `house` e `contacts`

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `rooms` | C | `⟨base⟩ ⟨tenant⟩ ⟨house⟩ ⟨trash⟩ ⟨custom⟩`, `name`, `kind` (`kitchen`, `living`, `bedroom`, `bathroom`, `office`, `laundry`, `garage`, `cellar`, `attic`, `garden`, `balcony`, `other`), `floor smallint`, `sort_order`, `notes` | indice `(family_id, house_id, sort_order) where deleted_at is null` | T, H · `rev` · `ric` |
| `house_guide_entries` | C + busta B | `⟨base-client⟩ ⟨tenant⟩ ⟨house⟩ ⟨trash⟩ ⟨busta?⟩ ⟨custom⟩`, `room_id`, `audience` (`guest`, `technical`), `topic` (`wifi`, `intercom`, `gate`, `parcels`, `waste`, `pets`, `plants`, `heating`, `appliances`, `rules`, `check_in`, `check_out`, `other`), `title`, `body` (≤8000), `sort_order` | busta con ambito `house_guest` se `audience = 'guest'`, altrimenti `house_technical` (trigger); indice `(family_id, house_id, audience, sort_order)` | T, H, O(`audience = 'guest'`) · `rev` · `ric` |
| `house_shutoffs` | C | `⟨base⟩ ⟨tenant⟩ ⟨house⟩ ⟨trash⟩ ⟨custom⟩`, `room_id`, `kind` (`water`, `gas`, `electricity`, `boiler`, `other`), `location` (≤300), `instructions` (≤2000), `visible_to_guests boolean default true` | foto in `files` con `role = 'photo'` | T, H, O(`visible_to_guests`) · `rev` · `ric` |
| `waste_collections` | C | `⟨base⟩ ⟨tenant⟩ ⟨house⟩`, `fraction` (`organic`, `paper`, `plastic`, `glass`, `metal`, `residual`, `bulky`, `green`, `other`), `rrule`, `collection_time`, `instructions` | — | T, H (visibile agli Ospiti) · `rev` |
| `contacts` | C | `⟨base⟩ ⟨tenant⟩ ⟨visibility⟩ ⟨house?⟩ ⟨trash⟩ ⟨custom⟩`, `kind` (`craftsman`, `supplier`, `doctor`, `veterinarian`, `neighbor`, `emergency_service`, `other`), `trade` (es. "Idraulico"), `display_name`, `company`, `phone` (E.164), `email`, `website`, `address`, `notes` (≤2000), `rating smallint` (1–5), `visible_to_guests boolean default false` | indice `(family_id, kind) where deleted_at is null` | T, P, H, O(`visible_to_guests`) · `rev` · `ric` |

Le foto della stanza "giorno / sera / luci spente" sono file con `resource_type = 'rooms'` e ruolo `photo_day`, `photo_evening`, `photo_lights_off`. I dispositivi domotici si collegano alle stanze (`ha_devices.room_id`).

### 6.14 `utilities`

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `utilities` | C + busta B | `⟨base-client⟩ ⟨tenant⟩ ⟨house⟩ ⟨trash⟩ ⟨busta?⟩ ⟨custom⟩`, `kind` (`electricity`, `gas`, `water`, `internet`, `waste_tax`, `heating`, `other`), `provider_name`, `customer_code`, `contract_code`, `supply_point_code`, `tariff_name`, `start_date`, `renewal_date`, `billing_frequency` (`monthly`, `bimonthly`, `quarterly`, `semiannual`, `annual`), `estimated_cost_minor`, `currency`, `autopay boolean`, `template_id`, `notes` | busta con ambito `family`; indice `(family_id, house_id, kind) where deleted_at is null` | T, H, Q(admin, parent) · `rev` · `ric` |
| `subscriptions_services` | C + busta B | `⟨base-client⟩ ⟨tenant⟩ ⟨visibility⟩ ⟨house?⟩ ⟨resident?⟩ ⟨trash⟩ ⟨busta?⟩ ⟨custom⟩`, `kind` (`home_insurance`, `car_insurance`, `life_insurance`, `health_insurance`, `streaming`, `software`, `gym`, `transport`, `telephony`, `association`, `other`), `name`, `provider_name`, `cost_minor`, `currency`, `billing_frequency`, `renewal_date`, `cancellation_notice_days smallint`, `cancellation_url`, `auto_renew boolean`, `notes` | indice `(family_id, renewal_date) where deleted_at is null` | T, P, H, R, Q(admin, parent) sulle righe `family` · `rev` · `ric` |
| `utility_bills` | C | `⟨base⟩ ⟨tenant⟩ ⟨house⟩`, `utility_id` (FK composta), `period_start`, `period_end`, `issue_date`, `due_date`, `amount_minor`, `currency`, `consumption numeric(14,3)`, `consumption_unit` (`kwh`, `smc`, `m3`, `gb`), `paid_on date`, `file_id`, `extracted jsonb` (valori riconosciuti nel browser) | indice `(family_id, utility_id, period_end desc)` | T, H, Q(admin, parent) · `rev` |
| `utility_templates` | C | `id`, `family_id` (null = modello di sistema), `country char(2)`, `kind`, `provider_name`, `field_hints jsonb`, `recognition_patterns jsonb` (espressioni regolari per il riconoscimento del testo), `version`, `active` | unico `nulls not distinct (family_id, country, kind, provider_name)` | `family_id is null` in lettura per tutti; righe di famiglia con T |

La tabella è chiamata `subscriptions_services` per non confondersi con `subscriptions` di `billing`.

### 6.15 `maintenance` e `inventory`

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `maintenance_tasks` | C | `⟨base⟩ ⟨tenant⟩ ⟨house⟩ ⟨trash⟩ ⟨custom⟩`, `room_id`, `inventory_item_id`, `contact_id`, `category` (`heating`, `cooling`, `plumbing`, `electrical`, `appliances`, `structure`, `roof`, `garden`, `safety`, `cleaning`, `other`), `priority` (`low`, `medium`, `high`, `urgent`), `title`, `description`, `rrule`, `next_due_date`, `last_done_on`, `estimated_cost_minor`, `currency`, `active` | indice `(family_id, house_id, next_due_date) where active and deleted_at is null` | T, H · `rev` · `ric` |
| `maintenance_logs` | C | `⟨base⟩ ⟨tenant⟩ ⟨house⟩`, `task_id`, `done_on`, `done_by`, `contact_id`, `cost_minor`, `currency`, `notes`, `fin_transaction_id` | indice `(family_id, task_id, done_on desc)` | T, H · `rev` |
| `storage_units` | C | `⟨base⟩ ⟨tenant⟩ ⟨house⟩ ⟨trash⟩`, `room_id` (obbligatorio), `parent_id` (FK composta su sé stessa), `kind` (`furniture`, `wardrobe`, `shelf`, `drawer`, `box`, `container`, `other`), `name`, `notes`, `sort_order` | profondità massima 4 livelli (trigger); indice `(family_id, room_id, parent_id)` | T, H · `rev` · `ric` |
| `inventory_items` | C | `⟨base⟩ ⟨tenant⟩ ⟨house⟩ ⟨trash⟩ ⟨custom⟩`, `room_id`, `storage_unit_id`, `name`, `category`, `quantity numeric(12,3) default 1`, `unit`, `brand`, `model`, `serial_number`, `barcode`, `purchase_date`, `purchase_price_minor`, `currency`, `warranty_until`, `tags text[]`, `notes` | indici `(family_id, house_id, storage_unit_id)`, `(family_id, barcode)`, GIN `(tags)` | T, H · `rev` · `ric` |

La ricorrenza di una manutenzione aggiorna `next_due_date` e il promemoria collegato (`reminders.source_module = 'maintenance'`) nella stessa transazione.

### 6.16 `search`

```sql
create table search_index (
  resource_type    text not null,
  resource_id      uuid not null,
  family_id        uuid not null references families(id) on delete cascade,
  house_id         uuid,
  resident_id      uuid,
  visibility       visibility not null default 'family',
  owner_account_id uuid,
  audience_guest   boolean not null default false,
  title            text not null check (char_length(title) <= 300),
  body             text not null default '' check (char_length(body) <= 20000),
  tags             text[] not null default '{}',
  updated_at       timestamptz not null default now(),
  tsv tsvector generated always as (
        setweight(to_tsvector('domusafe_it', title), 'A')
     || setweight(to_tsvector('domusafe_it', body), 'B')) stored,
  primary key (resource_type, resource_id)
);
create index search_index_tsv_idx   on search_index using gin (tsv);
create index search_index_trgm_idx  on search_index using gin (app.f_unaccent(title) gin_trgm_ops);
create index search_index_tags_idx  on search_index using gin (tags);
create index search_index_family_idx on search_index (family_id, resource_type);
-- RLS T, P, H, R, O(audience_guest).

create table saved_filters (
  id              uuid primary key check (uuid_extract_version(id) = 7),
  family_id       uuid not null references families(id) on delete cascade,
  account_id      uuid not null references auth_users(id) on delete cascade,
  pinned_position smallint check (pinned_position between 1 and 5),
  enc_scope_id    uuid not null,     -- ambito 'personal' dell'account
  enc_key_version integer not null,
  enc_dek         bytea not null,
  enc_payload     bytea not null,    -- {nome, condizioni AND/OR, tipi di risorsa, case}
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index saved_filters_pin_idx on saved_filters (account_id, family_id, pinned_position)
  where pinned_position is not null;
-- RLS T + restrittiva account_id = app.account_id().
```

- Ogni modulo con `ric` aggiorna la propria riga di `search_index` nella stessa transazione della scrittura (interfaccia del servizio `search`), con il testo C del record.
- I filtri AND/OR sono compilati in una condizione SQL parametrica: termini su `tsv` con `websearch_to_tsquery('domusafe_it', …)`, somiglianza sui trigrammi per errori di battitura, `tags @>` (AND) e `tags &&` (OR), tipo di risorsa e casa.
- Il vincolo `pinned_position between 1 and 5` con l'indice unico realizza "massimo 5 filtri nella barra laterale". Il filtro salvato è cifrato con la chiave personale; il browser lo decifra e invia la query.

### 6.17 `home-automation`

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `ha_connections` | C + S | `⟨base⟩ ⟨tenant⟩ ⟨house⟩`, `kind` (`home_assistant_webhook`, `home_assistant_api`, `mqtt`), `name`, `base_url`, `mqtt_url`, `mqtt_topic_prefix`, `credentials_sealed`, `inbound_secret_current_sealed`, `inbound_secret_previous_sealed`, `secret_rotated_at`, `status` (`active`, `error`, `disabled`), `last_event_at`, `last_error_code` | — | T, H, Q(admin) in scrittura |
| `ha_devices` | C | `⟨base⟩ ⟨tenant⟩ ⟨house⟩`, `connection_id`, `room_id`, `external_id` (es. `sensor.cucina_temperatura`), `kind` (`temperature`, `humidity`, `power`, `energy`, `solar_production`, `battery`, `ev_charger`, `water_leak`, `smoke`, `door_window`, `motion`, `alarm_panel`, `lock`, `other`), `name`, `unit`, `last_value double precision`, `last_state text`, `last_seen_at` | unico `(connection_id, external_id)` | T, H |
| `ha_measurements` | C | `family_id`, `device_id`, `measured_at`, `value double precision` | pk `(device_id, measured_at)`; partizioni mensili | T |
| `ha_measurements_hourly` | C | `family_id`, `device_id`, `hour`, `min`, `max`, `avg`, `sum`, `count` | pk `(device_id, hour)` | T |
| `ha_events` | C | `id`, `family_id`, `house_id`, `device_id`, `occurred_at`, `kind` (`alarm_triggered`, `alarm_cleared`, `leak_detected`, `smoke_detected`, `lock_locked`, `lock_unlocked`, `door_opened`, `battery_low`, `device_offline`), `state jsonb` (≤2 KiB), `notified_at` | indice `(family_id, occurred_at desc)` | T, H |

Il principal `integration` può solo inserire in `ha_measurements` ed `ha_events` e aggiornare `ha_devices.last_*` della propria casa (privilegi applicativi del modulo; RLS H con la casa della connessione). Le serrature sono in sola lettura: nessuna colonna o tabella rappresenta comandi.

### 6.18 `residents`, `health`, `pets`, `emergency`, `care`

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `residents` | C | `⟨base⟩ ⟨tenant⟩ ⟨trash⟩ ⟨custom⟩`, `display_name` (1–80), `kind` (`adult`, `child`, `elderly`), `account_id`, `color char(7)` (`#rrggbb`), `avatar_file_id`, `sort_order`, `plan_locked_at` | unico `(family_id, account_id) where account_id is not null` | T, R(`id`) · `rev` · `ric` |
| `resident_houses` | C | `family_id`, `resident_id`, `house_id` | pk `(resident_id, house_id)` | T, H, R |
| `resident_cards` | B | `⟨base-client⟩ ⟨tenant⟩ ⟨resident⟩ ⟨busta⟩`, `card_kind` (`about_me`, `health_profile`) | unico `(resident_id, card_kind)`; ambito `resident` | T, R · `rev` |
| `medications` | B | `⟨base-client⟩ ⟨tenant⟩ ⟨resident⟩ ⟨trash⟩ ⟨busta⟩`, `active`, `starts_on`, `ends_on` | ambito `resident` | T, R · `rev` |
| `medication_schedules` | C | `⟨base⟩ ⟨tenant⟩ ⟨resident⟩`, `medication_id`, `times time[]`, `rrule`, `neutral_label` (default "Promemoria farmaco"), `active` | — | T, R, K(`resident_id` del kiosk) · `rev` |
| `medication_intakes` | C | `id`, `family_id`, `resident_id`, `medication_id`, `schedule_id`, `scheduled_for`, `status` (`taken`, `skipped`, `missed`), `confirmed_at`, `confirmed_by_kind`, `confirmed_by_id` | unico `(schedule_id, scheduled_for)`; indice `(family_id, resident_id, scheduled_for desc)` | T, R, K |
| `vital_entries` | B | `⟨base-client⟩ ⟨tenant⟩ ⟨resident⟩ ⟨busta⟩`, `measured_at` | indice `(family_id, resident_id, measured_at desc)` | T, R · `rev` |
| `emergency_contacts` | B | `⟨base-client⟩ ⟨tenant⟩ ⟨resident?⟩ ⟨busta⟩`, `sort_order` | ambito `resident` se `resident_id`, altrimenti `family` | T, R · `rev` |
| `pets` | C | `⟨base⟩ ⟨tenant⟩ ⟨trash⟩ ⟨custom⟩`, `name`, `species` (`dog`, `cat`, `bird`, `fish`, `rabbit`, `rodent`, `reptile`, `horse`, `other`), `breed`, `sex`, `birth_date`, `microchip_code`, `color`, `vet_contact_id`, `notes`, `plan_locked_at` | — | T · `rev` · `ric` |
| `pet_houses` | C | `family_id`, `pet_id`, `house_id` | pk `(pet_id, house_id)` | T, H |
| `pet_health_records` | B | `⟨base-client⟩ ⟨tenant⟩ ⟨busta⟩`, `pet_id`, `event_date` | ambito `family` | T · `rev` |
| `emergency_settings` | C + busta B | `family_id` pk, `sos_enabled`, `sos_channels text[]` (`sms`, `whatsapp`), `last_test_at`, `version`, colonne busta opzionali | ambito `family` | T, Q(admin, parent) in scrittura |
| `sos_events` | C | `id`, `family_id`, `resident_id`, `triggered_by_kind`, `triggered_by_id`, `kind` (`test`, `real`), `channel`, `created_at` | indice `(family_id, created_at desc)` | T, K |
| `handovers` | B | `⟨base-client⟩ ⟨tenant⟩ ⟨house?⟩ ⟨resident?⟩ ⟨busta⟩`, `audience` (`family`, `guest`), `posted_at`, `acknowledged_at`, `acknowledged_by` | ambito `house_guest` se `audience = 'guest'`, altrimenti `resident` o `house_technical` | T, H, R, O(`audience = 'guest'`) · `rev` |
| `relationship_entries` | C + busta B | `⟨base-client⟩ ⟨tenant⟩ ⟨visibility⟩ ⟨trash⟩ ⟨busta?⟩`, `display_name`, `relation`, `last_contact_on`, `contact_interval_days smallint` | default `visibility = 'personal'` | T, P · `rev` |

La rubrica relazioni è "etica" per costruzione: nessun punteggio, nessuna posizione, nessun dato dedotto; solo ricorrenze, ultimo contatto e note scritte dall'utente.

### 6.19 `calendar` e `rewards`

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `calendar_events` | C | `⟨base⟩ ⟨tenant⟩ ⟨visibility⟩ ⟨house?⟩ ⟨trash⟩`, `title`, `description`, `location`, `starts_at`, `ends_at`, `all_day`, `timezone`, `rrule`, `exdates date[]`, `category` (`appointment`, `school`, `work`, `health`, `birthday`, `holiday`, `other`), `source` (`internal`, `ics_import`), `ics_uid`, `ics_source_label` | `check (ends_at >= starts_at)`; indice `(family_id, starts_at)`; unico `(family_id, ics_uid) where ics_uid is not null` | T, P, H · `rev` · `ric` |
| `calendar_event_residents` | C | `family_id`, `event_id`, `resident_id` | pk `(event_id, resident_id)` | T, R |
| `ics_feeds` | C | `⟨base⟩ ⟨tenant⟩`, `account_id`, `token_hash bytea(32) unique`, `scope` (`family`, `resident`, `personal`), `resident_id`, `last_fetched_at`, `revoked_at` | — | T + `account_id = app.account_id()` |
| `timetable_slots` | C | `⟨base⟩ ⟨tenant⟩ ⟨resident⟩`, `weekday smallint` (1–7), `starts_at time`, `ends_at time`, `title`, `location`, `valid_from`, `valid_to` | indice `(family_id, resident_id, weekday)` | T, R · `rev` |
| `chores` | C | `⟨base⟩ ⟨tenant⟩ ⟨house?⟩ ⟨trash⟩`, `title`, `description`, `rrule`, `points smallint`, `assignment` (`fixed`, `rotation`), `assigned_resident_ids uuid[]`, `next_due_date`, `requires_approval`, `active` | indice `(family_id, next_due_date) where active` | T, H · `rev` · `ric` |
| `chore_completions` | C | `id`, `family_id`, `chore_id`, `resident_id`, `due_date`, `completed_at`, `status` (`pending_approval`, `approved`, `rejected`), `decided_by`, `decided_at`, `points_awarded` | unico `(chore_id, due_date, resident_id)` | T, R |
| `point_entries` | C | `id`, `family_id`, `resident_id`, `delta integer` (≠ 0), `reason`, `source` (`chore`, `reward`, `manual`, `streak_bonus`), `source_id`, `created_by`, `approved_by`, `created_at` | indice `(family_id, resident_id, created_at)`; append-only | T, R |
| `rewards` | C | `⟨base⟩ ⟨tenant⟩`, `title`, `description`, `cost_points integer` (> 0), `stock integer`, `active` | — | T |
| `reward_redemptions` | C | `⟨base⟩ ⟨tenant⟩ ⟨resident⟩`, `reward_id`, `status` (`requested`, `approved`, `rejected`, `fulfilled`), `decided_by`, `decided_at`, `point_entry_id` | — | T, R |
| `resident_streaks` | C | `family_id`, `resident_id` pk, `current_days`, `best_days`, `last_completed_on` | — | T, R |

Il saldo punti è `sum(delta)`; una richiesta di ricompensa approvata crea una voce negativa nella stessa transazione, con controllo del saldo sotto `SELECT … FOR UPDATE` sul residente. L'"economia dei ragazzi" usa i conti `piggy_bank` della contabilità (§6.21) intestati al residente.

### 6.20 `recipes`, `pantry`, `shopping`

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `recipes` | C | `⟨base⟩ ⟨tenant⟩ ⟨trash⟩ ⟨custom⟩`, `title`, `description`, `servings smallint`, `prep_minutes`, `cook_minutes`, `ingredients jsonb` (array `{name, quantity, unit, note}`), `steps jsonb` (array di testi), `tags text[]`, `source_url`, `source_name`, `image_file_id` | — | T · `rev` · `ric` |
| `recipe_imports` | C | `id`, `family_id`, `url`, `status` (`queued`, `running`, `succeeded`, `failed`), `error_code`, `recipe_id`, `created_by`, `created_at`, `finished_at` | conservazione 30 giorni | T |
| `meal_plan_entries` | C | `⟨base⟩ ⟨tenant⟩ ⟨house?⟩`, `plan_date`, `slot` (`breakfast`, `lunch`, `dinner`, `snack`), `recipe_id`, `title`, `servings`, `notes` | `check (recipe_id is not null or title is not null)`; indice `(family_id, plan_date)` | T, H |
| `pantry_items` | C | `⟨base⟩ ⟨tenant⟩ ⟨house⟩ ⟨trash⟩ ⟨custom⟩`, `name`, `barcode`, `quantity numeric(12,3)`, `unit`, `storage_unit_id`, `expiry_date`, `min_quantity numeric(12,3)` | indici `(family_id, house_id, expiry_date)`, `(family_id, barcode)` | T, H · `rev` · `ric` |
| `barcode_products` | C | `id`, `family_id`, `barcode`, `name`, `brand`, `default_unit` | unico `(family_id, barcode)` | T |
| `stores` | C | `⟨base⟩ ⟨tenant⟩`, `name`, `aisle_order text[]` | — | T |
| `shopping_lists` | C | `⟨base⟩ ⟨tenant⟩ ⟨house?⟩`, `store_id`, `name`, `archived_at` | — | T, H |
| `shopping_items` | C | `⟨base⟩ ⟨tenant⟩`, `list_id`, `name`, `quantity numeric(12,3)`, `unit`, `aisle`, `position integer`, `checked_at`, `checked_by`, `pantry_item_id` | indice `(family_id, list_id, checked_at nulls first, position)` | T |

La lista di spesa è il caso tipico di scrittura concorrente: gli elementi sono righe indipendenti con la propria `version`, quindi due persone che spuntano voci diverse non generano conflitti.

### 6.21 `finance` — partita doppia multivaluta

```sql
create table currencies (code char(3) primary key, minor_unit smallint not null check (minor_unit between 0 and 4),
                         name_it text not null, name_en text not null);                       -- G
create table fx_rates (base char(3) not null default 'EUR' references currencies(code),
                       quote char(3) not null references currencies(code),
                       rate_date date not null, rate numeric(20,10) not null check (rate > 0),
                       source text not null default 'ecb', primary key (base, quote, rate_date)); -- G

create type fin_account_type as enum ('asset', 'liability', 'equity', 'income', 'expense');
create table fin_accounts (
  -- ⟨base-client⟩ ⟨tenant⟩ ⟨visibility⟩ ⟨resident?⟩ ⟨busta?⟩ (ambiti family, personal)
  type        fin_account_type not null,
  subtype     text not null check (subtype in ('cash', 'bank', 'card', 'savings', 'piggy_bank', 'loan',
                'mortgage', 'investment', 'currency_exchange', 'opening_balance', 'category')),
  name        text not null check (char_length(name) between 1 and 120),
  currency    char(3) not null references currencies(code),
  parent_id   uuid,
  archived_at timestamptz,
  unique nulls not distinct (family_id, parent_id, name)
);

create table fin_transactions (
  -- ⟨base⟩ ⟨tenant⟩ ⟨visibility⟩ ⟨trash⟩
  booked_on    date not null,
  description  text not null check (char_length(description) between 1 and 200),
  payee        text check (char_length(payee) <= 120),
  status       text not null default 'cleared' check (status in ('pending', 'cleared', 'reconciled')),
  recurring_id uuid,
  tags         text[] not null default '{}',
  notes        text check (char_length(notes) <= 2000)
);
create index fin_transactions_date_idx on fin_transactions (family_id, booked_on desc) where deleted_at is null;

create table fin_postings (
  id                uuid primary key default uuidv7(),
  family_id         uuid not null references families(id) on delete cascade,
  transaction_id    uuid not null,
  account_id        uuid not null,
  amount_minor      bigint not null check (amount_minor <> 0),
  currency          char(3) not null references currencies(code),
  fx_rate           numeric(20,10) not null default 1 check (fx_rate > 0),
  base_amount_minor bigint not null,
  memo              text check (char_length(memo) <= 200),
  foreign key (family_id, transaction_id) references fin_transactions(family_id, id) on delete cascade,
  foreign key (family_id, account_id) references fin_accounts(family_id, id)
);
create index fin_postings_account_idx on fin_postings (family_id, account_id, transaction_id);
create index fin_postings_tx_idx on fin_postings (transaction_id);

create constraint trigger fin_postings_balanced
  after insert or update or delete on fin_postings
  deferrable initially deferred
  for each row execute function app.check_transaction_balanced();
```

Regole:

1. **Somma zero per valuta.** `app.check_transaction_balanced()` verifica, a fine transazione SQL, che ogni movimento abbia almeno 2 righe e che per ogni `currency` la somma di `amount_minor` sia 0. Un cambio valuta usa due conti `currency_exchange` (uno per valuta), così ogni valuta resta bilanciata.
2. **Valuta del conto.** Un trigger impone `fin_postings.currency = fin_accounts.currency`.
3. **Valuta base.** `base_amount_minor = round_half_away_from_zero(amount_minor × fx_rate × 10^(minor_base − minor_currency))`, con `fx_rate` del giorno `booked_on` (o dell'ultimo giorno lavorativo precedente) da `fx_rates`. L'arrotondamento simmetrico garantisce che anche le somme in valuta base siano zero.
4. **Tassi BCE.** Il job `fx-rates` del worker scarica ogni giorno lavorativo alle 16:30 (ora di Francoforte) il file dei tassi di riferimento della Banca Centrale Europea e inserisce le righe mancanti; i tassi incrociati si ricavano passando per l'euro.
5. **Report** (saldi, entrate e uscite per categoria, andamento) sono query aggregate su `fin_postings` con l'indice per conto; nessuna tabella derivata.

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `fin_budgets` | C | `⟨base⟩ ⟨tenant⟩`, `account_id` (categoria), `period` (`monthly`, `yearly`), `starts_on`, `amount_minor`, `currency` (base), `rollover` | unico `(family_id, account_id, period, starts_on)` | T, Q(admin, parent) in scrittura; lettura anche `child` |
| `fin_savings_goals` | C | `⟨base⟩ ⟨tenant⟩ ⟨resident?⟩`, `account_id` (`savings` o `piggy_bank`), `name`, `target_minor`, `target_date` | — | T, R; lettura anche `child` sul proprio residente |
| `fin_recurring` | C | `⟨base⟩ ⟨tenant⟩`, `description`, `rrule`, `next_run_on`, `end_on`, `template jsonb` (righe `{accountId, amountMinor, currency}` bilanciate, validate da Zod), `auto_post`, `active` | indice `(next_run_on) where active` (scansione con `app.due_work`) | T, Q(admin, parent) |
| `fin_split_shares` | C | `id`, `family_id`, `transaction_id`, `resident_id`, `share_minor`, `currency`, `settled_transaction_id` | `check (share_minor > 0)`; la somma delle quote è uguale all'importo della spesa (trigger differito) | T, Q(admin, parent) |

Per `fin_accounts`, `fin_transactions` e `fin_postings` vale Q(admin, parent), con eccezione in lettura per `child` limitata ai conti `piggy_bank` del proprio residente. Tutte le tabelle di finanza sono `rev` tranne `fin_postings`, che entra nella revisione del movimento.

### 6.22 `qr` e `branding`

```sql
create table emergency_qr_codes (
  id               uuid primary key check (uuid_extract_version(id) = 7),  -- generato dal browser
  family_id        uuid not null references families(id) on delete cascade,
  resident_id      uuid,                         -- null = istantanea di famiglia
  label            text not null check (char_length(label) between 1 and 80),
  token_hash       bytea not null unique check (octet_length(token_hash) = 32),
  snapshot         bytea,                        -- DS-ENV con K; null dopo la revoca
  snapshot_version integer not null default 1,
  key_wrap         bytea,                        -- DS-ENV di K con la chiave d'ambito family
  enc_scope_id     uuid not null,
  enc_key_version  integer not null,
  notify_on_scan   boolean not null default true,
  last_scanned_at  timestamptz,
  scan_count       integer not null default 0,
  revoked_at       timestamptz,
  version          integer not null default 1,
  created_by       uuid references auth_users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (family_id, id),
  check ((revoked_at is null) = (snapshot is not null and key_wrap is not null)),
  foreign key (family_id, resident_id) references residents(family_id, id) on delete cascade,
  foreign key (family_id, enc_scope_id) references key_scopes(family_id, id),
  foreign key (enc_scope_id, enc_key_version) references scope_key_versions(scope_id, version)
);
-- RLS T, R, Q(admin, parent) in scrittura; lettura anonima solo con app.emergency_snapshot().
```

| Tabella | Classe | Colonne principali | Vincoli e indici | RLS |
| :--- | :--- | :--- | :--- | :--- |
| `family_branding` | C | `family_id` pk, `display_name`, `logo_file_id`, `primary_color char(7)`, `accent_color char(7)`, `version` | — | T, Q(admin) in scrittura |
| `custom_hosts` | C | `⟨base⟩ ⟨tenant⟩`, `hostname citext unique`, `verification_token` (pubblicato nel record DNS TXT `_domusafe.<host>`), `verified_at`, `tls_status` (`pending`, `issued`, `failed`) | — | T, Q(admin) |

### 6.23 Tabelle di sistema

- `pgboss.*`: create e migrate da pg-boss 12 nello schema `pgboss`; nessuna RLS. Ogni job porta nel payload `familyId` e il worker imposta il contesto prima di toccare tabelle di dominio. Archivio dei job completati: 7 giorni.
- `schema_migrations`: gestita da drizzle-kit, proprietà di `domusafe_owner`.

### 6.24 Campi personalizzati (Premium)

```sql
create table custom_field_definitions (
  -- ⟨base⟩ ⟨tenant⟩ ⟨busta?⟩
  module      text not null check (module ~ '^[a-z_]{2,40}$'),
  section     text check (section ~ '^[a-z_]{2,40}$'),
  field_key   text not null check (field_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  field_type  text not null check (field_type in ('text', 'long_text', 'number', 'money', 'date', 'boolean',
                                                  'select', 'multi_select', 'url', 'phone', 'email')),
  data_class  data_class not null,
  label       text check (char_length(label) between 1 and 80),
  options     jsonb,
  required    boolean not null default false,
  sort_order  smallint not null default 0,
  archived_at timestamptz,
  unique nulls not distinct (family_id, module, section, field_key),
  check ((data_class = 'C') = (label is not null)),
  check ((data_class = 'C') = (enc_payload is null))
);
-- RLS T, Q(admin, parent) in scrittura.
```

- Classe C: etichetta e opzioni in chiaro; i valori stanno in `custom_fields` della riga, validati dal servizio contro le definizioni attive (tipo, opzioni, obbligatorietà, massimo 50 campi per modulo e famiglia).
- Classi A e B: etichetta e opzioni dentro la busta della definizione; i valori dentro la busta del record. Il server conosce solo `field_key`, tipo e classe.
- Archiviare una definizione la nasconde senza cancellare i valori; con il declassamento i valori restano leggibili ma non modificabili.

## 7. Partizionamento

| Tabella | Chiave | Granularità | Creazione | Eliminazione |
| :--- | :--- | :--- | :--- | :--- |
| `audit_events` | `occurred_at` | mensile | `app.ensure_partitions()` crea il mese corrente e i 2 successivi; job giornaliero | partizioni più vecchie di 24 mesi |
| `security_events` | `occurred_at` | mensile | come sopra | partizioni più vecchie di 3 mesi |
| `ha_measurements` | `measured_at` | mensile | come sopra | partizioni più vecchie di 13 mesi, dopo l'aggregazione oraria |

Una partizione predefinita (`*_default`) raccoglie righe fuori intervallo e genera un allarme operativo se non è vuota. L'eliminazione per partizione (`DROP TABLE`) è istantanea e non lascia righe morte.

## 8. Crittografia lato client

### 8.1 Primitive e codifiche

| Uso | Primitiva | Parametri |
| :--- | :--- | :--- |
| Cifratura autenticata | AES-256-GCM (Web Crypto) | IV di 96 bit casuale per ogni cifratura, tag di 128 bit |
| Derivazione di chiavi | HKDF-SHA-256 (Web Crypto) | sale vuoto salvo dove indicato; `info` = etichetta UTF-8 eventualmente seguita da byte di contesto |
| Accordo di chiavi | ECDH P-256 (Web Crypto) | chiavi pubbliche in formato non compresso di 65 byte; private in PKCS#8 |
| Derivazione da segreti a bassa entropia | Argon2id (hash-wasm, WebAssembly) | §8.17 |
| Hash | SHA-256 (Web Crypto) | token, impronte, verificatori |
| Casualità | `crypto.getRandomValues` | — |
| Identificatori | UUIDv7 generato nel browser | 48 bit di millisecondi + 74 bit casuali |
| Frase di recupero | BIP-39 con lista italiana (@scure/bip39) | 24 parole, 256 bit di entropia + 8 bit di controllo |

Tutte le chiavi simmetriche sono di 32 byte. In memoria le chiavi sono `CryptoKey` **non estraibili** appena possibile; si esportano solo per essere avvolte. Nelle API i byte sono codificati in base64url senza riempimento; testi in UTF-8 normalizzati NFC (NFKC per PIN e frasi).

### 8.2 Formati binari

**`DS-ENV v1` — busta** (record, chiavi avvolte, istantanee):

| Byte | Contenuto |
| :--- | :--- |
| 0 | versione `0x01` |
| 1–12 | IV casuale |
| 13–fine | testo cifrato AES-256-GCM seguito dal tag di 16 byte |

**`DS-GRANT v1` — concessione di una chiave a una chiave pubblica** (ECIES):

| Byte | Contenuto |
| :--- | :--- |
| 0 | versione `0x01` |
| 1–65 | chiave pubblica effimera P-256 non compressa |
| 66–fine | `DS-ENV v1` della chiave concessa |

KEK = HKDF(ikm = ECDH(effimera, destinatario), sale vuoto, info = `"domusafe/v1/grant"` ‖ pubblica effimera ‖ pubblica del destinatario). Una nuova coppia effimera per ogni concessione.

**`DS-STREAM v1` — flusso a blocchi** (file A/B, backup):

| Parte | Contenuto |
| :--- | :--- |
| intestazione (12 byte) | `"DSS1"` (4 byte) · versione `0x01` · prefisso di nonce casuale (7 byte) |
| blocchi | ciascuno al massimo 1 MiB di testo in chiaro (1 048 576 byte) + tag di 16 byte |

Nonce del blocco *i* = prefisso (7 byte) ‖ *i* come intero a 32 bit big-endian ‖ `0x01` se è l'ultimo blocco, altrimenti `0x00`. Un file vuoto è un unico blocco finale vuoto. Il segnale di ultimo blocco nel nonce impedisce troncamenti e il contatore impedisce riordini. Limite: 2^32 blocchi (4 PiB), ben oltre il limite di 100 MiB per file.

**`S1` — segreti di servizio sul server**:

| Byte | Contenuto |
| :--- | :--- |
| 0 | `0x53` (`"S"`) |
| 1–2 | versione della chiave master, intero a 16 bit big-endian |
| 3–14 | IV casuale |
| 15–fine | testo cifrato AES-256-GCM + tag |

AAD = `"domusafe/s1|<tabella>.<colonna>|<id riga>"`: un segreto copiato su un'altra riga o colonna non si decifra.

**`DS-BACKUP v1`** è descritto nella §8.15.

### 8.3 Dati associati autenticati

| Oggetto | AAD (UTF-8) |
| :--- | :--- |
| contenuto di un record | `domusafe/v1/record\|<tabella>\|<id record>\|<versione>` |
| chiave per record (DEK) | `domusafe/v1/dek\|<tabella>\|<id record>\|<id ambito>\|<versione chiave d'ambito>` |
| contenuto di un file (`DS-STREAM`) | `domusafe/v1/file\|<id file>` |
| metadati di un file | `domusafe/v1/file-meta\|<id file>` |
| concessione di chiave d'ambito | `domusafe/v1/grant\|<id ambito>\|<versione>\|<account\|vault\|kiosk>:<id destinatario>` |
| chiave privata generale | `domusafe/v1/account-private-key\|<id account>` |
| chiave account per dispositivo | `domusafe/v1/device-account-key\|<id account>\|<id dispositivo>` |
| chiave privata Cassaforte | `domusafe/v1/vault-private-key\|<id account>\|<generazione PIN>` |
| chiave account di recupero | `domusafe/v1/recovery-account-key\|<id account>` |
| chiave privata di recupero | `domusafe/v1/recovery-private-key\|<id account>` |
| chiave Cassaforte sigillata per il recupero | `domusafe/v1/recovery-vault-key\|<id account>` |
| pacchetto chiavi dell'invito | `domusafe/v1/invite-package\|<id invito>` |
| istantanea QR emergenza | `domusafe/v1/emergency\|<id QR>\|<versione istantanea>` |
| chiave K del QR emergenza | `domusafe/v1/emergency-key\|<id QR>\|<id ambito>\|<versione chiave d'ambito>` |
| trasferimento della chiave account (abbinamento) | `domusafe/v1/pairing\|<id canale>\|<id dispositivo nuovo>` |
| backup | `domusafe/v1/backup\|<SHA-256 esadecimale dell'intestazione>` |

La versione del record nell'AAD lega il testo cifrato alla versione: il server non può sostituire un contenuto con uno più vecchio. Il browser cifra con `versione = If-Match + 1`.

### 8.4 Etichette HKDF

| Etichetta (`info`) | Materiale di partenza | Sale | Risultato |
| :--- | :--- | :--- | :--- |
| `domusafe/v1/account-private-key-kek` | chiave account | vuoto | KEK della chiave privata generale |
| `domusafe/v1/vault-secret` | chiave account | vuoto | segreto Cassaforte del dispositivo |
| `domusafe/v1/vault-unlock` | segreto Cassaforte ‖ quota server | vuoto | chiave di sblocco Cassaforte |
| `domusafe/v1/recovery/account-key-kek` | entropia della frase | vuoto | KEK della chiave account di recupero |
| `domusafe/v1/recovery/private-key-kek` | entropia della frase | vuoto | KEK della chiave privata di recupero |
| `domusafe/v1/recovery/verifier` | entropia della frase | vuoto | verificatore inviato al server |
| `domusafe/v1/grant` ‖ pub. effimera ‖ pub. destinatario | segreto ECDH | vuoto | KEK della concessione |
| `domusafe/v1/pairing/sas` ‖ pub. A ‖ pub. B | segreto ECDH | segreto di abbinamento (16 byte dal QR) | 6 byte → 4 parole di verifica |
| `domusafe/v1/pairing/transfer-key` ‖ pub. A ‖ pub. B | segreto ECDH | segreto di abbinamento | chiave di trasferimento |
| `domusafe/s1/master` ‖ versione (2 byte) | chiave master di classe S | vuoto | chiave `S1` della versione |
| `domusafe/s1/better-auth` | chiave master attiva | vuoto | segreto Better Auth |

Ogni etichetta è una costante esportata da `packages/crypto/src/labels.ts`; nessuna stringa è ripetuta nel codice.

### 8.5 Gerarchia delle chiavi

```text
Chiave dispositivo (AES-256, non estraibile, IndexedDB)            una per dispositivo
 └─ avvolge ─► Chiave account AK (32 byte)                         una per account
                ├─ HKDF ─► KEK ─► Chiave privata generale (ECDH P-256)
                │                   └─ apre le concessioni 'account' ─► chiavi d'ambito B
                │                        family · house_technical · house_guest · resident · personal
                └─ HKDF ─► segreto Cassaforte ─┐
Quota server (32 byte, classe S) ──────────────┴─ HKDF ─► chiave di sblocco Cassaforte
                                                          └─► Chiave privata Cassaforte (ECDH P-256)
                                                               └─ apre le concessioni 'vault' ─► chiavi d'ambito A
                                                                    vault_family · vault_personal
Frase di recupero (24 parole) ─ HKDF ─┬─► KEK ─► AK (copia di recupero)
                                      ├─► KEK ─► Chiave privata di recupero ─► apre la Chiave privata Cassaforte
                                      └─► verificatore (il server ne conserva lo SHA-256)

Chiave d'ambito (AES-256, versionata) ─ avvolge ─► Chiave per record (DEK) ─ cifra ─► contenuto, file
```

- **Impronta** di una chiave pubblica: SHA-256 dei 65 byte; i primi 66 bit danno 6 indici da 11 bit nella lista BIP-39 italiana. È mostrata nelle richieste di accesso e nel profilo del membro.
- **Una DEK nuova a ogni scrittura** di un record A/B: costa una cifratura di 32 byte e garantisce che un membro rimosso non legga le modifiche successive anche se ha conservato vecchie DEK.
- **Quali ambiti riceve chi** (valori predefiniti; il dettaglio per ruolo è in fase 3):

| Ambito | Amministratore | Genitore | Figlio | Caregiver | Ospite | Kiosk |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `family` | sì | sì | sì | — | — | — |
| `house_technical` | tutte | tutte | tutte | assegnate | — | — |
| `house_guest` | tutte | tutte | tutte | assegnate | assegnate | la propria casa |
| `resident` | tutti | tutti | il proprio | assegnati | — | residente del profilo anziani |
| `personal` | il proprio | il proprio | il proprio | il proprio | — | — |
| `vault_family` | sì | su concessione | — | — | — | — |
| `vault_personal` | il proprio | il proprio | il proprio | il proprio | — | — |

### 8.6 Ciclo di vita

**Registrazione (nuovo account).** Il browser:

1. genera AK, la coppia generale e la coppia di recupero; genera 32 byte di entropia e mostra le 24 parole, che l'utente deve riscrivere (verifica di 3 parole scelte a caso);
2. avvolge: chiave privata generale con HKDF(AK); AK con HKDF(entropia, account-key-kek); chiave privata di recupero con HKDF(entropia, private-key-kek); calcola il verificatore;
3. genera la chiave dispositivo non estraibile e avvolge AK per il dispositivo;
4. crea la famiglia principale con `app.create_family` e, per essa, gli ambiti `family`, `personal`, la prima casa con `house_technical` e `house_guest`; concede tutto alla propria chiave pubblica;
5. invia in un'unica richiesta: `account_keys`, `devices`, `key_scopes`, `scope_key_versions`, `scope_key_grants`.

La coppia Cassaforte nasce alla prima impostazione del PIN (§8.7).

**Scrittura di un record A/B.** Il browser genera l'id (alla creazione) e una DEK, cifra il contenuto con AAD `record`, avvolge la DEK con la chiave d'ambito corrente (AAD `dek`), invia colonne C e busta con `If-Match`.

**Lettura.** Il browser apre la concessione dell'ambito (una volta per sessione, poi tiene la chiave in memoria), apre la DEK, decifra il contenuto; in caso di errore di autenticazione mostra "Contenuto non leggibile su questo dispositivo" e registra un evento locale, senza tentativi ripetuti.

**File A/B.** DEK nuova per file, `DS-STREAM` sul contenuto, `DS-ENV` per i metadati; l'hash SHA-256 riguarda il testo cifrato caricato.

### 8.7 PIN della Cassaforte

**Impostazione** (prima volta, sessione con ri-autenticazione recente):

1. il browser genera `pin_salt` (16 byte), la quota server *s* (32 byte) e la coppia Cassaforte;
2. calcola `v = Argon2id(PIN, pin_salt)` con i parametri della §8.17;
3. deriva `vault_secret = HKDF(AK, vault-secret)` e `VUK = HKDF(vault_secret ‖ s, vault-unlock)`;
4. avvolge la chiave privata Cassaforte con VUK (AAD con generazione PIN 1) e la sigilla con `DS-GRANT` verso la chiave pubblica di recupero;
5. invia `pin_salt`, parametri, `v`, `s`, chiave pubblica Cassaforte, chiave privata avvolta e sigillata; il server salva `Argon2id_server(v)` e `S1(s)`, poi dimentica `v` e `s`.

**Sblocco:**

1. il browser chiede sale e parametri (`GET`), calcola `v` e lo invia;
2. il server, sotto `SELECT … FOR UPDATE` su `account_pins`, rifiuta se `locked_at` non è null; verifica `v` contro `verifier_hash`;
3. errore: `failed_attempts + 1`, evento `pin_failed`; la risposta riporta i tentativi rimasti, che l'interfaccia mostra ("Restano 2 tentativi"); al quinto errore imposta `locked_at`, registra `pin_locked` e notifica l'account;
4. successo: azzera il contatore, restituisce *s*, apre in Valkey `vault-unlock:<sessionId>` con scadenza 5 minuti (rinnovata a ogni chiamata della Cassaforte);
5. il browser deriva VUK, apre la chiave privata Cassaforte e le concessioni `vault`, tiene le chiavi d'ambito A solo in memoria.

Il server serve i testi cifrati della Cassaforte solo se la chiave `vault-unlock:<sessionId>` esiste. Il blocco automatico avviene dopo 5 minuti di inattività o quando la scheda diventa nascosta: il browser cancella le chiavi in memoria e chiede la cancellazione della chiave Valkey.

**Cambio PIN** (Cassaforte sbloccata): nuovo sale, nuova quota, nuovo verificatore; la chiave privata Cassaforte è riavvolta con la nuova VUK e `pin_generation` aumenta. La copia sigillata per il recupero non cambia.

**Blocco e reimpostazione** (dopo 5 errori o PIN dimenticato), con ri-autenticazione recente:

1. l'utente inserisce le 24 parole; il browser verifica il controllo BIP-39, deriva il verificatore e apre la chiave privata di recupero, poi la chiave privata Cassaforte;
2. sceglie un nuovo PIN; il browser genera nuovi sale e quota e riavvolge la chiave privata Cassaforte;
3. invia verificatore di recupero, nuovi parametri, nuovo `v`, nuova *s* e nuova chiave avvolta; il server confronta SHA-256(verificatore) con `recovery_verifier_sha256` a tempo costante, poi aggiorna tutto in una transazione, azzera il blocco, registra `pin_reset`.

**Offline:** lo sblocco con PIN non è disponibile; la frase di recupero apre la Cassaforte localmente (passi 1 della reimpostazione) usando le concessioni presenti nella cache cifrata.

**Regole del PIN:** da 6 a 64 caratteri (cifre o testo); il browser rifiuta sequenze banali (tutte cifre uguali, sequenze crescenti o decrescenti, data di nascita del residente collegato). Il server non vede mai il PIN.

### 8.8 Frase di recupero

- **Generazione:** alla registrazione; si può rigenerare da Account con ri-autenticazione recente e Cassaforte sbloccata (se la coppia Cassaforte esiste): nuova entropia, nuova coppia di recupero, nuove copie avvolte di AK e della chiave privata Cassaforte, nuovo verificatore. La frase precedente smette di funzionare.
- **Usi:** abbinare un nuovo dispositivo senza un altro dispositivo; aprire la Cassaforte offline; reimpostare il PIN.
- **Uso per un nuovo dispositivo:** accesso con password o OIDC → inserimento delle parole → il server restituisce `recovery_wrapped_account_key` solo dopo la verifica del verificatore (non è un segreto per chi non ha la frase, ma riduce la superficie) → il browser apre AK e registra il dispositivo con `paired_via = 'recovery'`.
- **Verifica senza rivelare la frase:** il server conserva solo SHA-256 del verificatore HKDF; l'entropia di 256 bit rende inutile la forza bruta.
- **Presentazione:** 24 parole numerate in 3 colonne, stampabili sul foglio "Frase di recupero" con la linguetta Privacy; mai salvate dall'applicazione.

### 8.9 Abbinamento dei dispositivi ("QR + frase segreta")

1. Il dispositivo A (già abbinato) crea un canale in Valkey (id casuale, scadenza 5 minuti), genera una coppia effimera e un segreto di abbinamento di 16 byte, mostra il QR `domusafe-pair:1:<id canale>:<pubblica A base64url>:<segreto base64url>`.
2. Il dispositivo B (stesso account, sessione attiva) scansiona il QR, genera la propria coppia effimera, pubblica la chiave pubblica nel canale.
3. Entrambi calcolano il segreto ECDH, derivano 6 byte con l'etichetta `pairing/sas` e mostrano le prime 4 parole (11 bit ciascuna) della lista italiana.
4. L'utente conferma su A che le parole coincidono; A cifra AK con la chiave di trasferimento (AAD `pairing`) e la invia nel canale.
5. B apre AK, genera la propria chiave dispositivo, invia `devices` con la propria copia avvolta; il canale viene cancellato.

La chiave pubblica di A viaggia nel QR, fuori dal server; un server malevolo che sostituisse la chiave di B produrrebbe parole diverse su A (probabilità di coincidenza 2^-44 in un solo tentativo).

### 8.10 Inviti e richieste di accesso

**Invito (link o QR):**

1. l'invitante genera l'id dell'invito, un token di 128 bit e una chiave K_inv di 32 byte;
2. prepara il pacchetto: le chiavi d'ambito previste dal ruolo e dagli ambiti dell'invito, cifrate con K_inv (`DS-ENV`, AAD `invite-package`); gli ambiti `vault_*` non entrano mai in un invito;
3. invia id, SHA-256 del token, pacchetto ed elenco `{scopeId, version}`; l'URL è `https://<host>/i/<token>#<K_inv>`;
4. l'invitato, dopo la registrazione o l'accesso, apre l'invito con `app.invitation_by_token`, decifra il pacchetto, crea le concessioni per la propria chiave pubblica e le invia con `app.accept_invitation`; il server verifica che gli ambiti concessi coincidano con l'elenco e cancella il pacchetto.

L'invito è a uso singolo e scade al massimo dopo 14 giorni; il Genitore può creare solo inviti per Ospiti (policy del modulo).

**Richiesta di accesso:** il richiedente non riceve chiavi finché un Amministratore approva dal proprio dispositivo; l'interfaccia mostra l'impronta di 6 parole della chiave del richiedente, da confrontare a voce o di persona; l'approvazione crea appartenenza e concessioni nella stessa richiesta.

### 8.11 Rotazione delle chiavi d'ambito e rimozione di un membro

1. **Rimozione o riduzione di ambito** (incluse la scadenza di un Ospite e la revoca di un kiosk): il server elimina subito le concessioni del destinatario per tutte le versioni degli ambiti persi, chiude sessioni e WebSocket di quell'appartenenza e imposta `rotation_required_at` su quegli ambiti.
2. **Rotazione** (eseguita dal browser del primo Amministratore o del titolare dell'ambito che si collega; banner "Aggiornamento di sicurezza in corso"):
   - genera la versione *n+1* della chiave d'ambito e la concede a tutti i titolari rimasti;
   - imposta `current_version = n+1` e azzera `rotation_required_at` nella stessa transazione;
   - riavvolge in blocchi da 200 le DEK dei record correnti dell'ambito con la versione *n+1* (aggiornando `enc_dek` e `enc_key_version` senza cambiare `version` del record né il contenuto).
3. Le versioni precedenti restano concesse ai titolari rimasti per leggere le revisioni.
4. Le nuove scritture usano sempre `current_version`; il server rifiuta buste con una versione diversa da quella corrente.
5. **Limite dichiarato:** ciò che il membro rimosso ha già letto o copiato non è revocabile; dopo la rimozione non riceve più testi cifrati (RLS e concessioni eliminate) e le scritture successive usano DEK nuove.

Rotazione periodica facoltativa: l'Amministratore può avviarla da "Sicurezza della famiglia"; nessuna rotazione automatica a calendario, perché ogni rotazione richiede un browser con le chiavi.

### 8.12 QR emergenza

- Creazione: il browser genera id, token di 128 bit e K; compone l'istantanea scelta, la cifra (`DS-ENV`, AAD `emergency`), avvolge K con la chiave d'ambito `family` (AAD `emergency-key`), invia SHA-256 del token.
- URL stampato: `https://<host>/e/<token>#<K>`.
- Pagina emergenza: chiama `app.emergency_snapshot(SHA-256(token))` tramite `GET /api/v1/public/emergency/{token}`; decifra con K dal frammento; nessun cookie, nessun indirizzo IP registrato.
- Aggiornamento: stesso token e stessa K (riaperta dalla copia avvolta), `snapshot_version + 1`.
- Revoca: `snapshot` e `key_wrap` a null, `revoked_at` valorizzato; la pagina mostra "QR revocato". Per creare un nuovo QR si genera un nuovo token.
- Rotazione dell'ambito `family`: K viene riavvolta come le DEK; il QR stampato resta valido.

### 8.13 Kiosk

Il tablet genera una coppia P-256 non estraibile e una credenziale di 256 bit; l'Amministratore scansiona il QR del tablet, registra la chiave pubblica e concede gli ambiti scelti. La credenziale è conservata nel tablet in IndexedDB cifrata con la chiave dispositivo del kiosk; il server conserva solo SHA-256. La revoca elimina concessioni e credenziale e avvia la rotazione degli ambiti concessi.

### 8.14 Cache offline

- Persister asincrono di TanStack Query su IndexedDB; ogni voce è `DS-ENV` con la chiave dispositivo (AAD `domusafe/v1/cache|<id account>|<chiave della query>`).
- Contenuto: dati C, testi cifrati A/B così come scaricati, concessioni; mai chiavi d'ambito in chiaro, mai DEK aperte.
- Coda delle modifiche offline: richieste complete (metodo, percorso, corpo, `If-Match`) cifrate allo stesso modo, inviate in ordine alla riconnessione.
- Cancellazione: logout, revoca della sessione o del dispositivo (rilevata dalla risposta 401 con codice `session_revoked` o `device_revoked`), cambio di account.

### 8.15 Backup cifrato ed esportazione CSV

**`DS-BACKUP v1`** (file `.domusafe-backup`, generato nel browser):

| Parte | Contenuto |
| :--- | :--- |
| `"DSBK"` | 4 byte |
| versione | `0x01` |
| lunghezza intestazione | intero a 32 bit big-endian |
| intestazione | JSON UTF-8: `format`, `version`, `createdAt`, `appVersion`, `accountId`, `familyIds`, `kdf` (`argon2id`, `m`, `t`, `p`, `salt`) |
| corpo | `DS-STREAM v1` con chiave = Argon2id(frase scelta, sale) e AAD `backup` |

Il testo in chiaro del corpo è compresso gzip (`CompressionStream`) ed è una sequenza di voci `[tipo: 1 byte][lunghezza: 4 byte big-endian][contenuto]`:

| Tipo | Contenuto |
| :--- | :--- |
| `0x01` | manifest JSON: moduli, conteggi, versione dello schema dati |
| `0x02` | un record JSON `{module, table, id, version, data}` con i campi A/B già decifrati |
| `0x03` | metadati JSON di un file `{id, resourceType, resourceId, name, type, size, sha256}` |
| `0x04` | byte del file descritto dalla voce `0x03` precedente |
| `0xFF` | voce finale con i conteggi per tipo |

La frase del backup deve avere almeno 12 caratteri; l'interfaccia propone una frase di 6 parole generata. I dati A entrano nel backup solo con la Cassaforte sbloccata. Il ripristino legge il file nel browser e ricrea i record con nuove DEK.

**CSV per sezione:** UTF-8 con BOM, separatore `;`, date `gg/mm/aaaa`, importi con virgola decimale; generato nel browser. Prima del download l'interfaccia avvisa che il file non è cifrato.

### 8.16 Segreti di classe S sul server

- Chiavi master in `DOMUSAFE_MASTER_KEYS` (elenco `versione:base64url` di 32 byte) e `DOMUSAFE_MASTER_KEY_ACTIVE`; in SaaS fornite da un KMS all'avvio.
- Chiave `S1` della versione *n* = HKDF(master *n*, info `domusafe/s1/master` ‖ *n*). Nuove cifrature con la versione attiva; lettura di tutte le versioni presenti.
- Rotazione: si aggiunge una versione, la si rende attiva, il job `reseal-secrets` riscrive in blocchi ogni colonna `*_sealed` e `server_share_sealed`; poi la versione vecchia si rimuove.
- I segreti in chiaro vivono solo nella memoria del processo e non compaiono nei log (`redact` di pino).

### 8.17 Parametri Argon2id

| Uso | Dove | Memoria | Iterazioni | Parallelismo | Uscita | Motivo |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| PIN (verificatore) | browser, hash-wasm | 64 MiB | 3 | 1 | 32 byte | secondo profilo RFC 9106 con parallelismo 1 (WebAssembly è a thread singolo); circa 1 secondo sui tablet di fascia bassa |
| PIN (hash del verificatore) | server, @node-rs/argon2 | 64 MiB | 3 | 4 | PHC | rende costoso l'attacco a un database rubato anche conoscendo il sale |
| Password di accesso | server, @node-rs/argon2 | 64 MiB | 3 | 4 | PHC | fase 1 |
| Frase del backup | browser, hash-wasm | 64 MiB | 3 | 1 | 32 byte | il file del backup è esposto a forza bruta offline |

I parametri del PIN sono salvati per account (`account_pins.kdf_*`): un aumento futuro si applica al successivo cambio di PIN, senza migrazioni.

## 9. Cosa conserva il server

| Dato | Forma | Classe | Chi può decifrare |
| :--- | :--- | :--- | :--- |
| identità, email, nome, sessioni, provider collegati | chiaro (token OAuth cifrati da Better Auth) | C | server |
| hash della password | PHC Argon2id | — | nessuno (solo verifica) |
| segreto TOTP e codici di recupero 2FA | cifrati dal plugin two-factor | S | processo server |
| appartenenze, ruoli, ambiti, inviti (metadati), richieste | chiaro | C | server |
| chiavi pubbliche (generale, Cassaforte, recupero) e impronte | chiaro | — | pubbliche |
| chiave account | solo avvolta: per dispositivo e per recupero | — | dispositivo abbinato o titolare della frase |
| chiavi private | solo avvolte | — | titolare |
| chiavi d'ambito | solo concessioni `DS-GRANT` | — | destinatari |
| PIN | mai; solo hash Argon2id del verificatore | — | nessuno |
| quota server del PIN | `S1` | S | processo, rilasciata solo dopo PIN corretto |
| frase di recupero | mai; solo SHA-256 del verificatore | — | nessuno |
| contenuti A e B, nomi e tipi dei file A/B | buste `DS-ENV`, file `DS-STREAM` | A, B | titolari delle chiavi d'ambito |
| metadati strutturali A/B | chiaro: id, tabella, sezione, ambito, versione, date, dimensione, residente o casa collegati | C | server |
| dati operativi | chiaro | C | server |
| istantanee QR emergenza | `DS-ENV` con K nel frammento dell'URL | P | chi ha il foglio o l'URL |
| token di inviti, QR, feed, kiosk, accesso personale | solo SHA-256 | — | nessuno |
| segreti di integrazioni e webhook, chiave API AI | `S1` | S | processo |
| registro attività | chiaro, senza contenuti | C | Amministratori |
| indirizzi IP | solo in `security_events`, 90 giorni | C | account interessato |
| backup completi | mai sul server (file scaricato dall'utente) | — | titolare della frase del backup |

## 10. Impatti sul codice (vincoli per la fase 4)

- `packages/db`: gruppi di colonne della §3.2, helper `withTenant(ctx, fn)` che apre la transazione, imposta il contesto e restituisce un client tipizzato; `writeWithRevision`; funzioni e policy della §4 e §5 nelle migrazioni SQL; test di integrazione con PostgreSQL 18 reale che verificano l'isolamento di ogni modello di policy.
- `packages/crypto`: formati della §8.2, AAD della §8.3, etichette della §8.4, gerarchia della §8.5; vettori della §11 eseguiti in Node e nel browser.
- `packages/contracts`: limiti di lunghezza e enum identici a quelli SQL (un test confronta enum SQL e Zod).

## 11. Vettori di test

Valori esadecimali salvo indicazione; base64url senza riempimento dove indicato con "b64u". Gli IV fissi esistono **solo** nei vettori.

**HKDF — gerarchia Cassaforte**

| Voce | Valore |
| :--- | :--- |
| AK | `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f` |
| quota server *s* | `202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f` |
| HKDF(AK, `domusafe/v1/vault-secret`) | `0663daaa634eb5bd5a04ed0fab17544813e60e9c7e44a01679dbc8c5ba1cdde9` |
| HKDF(segreto ‖ *s*, `domusafe/v1/vault-unlock`) | `ca9a901889bf6340b5fd475d42a2735f819b04a871e54c3d057ac55f98fd5089` |
| HKDF(AK, `domusafe/v1/account-private-key-kek`) | `104989678007948f328e8a206068ccd606b9e56c7e26a6aaa5d2cd65bfce391e` |

**DS-ENV — contenuto di un record**

| Voce | Valore |
| :--- | :--- |
| DEK | `404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f` |
| IV | `000102030405060708090a0b` |
| AAD | `domusafe/v1/record\|vault_items\|01900000-0000-7000-8000-000000000001\|1` |
| testo in chiaro | `{"titolo":"Polizza casa","numero":"VEC-0001"}` |
| busta (b64u) | `AQABAgMEBQYHCAkKC0EnGBED4yjP4CiikteBpcH5pQ1qDT_MccIChuMs1BsxYkrmV_4BJk-AKEm9PALTELnOBW4vSMjUwxJTZxc` |

**DS-ENV — DEK avvolta dalla chiave d'ambito**

| Voce | Valore |
| :--- | :--- |
| chiave d'ambito | `606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f` |
| IV | `303132333435363738393a3b` |
| AAD | `domusafe/v1/dek\|vault_items\|01900000-0000-7000-8000-000000000001\|01900000-0000-7000-8000-0000000000c1\|1` |
| DEK avvolta (b64u) | `ATAxMjM0NTY3ODk6O_6xfk1n48DlXv9z4dLj9KSn5zlADLb06UOSN-FuRRjvZWRHRQx3Cx22kPErTBmulg` |

**Argon2id — verificatore del PIN**

| Voce | Valore |
| :--- | :--- |
| PIN | `246810` |
| sale | `000102030405060708090a0b0c0d0e0f` |
| parametri | memoria 65536 KiB, 3 iterazioni, parallelismo 1, 32 byte |
| verificatore (b64u) | `FK59ZPX63aMpZrVWsN_tk1OHR4Y44dSfsBX66Zmzkic` |

**Frase di recupero**

| Voce | Valore |
| :--- | :--- |
| entropia | `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f` |
| 24 parole | `abaco alogeno mitigare alogeno fenomeno affetto bravura bronzina ampio gonfio elaborato bisonte accadere nessuno europa monile autunno risibile alce criceto renna apparire mana trincea` |
| KEK chiave account | `8cf25bff2be06fac977fc30998ba1cb1695fca6960a7cd4d55a5ae9c9ccab08e` |
| KEK chiave privata di recupero | `aa74a1a5b4835f1b49ff43e659977e8092fddc20ac0aa04aa60fba41e7212479` |
| verificatore (b64u) | `sLF3V7lmcF_sWVh8iOWrOVhyukHdCxWxocXkoeGTj7s` |
| SHA-256 conservato dal server | `79905fe6932a734610953ac6f1ab907feae7f20828d1d0cbf98461a4c6d13048` |

**DS-GRANT — concessione di una chiave d'ambito**

| Voce | Valore |
| :--- | :--- |
| privata destinatario (scalare) | `1111111111111111111111111111111111111111111111111111111111111111` |
| pubblica destinatario | `040217e617f0b6443928278f96999e69a23a4f2c152bdf6d6cdf66e5b80282d4ed194a7debcb97712d2dda3ca85aa8765a56f45fc758599652f2897c65306e5794` |
| privata effimera (scalare) | `2222222222222222222222222222222222222222222222222222222222222222` |
| pubblica effimera | `04d65a93977caa3d1b081852ff57a79e465f1660577304baead505dd3a48589cf350185e895372df6221ea3a137557e473fddb6755f05bd507c3c533fce9c91285` |
| segreto ECDH | `ccfc261f58193c98ca4ad4a53bbac6f0ee29bc4d48438090446908622ca79af6` |
| KEK | `0ac80700a7a6542df0a6f0f9a4938cf162f894ae44d7f6be23d0bd5ff8f48fad` |
| chiave concessa | la chiave d'ambito del vettore precedente |
| IV | `0c0d0e0f1011121314151617` |
| AAD | `domusafe/v1/grant\|01900000-0000-7000-8000-0000000000c1\|1\|account:01900000-0000-7000-8000-0000000000b2` |
| concessione (b64u) | `AQTWWpOXfKo9GwgYUv9Xp55GXxZgV3MEuurVBd06SFic81AYXolTct9iIeo6E3VX5HP922dV8FvVB8PFM_zpyRKFAQwNDg8QERITFBUWF3Xa3CYH60azheTxqZ2EpxKw3_o_mA99rZW_wxRx2ZIntcyKsZGW2tGOVhs1wq_BpQ` |
| impronta (6 parole) | `chitarra indole varcato bubbone parola frenata` |

**Abbinamento**

| Voce | Valore |
| :--- | :--- |
| privata A / pubblica A | `3333…33` (32 byte) / `0451a7580833898ea1b183cbd7350a4099078c6ef1c1e18e970cd7683035f25e7d0110522712b0b5a7cff081685486984a94e6831edac46e7360fa9d834a7a81a1` |
| privata B / pubblica B | `4444…44` (32 byte) / `045b36890dacbd7c9a96bb74a1ee28b3d2d75b72e09a20ef25cf8e6fd8a9f0350d0e14bed8d4682a34d83538bdff5b96e89a6666ec0db5745d02fa1210072df75a` |
| segreto di abbinamento | `000102030405060708090a0b0c0d0e0f` |
| segreto ECDH | `5238f9f956812e75918895390fa057a2063aa66d4d5eefbe6ecdcf78342d2922` |
| byte delle parole di verifica | `a61045b3ac16` → indici 1328, 1041, 871, 705 |
| parole di verifica | `portata monastero isolato fucsia` |
| chiave di trasferimento | `206aaae9ad9071f23dd027b2c30da46e849f2618ef12f844e3a3df464522a24b` |

**DS-STREAM — file di 3 byte**

| Voce | Valore |
| :--- | :--- |
| chiave | la DEK del vettore DS-ENV |
| prefisso di nonce | `a0a1a2a3a4a5a6` |
| AAD | `domusafe/v1/file\|01900000-0000-7000-8000-0000000000f1` |
| testo in chiaro | `abc` |
| flusso (b64u) | `RFNTMQGgoaKjpKWmhCAhwArP0K3WjTsBJlRVX3RJZQ` |

**S1 — quota server**

| Voce | Valore |
| :--- | :--- |
| chiave `S1` della versione 1 (usata direttamente nel vettore) | `808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f` |
| IV | `505152535455565758595a5b` |
| AAD | `domusafe/s1\|account_pins.server_share\|01900000-0000-7000-8000-0000000000a1` |
| testo in chiaro | la quota *s* del primo vettore |
| blob (b64u) | `UwABUFFSU1RVVldYWVpbkqS0ZgNcJ8FGciEAo7P-sHZFJvQIEt4fmvJ1aumjuBbsXkjv9rqTx4J6EPltmXeA` |

**Argon2id — frase del backup**

| Voce | Valore |
| :--- | :--- |
| frase | `cavallo batteria graffetta corretta` |
| sale | `101112131415161718191a1b1c1d1e1f` |
| chiave | `6a36380bb4889aa8198ee138aed174a41a9f2ccca066baa7e01ee68199550851` |

## 12. Modello di minaccia

| Avversario | Capacità | Protezioni | Rischio residuo |
| :--- | :--- | :--- | :--- |
| Attaccante esterno sulla rete | intercetta, ripete richieste | TLS e HSTS, cookie `__Host-`, verifica di `Origin`, header anti-CSRF, rate limit, HMAC con anti-ripetizione | nessuno noto oltre a vulnerabilità del software |
| Furto delle credenziali di accesso | accede come l'utente da un nuovo dispositivo | 2FA obbligatoria per Amministratori; senza dispositivo abbinato o frase vede solo dati C; notifica di nuovo accesso | dati C visibili fino alla revoca |
| Furto di un dispositivo sbloccato | possiede la chiave dispositivo e le sessioni | Cassaforte con PIN verificato dal server (5 tentativi); revoca remota del dispositivo e delle sessioni; cache cancellata al contatto | dati B leggibili finché il dispositivo resta offline |
| Furto del database | legge tutte le tabelle | A/B cifrati con chiavi mai presenti in chiaro; classe S cifrata con chiave master fuori dal database; token solo come hash | dati C e metadati strutturali esposti |
| Furto del bucket | legge tutti gli oggetti | file A/B cifrati; nomi oggetto opachi | file C esposti |
| Server compromesso (operatore malevolo) | legge e modifica il database, serve codice | non può leggere A/B senza codice modificato; AAD contro sostituzioni; parole di verifica e impronte contro sostituzione delle chiavi | può servire JavaScript malevolo (mitigato da CSP, build riproducibili, hash delle release) |
| Membro rimosso | conserva quanto già letto | concessioni eliminate, rotazione, DEK nuove a ogni scrittura | ciò che ha già letto |
| Membro con ruolo ridotto (Figlio, Ospite) | prova ad accedere oltre il ruolo | policy dei moduli, RLS (H, R, O, Q), assenza delle chiavi d'ambito | nessuno noto |
| Chi trova un foglio con QR emergenza | apre l'URL | è lo scopo del QR; linguetta Privacy; revoca; notifica di scansione | legge l'istantanea finché il QR non è revocato |
| Integrazione domotica compromessa | invia eventi falsi | HMAC per connessione, rotazione dei segreti, sola scrittura di eventi e misure della propria casa | falsi allarmi nella propria casa |
| Fornitore del modello AI | riceve i prompt | solo dati C dal server; A/B solo dal browser con consenso; modelli locali possibili | quanto l'utente sceglie di inviare |

## 13. Conservazione di log e dati

| Dato | Durata | Meccanismo |
| :--- | :--- | :--- |
| log applicativi (pino) | 30 giorni | rotazione del collettore; nessun contenuto, nessun corpo di richiesta |
| `security_events` (con IP e user agent) | 90 giorni | eliminazione delle partizioni |
| `audit_events` | 24 mesi | eliminazione delle partizioni |
| sessioni scadute o revocate | 30 giorni dopo la scadenza | job `purge-sessions` |
| dispositivi revocati | chiave avvolta eliminata subito; riga 90 giorni | job |
| inviti usati, scaduti o revocati | 30 giorni | job |
| richieste di accesso decise | 180 giorni | job |
| consegne dei webhook | 30 giorni | job |
| notifiche in-app | 90 giorni dopo la lettura, 180 giorni comunque | job |
| telemetria grezza | 13 mesi | eliminazione delle partizioni |
| telemetria aggregata oraria | 5 anni | job |
| eventi domotici | 13 mesi | job |
| importazioni di ricette | 30 giorni | job |
| cestino (`deleted_at`) | 30 giorni, poi eliminazione definitiva con revisioni e file | job `purge-trash` |
| revisioni | almeno 365 giorni e sempre le ultime 20 per risorsa | job `prune-revisions` |
| scansioni QR emergenza | solo data dell'ultima scansione e contatore | — |
| job completati di pg-boss | 7 giorni | configurazione pg-boss |
| famiglia eliminata | 30 giorni di ripensamento, poi eliminazione di righe e oggetti S3 | job `purge-families` |
| copie di sicurezza del database (SaaS) | 35 giorni, cifrate, in regione UE | provider gestito |

## 14. Decisioni prese in questa fase

1. **Id generati dal browser** per tutte le righe con busta, file, ambiti, dispositivi, inviti e QR (UUIDv7 validato con `uuid_extract_version`), perché l'id entra nei dati associati autenticati.
2. **Coppia di recupero dedicata**, così la chiave Cassaforte creata dopo la registrazione è recuperabile senza chiedere la frase in quel momento.
3. **Coppia Cassaforte separata** dalla coppia generale: le chiavi d'ambito A sono concesse a una chiave privata apribile solo con PIN (o frase), quindi chi ha solo il dispositivo non apre la Cassaforte.
4. **DEK nuova a ogni scrittura** dei record A/B.
5. **RLS anche per ambito di casa e residente, per gli Ospiti e per i ruoli** sulle tabelle più sensibili, oltre a famiglia e dati personali.
6. **Indice di ricerca unificato** (`search_index`) invece di colonne `tsvector` in ogni tabella: una query per la ricerca globale e i filtri AND/OR.
7. **Promemoria unificati** (`reminders`) come unica fonte delle scadenze di tutti i moduli.
8. **Durate di conservazione** della §13.

## 15. Correzioni emerse nella fase 4

Applicate a questo documento durante l'implementazione delle fondamenta (3 novembre 2026):

1. **Policy con array:** nelle condizioni `= any (...)` la sottoquery va convertita in array (`= any ((select app.house_ids())::uuid[])`); senza conversione PostgreSQL la tratta come insieme di righe e il confronto `uuid = uuid[]` fallisce.
2. **Two-factor di Better Auth 1.7:** `auth_two_factors` ha anche `verified`, `failed_verification_count` e `locked_until`.
3. **Famiglia principale:** `account_profiles.primary_family_id` è valorizzato da `app.create_family`; non esiste un vincolo che lo renda obbligatorio, perché registrazione e creazione della famiglia sono due richieste distinte.
4. **Migrazioni:** lo schema è in file SQL scritti a mano con uno specchio Drizzle verificato da un test di deriva (ADR 0002 nel repository), non generato da drizzle-kit.
