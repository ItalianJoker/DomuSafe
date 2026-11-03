# DomuSafe Suite — Fase 1: stack e architettura

> **Stato:** proposta in attesa di conferma. La fase 2 (schema database e crittografia) parte solo dopo conferma esplicita.
> **Fonti:** [prompt master](master-prompt.md) · [standard di codice](coding-standards.md).
> **Verifica dipendenze:** versioni controllate il 3 novembre 2026 su registro npm, nodejs.org e Docker Hub. Nessun codice applicativo scritto in questa fase.

---

## 1. Sintesi delle scelte

| Livello | Scelta | Versione (major.minor) |
| :--- | :--- | :--- |
| Linguaggio | TypeScript `strict`, solo ESM | 6.0 |
| Runtime server | Node.js LTS attiva ("Lithium") | 26 |
| API REST | Fastify + Zod + fastify-type-provider-zod | 5.12 · 4.6 · 7.0 |
| OpenAPI | @fastify/swagger (OpenAPI 3.1) + @fastify/swagger-ui | 9.9 · 6.1 |
| Database | PostgreSQL | 18 |
| ORM e migrazioni | Drizzle ORM + drizzle-kit, driver `pg` | 0.45 · 0.31 · 8.23 |
| Storage oggetti | API S3 con AWS SDK v3; Garage in self-host | 3.1161 · 2.5 |
| Job pianificati | pg-boss (code su PostgreSQL) | 12 |
| Dati effimeri | Valkey + client ioredis | 9.0 · 6.0 |
| Autenticazione | Better Auth + Argon2id (@node-rs/argon2) | 1.7 · 2.2 |
| Realtime | WebSocket (@fastify/websocket) con fan-out su Valkey | 11.3 |
| Frontend | React + Vite + TanStack Router + TanStack Query | 19.3 · 8.3 · 1.170 · 5.105 |
| Componenti UI | React Aria Components + Tailwind CSS | 1.22 · 4.3 |
| PWA | vite-plugin-pwa (Workbox, `injectManifest`) | 2.0 |
| Crittografia client | Web Crypto + hash-wasm (Argon2id) + @scure/bip39 | nativa · 4.12 · 2.4 |
| Monorepo | pnpm workspaces + Turborepo | 12 · 2.11 |
| Reverse proxy | Caddy | 2.11 |

Le versioni patch esatte vengono fissate nel lockfile all'avvio della fase 4.

## 2. Principi architetturali

1. **Monolite modulare.** Un'API e un worker, moduli con confini espliciti e verificati dal lint. Niente microservizi: complessità operativa non giustificata dal dominio e ostile al self-host.
2. **Server unica fonte di verità.** Il dispositivo tiene solo una cache cifrata e cancellabile (§5.6).
3. **Zero-knowledge dove serve.** Cassaforte e dati sensibili cifrati nel browser; il server conserva testo cifrato (§5).
4. **Contratto prima del codice.** Gli stessi schemi Zod producono validazione runtime, tipi TypeScript e documento OpenAPI.
5. **Tipizzazione end-to-end.** Database (Drizzle) → servizi → contratti → client web generato dal documento OpenAPI.
6. **Difesa in profondità.** Autorizzazione per ruolo + Row-Level Security di PostgreSQL + possesso delle chiavi crittografiche.
7. **Stessa origine.** Web, `/api` e `/ws` sullo stesso host: cookie `SameSite`, nessun CORS per il client principale.

## 3. Stack scelto e motivazioni

### 3.1 Linguaggio e runtime

- **TypeScript 6.0** con `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. TypeScript 7 (compilatore nativo, 7.0.2) è disponibile, ma typescript-eslint 8.72 accetta solo TypeScript < 6.1: la 6.0 ha semantica allineata alla 7 e mantiene il lint con informazioni di tipo (`no-floating-promises`, `no-misused-promises`), indispensabile nel codice crittografico e transazionale. Passaggio alla 7 quando typescript-eslint la supporta.
- **Node.js 26 LTS**: supporto di lungo periodo, Web Crypto e `fetch` nativi; la stessa API crittografica del browser permette test isomorfi del pacchetto `crypto`.
- **Convenzioni:** identificatori e TSDoc in inglese; testi dell'interfaccia solo tramite i18n (italiano predefinito); `README.md` in italiano come da standard.

### 3.2 API REST e OpenAPI

- **Fastify 5.12**: tra i framework Node più veloci; plugin ufficiali dello stesso team per ogni requisito di sicurezza del prompt (helmet, rate-limit, cors, cookie, websocket, multipart, swagger); l'incapsulamento a plugin corrisponde a "un plugin per modulo".
- **Zod 4.6 + fastify-type-provider-zod 7.0**: lo stesso schema valida la richiesta, tipizza l'handler, genera OpenAPI e **serializza la risposta**. I campi non dichiarati nello schema di risposta non escono mai: nessuna fuga accidentale di dati.
- **@fastify/swagger 9.9** produce `openapi.json` (OpenAPI 3.1), versionato nel repository; la CI fallisce se il file diverge dal codice. **@fastify/swagger-ui 6.1** su `/api/docs`.
- **Client web** tipizzato con openapi-typescript 7.13 + openapi-fetch 0.17: il frontend consuma esattamente il contratto pubblicato, lo stesso file letto da agenti AI e dal server MCP.
- Prefisso di versione `/api/v1`.

### 3.3 Database e ORM

- **PostgreSQL 18** (18.6; la 19 è ancora release candidate). Funzioni usate:
  - `uuidv7()` nativo: chiavi ordinate nel tempo, indici compatti, nessun identificativo sequenziale esposto;
  - Row-Level Security per l'isolamento tra famiglie;
  - ricerca full-text con configurazione `italian`, `unaccent` e `pg_trgm` (ricerca e filtri AND/OR);
  - `jsonb` per i campi personalizzati Premium;
  - partizionamento nativo per telemetria domotica e registro attività;
  - vincoli differiti per la partita doppia;
  - I/O asincrono introdotto nella 18.
- **Drizzle ORM 0.45 + drizzle-kit 0.31**: schema in TypeScript, query tipizzate vicine all'SQL, nessun motore runtime né generazione di codice, policy RLS e ruoli dichiarabili nello schema, SQL esplicito quando serve (colonne `tsvector` generate, partizioni). La linea 1.0 è ancora release candidate (rc.5): si usa la 0.45 stabile; Better Auth supporta entrambe.
- **Driver `pg` 8.23** (node-postgres): maturo, pool affidabile, `SET LOCAL` per transazione compatibile con PgBouncer in modalità transaction. postgres.js scartato: la sua major 4.0 è uscita il 29 ottobre 2026.
- **Ruoli database:** `domusafe_owner` (migrazioni, proprietario delle tabelle) e `domusafe_app` (API e worker, senza `BYPASSRLS`, senza `UPDATE`/`DELETE` sul registro attività).

### 3.4 Storage S3-compatibile

- **AWS SDK v3** (`@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner` 3.1161) con `endpoint` e `forcePathStyle` configurabili: funziona con qualsiasi provider S3.
- Upload e download **diretti tra browser e bucket** tramite URL prefirmati a breve scadenza, vincolati per dimensione e tipo: l'API non fa da proxy dei file.
- File delle classi A e B (§5.1) caricati **già cifrati**; dalle foto si rimuovono nel browser i metadati EXIF (inclusa la posizione GPS) prima dell'upload.
- Bucket privati; chiavi oggetto opache `<familyId>/<uuidv7>`; il nome originale del file sta nei metadati del record (cifrato per A/B).
- **Self-host: Garage 2.5** (Rust, leggero, pensato per piccole installazioni, supporta URL prefirmati e CORS di bucket). MinIO scartato: repository community archiviato e immagini Docker Hub non più pubblicate.
- **SaaS:** object storage S3 gestito in regione UE (provider scelto in fase 4).

### 3.5 Job pianificati e dati effimeri

- **pg-boss 12** (code su PostgreSQL con `SKIP LOCKED` e pianificazione cron): il job si accoda **nella stessa transazione** della modifica di dominio, quindi nessun job perso o orfano. Usi: notifiche scadenze, ricorrenze di manutenzioni e movimenti contabili, tassi di cambio della Banca Centrale Europea, import ricette da URL, connettori domotica, email, pulizie periodiche.
- **Valkey 9** (fork BSD della Linux Foundation) tramite **ioredis 6**: contatori di rate limit condivisi tra repliche (il limite non deve dipendere dalla replica che risponde), pub/sub per il fan-out WebSocket, cache delle sessioni Better Auth, anti-replay dei webhook. Contiene solo dati effimeri: perdere Valkey non perde dati.

### 3.6 Autenticazione

- **Better Auth 1.7** con adapter Drizzle sullo stesso PostgreSQL: libreria TypeScript attiva, plugin ufficiali `two-factor`, `generic-oauth`, `open-api`. Lucia scartata (deprecata).
- **Identità separata dal dominio:** famiglie, ruoli, inviti, richieste di accesso e trasferimento di proprietà stanno nel modulo `tenancy`, non nel plugin organizzazioni di Better Auth (le regole di piano, i QR e le chiavi crittografiche sono logica di dominio).
- **Password:** Argon2id con @node-rs/argon2 2.2 (binding Rust nativo), parametri RFC 9106 "seconda raccomandazione": memoria 64 MiB, 3 iterazioni, parallelismo 4. Sostituisce l'hash predefinito di Better Auth (scrypt).
- **2FA:** TOTP + codici di recupero; segreti TOTP cifrati lato server (classe S, §5.1).
- **OAuth/OIDC:** Google come provider nativo; Keycloak e Authentik con `generic-oauth` e discovery OIDC; PKCE; collegamento a un account esistente solo con email verificata. Negli accessi OIDC il secondo fattore è responsabilità dell'identity provider.
- **Sessioni:** su database, cookie `__Host-` HttpOnly Secure SameSite=Lax; elenco e revoca singola o totale. La revoca chiude subito i WebSocket della sessione (via pub/sub) e fa cancellare la cache del dispositivo al contatto successivo.
- **Ri-autenticazione recente** obbligatoria per: trasferimento proprietà, disattivazione 2FA, reimpostazione PIN Cassaforte, export completo, gestione dei dispositivi abbinati.
- **Email transazionali** (verifica, reimpostazione password, inviti) con nodemailer 10 su SMTP: qualsiasi provider, compatibile con il self-host.
- Il documento OpenAPI di Better Auth viene unito a quello principale.

### 3.7 Realtime, versioni, sincronizzazione

- **WebSocket `/ws`** sulla stessa origine (@fastify/websocket 11, libreria `ws`). Autenticazione all'upgrade con cookie di sessione e verifica di `Origin`; sottoscrizioni ai canali `famiglia:<id>` e `casa:<id>` autorizzate dal controllo ruoli.
- **Eventi di sola notifica** `{tipo, risorsa, id, versione}`, mai contenuti: il client invalida la cache e rilegge via REST. Fan-out tra repliche con pub/sub Valkey.
- **Concorrenza ottimistica:** ogni risorsa modificabile ha un campo `versione`; le scritture usano `If-Match`; in caso di conflitto il server risponde 409 con la versione corrente e l'utente sceglie.
- **Versioni e ripristino:** tabella revisioni append-only per risorsa (per A/B si conserva il testo cifrato precedente). Il ripristino crea una nuova revisione con il contenuto scelto; nulla viene cancellato.
- **"QR + frase segreta"** (prompt §1): abbinamento di un nuovo dispositivo, descritto in §5.4. Trasferisce chiavi, non dati: i dati stanno sul server.

### 3.8 Frontend

- **React 19.3 + Vite 8.3** (bundler Rolldown) + @vitejs/plugin-react 6.2. Applicazione a pagina singola: i dati sensibili si decifrano solo nel browser, quindi il rendering lato server non porta benefici e aumenta la superficie d'attacco.
- **TanStack Router 1.170:** route tipizzate; famiglia e casa nel percorso, così il cambio rapido di casa è una navigazione; code splitting per modulo.
- **TanStack Query 5.105:** cache dei dati server, invalidazione dagli eventi WebSocket, mutazioni offline in pausa con ripresa automatica, persistenza tramite persister asincrono cifrato (§5.6).
- **React Aria Components 1.22:** accessibilità completa (tastiera, lettore di schermo), interazione uniforme touch/mouse/penna (kiosk, anziani, emergenza con aree di tocco ≥48 px), date, numeri e valute localizzati (contabilità multivaluta, calendario). Componenti senza stile imposto.
- **Tailwind CSS 4.3:** token di tema come variabili CSS; tema chiaro, scuro o automatico (`prefers-color-scheme` + preferenza salvata sull'account); trasparenze del kiosk con `backdrop-filter`.
- **@material/material-color-utilities 0.4:** palette tonali per il colore di ciascun membro, con contrasto garantito in chiaro e scuro (sistema colore Material 3).
- **Internazionalizzazione: Paraglide JS 2.29** — messaggi compilati e tipizzati (una chiave mancante è un errore di compilazione), nel bundle finiscono solo i messaggi usati; lingue italiano (predefinita) e inglese; lo stesso pacchetto serve email e notifiche del server. Paraglide 3.0 è uscita il 3 novembre 2026: valutazione in fase 4. Un glossario di etichette estese evita acronimi nell'interfaccia (es. "Certificazione Unica", "Imposta municipale propria", "Tassa sui rifiuti").
- **Budget di peso:** app shell ≤150 KB gzip al primo caricamento; pagina QR emergenza ≤30 KB gzip (entry Vite separata in TypeScript senza React) per aprirsi subito anche con rete debole.

### 3.9 PWA, kiosk, notifiche

- **vite-plugin-pwa 2.0** con strategia `injectManifest` (Workbox 7.4): service worker nostro per precache dell'app shell, ricezione Web Push e aggiornamenti controllati. Il service worker **non** mette in cache risposte API: i dati passano solo dalla cache cifrata (§5.6).
- Installabile su Android, iOS (Web Push da iOS 16.4 con app installata) e desktop. Su smartphone: navigazione in basso, rispetto delle safe area, gesti.
- **Web Push VAPID** con `web-push` 3.6 dal worker; payload minimi e privi di dati sensibili; notifiche anche in-app.
- **Kiosk tablet:** stessa PWA su `/kiosk`, credenziale di dispositivo dedicata (§6.2), Wake Lock e Fullscreen API, galleria widget con disposizione salvata per dispositivo, ritorno automatico alla schermata iniziale dopo inattività.

### 3.10 Librerie di supporto

| Esigenza | Libreria | Dove | Motivo |
| :--- | :--- | :--- | :--- |
| Argon2id nel browser (PIN) | hash-wasm 4.12 | web | WebAssembly veloce; Web Crypto non offre Argon2 |
| Frase di recupero | @scure/bip39 2.4 | web | libreria sottoposta ad audit, lista di parole italiana inclusa |
| Ricerca su dati decifrati | minisearch 7.2 | web | indice full-text in memoria, mai salvato |
| Scansione QR e codici a barre | barcode-detector 3.2 | web | API `BarcodeDetector` nativa se presente, altrimenti zxing in WebAssembly |
| Generazione QR | uqr 0.1 | web | zero dipendenze, SVG nitido in stampa |
| Riconoscimento testo bollette | tesseract.js 7 | web, in Web Worker | la foto non lascia il dispositivo; dati lingua italiana serviti dal nostro dominio |
| PDF (Kit Eredità, piano pasti) | @react-pdf/renderer 4.9 | web, caricata su richiesta | i PDF con dati di Cassaforte nascono nel browser |
| Stampa A4/A5 con linguetta Privacy | CSS `@media print` | web | resa esatta, nessuna dipendenza |
| Calendario | ical-generator 11 (feed), ical.js 2.2 (import) | worker · web | formato standard RFC 5545 |
| MQTT | mqtt 5.16 | worker | client MQTT 5 di riferimento |
| AI opzionale | ai 7 (AI SDK) | web · worker | provider intercambiabili, endpoint compatibili OpenAI per modelli locali |
| Server MCP | @modelcontextprotocol/sdk 1.32 | api | SDK ufficiale del protocollo |
| Pagamenti SaaS | stripe 23 | api | vedi decisione 10 in §10 |
| Log | pino 10 (integrato in Fastify) con `redact` | api · worker | log strutturati senza segreti |
| Tracce e metriche | @opentelemetry/sdk-node 0.300 | api · worker | standard aperto, esportatore OTLP configurabile |

### 3.11 Qualità, test, tooling

- **pnpm 12 workspaces + Turborepo 2.11** con cache dei task.
- **ESLint 10 + typescript-eslint 8.72** (`strict-type-checked`); **eslint-plugin-jsdoc 65** rende obbligatorio il TSDoc sugli export (scopo, precondizioni, postcondizioni, contratto dati); **eslint-plugin-tsdoc 0.5** ne verifica la sintassi; regole `no-restricted-imports` impediscono import tra moduli fuori dalle interfacce pubbliche. **Prettier 3.9**.
- **Vitest 5.1** (unità e integrazione); **@testcontainers/postgresql 12** avvia un PostgreSQL 18 reale nei test, così RLS e migrazioni sono verificate davvero; **Playwright 1.64** per i test end-to-end (installazione PWA, offline, kiosk, QR emergenza, stampa).
- Vettori di test crittografici fissi nel pacchetto `crypto`, eseguiti sia in Node sia nel browser (modalità browser di Vitest).
- CI: controllo tipi, lint, test, divergenza di `openapi.json`, `pnpm audit`, budget di peso del bundle.

### 3.12 Deploy

- Un'immagine server (Node 26) con due comandi, `api` e `worker`; asset web statici serviti da **Caddy 2.11**.
- **Self-host** (Docker Compose): Caddy con HTTPS automatico, api, worker, PostgreSQL 18, Valkey 9, Garage 2.5.
- **SaaS:** stesse immagini; PostgreSQL gestito e object storage S3 in regione UE (i dati sanitari sono categoria particolare per il GDPR).
- **Host white-label:** certificati TLS su richiesta di Caddy, con endpoint di autorizzazione che accetta solo host verificati di una famiglia Premium.

### 3.13 Scostamenti dai documenti precedenti e alternative scartate

| Documento | Prima | Ora | Motivo |
| :--- | :--- | :--- | :--- |
| `project-context.md` | Next.js App Router | Vite (SPA) + API Fastify | il prompt master chiede uno stack scelto in autonomia con REST/OpenAPI; con dati decifrati nel browser il rendering lato server non serve |
| `ai-coding-blueprint-prd.md` | PBKDF2 100.000 iterazioni sul solo PIN | Argon2id + chiave dispositivo + quota server (§5.3) | nessuna funzione di derivazione protegge un PIN breve da forza bruta offline; 100.000 è sotto la raccomandazione OWASP attuale per PBKDF2-SHA256 (600.000) |
| `feature-matrix-v2.md` | PWA senza cache dei dati | cache cifrata, mai fonte di verità (§5.6) | il prompt master chiede funzionamento offline; decisione 2 in §10 |
| `material-theme.md` | Material Design | sistema colore Material 3 su componenti React Aria + Tailwind | accessibilità, peso ridotto, libertà sulle trasparenze del kiosk |

Altre alternative valutate e scartate: **NestJS** (decoratori e peso maggiore; Fastify + Zod dà lo stesso OpenAPI da un'unica fonte), **Prisma** (RLS, colonne generate e partizioni meno naturali), **Socket.IO** (WebSocket semplice basta, meno dipendenze), **BullMQ** (pg-boss permette l'accodamento transazionale), **Material UI** (bundle più pesante), **X25519** (assente in Safari precedenti alla 17, frequenti sui tablet kiosk datati: si usa P-256).

## 4. Modello multi-tenant: famiglia e più case

### 4.1 Entità

```text
Account (identità Better Auth)
 └─ Appartenenza (ruolo, ambiti, scadenza) ──► Famiglia   ← tenant: piano, Proprietario, fuso orario, valuta base
                                                ├─ Casa (1..N secondo il piano)
                                                │    ├─ Stanza ─► Mobile/Armadio ─► Contenitore ─► Oggetto
                                                │    ├─ Utenze, manutenzioni, chiusure, dispositivi domotici
                                                │    └─ Assegnazioni Residente↔Casa e Animale↔Casa
                                                ├─ Residente (persona con o senza account; colore)
                                                ├─ Animale
                                                └─ Dati di famiglia (Cassaforte, finanze, calendario, cucina…)
```

### 4.2 Regole

1. **Tenant = Famiglia.** Ogni riga di dominio ha `family_id` obbligatorio; le risorse di una casa hanno anche `house_id`; i dati personali hanno `owner_account_id` e visibilità `personal`.
2. **Account e famiglie sono molti-a-molti** tramite Appartenenza (un caregiver può assistere più famiglie). La registrazione è obbligatoria e crea la **famiglia principale** dell'account: lì vivono i suoi dati Personale, soggetti al piano di quella famiglia. Se l'account esce dalla famiglia, i dati personali lo seguono in un'altra famiglia di cui è Amministratore o in una nuova famiglia creata per lui; non restano mai alla famiglia precedente.
3. **Residente ≠ Account.** Bambini piccoli e anziani senza smartphone sono Residenti senza account; un Residente può essere collegato a un account (es. un Figlio). Il colore per membro appartiene al Residente.
4. **Limiti di piano:** case — Free e Basic 1, Advanced fino a 3, Premium illimitate; residenti — Free 1, dal Basic illimitati; animali illimitati dal Basic. Il controllo avviene nel servizio `billing` dentro la stessa transazione della creazione, con blocco della riga famiglia (`SELECT … FOR UPDATE`) contro superamenti concorrenti.
5. **Cambio rapido di casa:** il contesto è nel percorso (`/f/{familyId}/c/{houseId}/…` nel web, `/api/v1/families/{familyId}/houses/{houseId}/…` nell'API); selettore in testata con le case recenti; ultima casa usata salvata sull'account. Nessuno stato "casa corrente" nascosto sul server: ogni richiesta è autosufficiente e verificabile.
6. **Isolamento a due livelli:**
   - applicativo: ogni repository riceve un `TenantContext { accountId, familyId, houseId?, role, scopes }` costruito dopo la verifica dell'appartenenza;
   - database: ogni transazione esegue `SET LOCAL app.account_id` e `SET LOCAL app.family_id`; le policy RLS filtrano per `family_id` e, sulle righe personali, per `owner_account_id`. Un errore applicativo non può esporre dati di un'altra famiglia.
7. **Piano e prova:** il piano appartiene alla Famiglia. La prova Premium di 30 giorni è usabile una sola volta per account, su una famiglia di cui l'account è Proprietario; alla scadenza si torna al piano pagato precedente o a Free. Dopo un declassamento i dati oltre i limiti restano leggibili ed esportabili ma non modificabili (decisione 11 in §10).
8. **White-label:** un host personalizzato verificato punta a una famiglia; logo e colori si applicano a vista ospite, stampe e QR di quella famiglia.

Inviti, richieste di accesso e trasferimento di proprietà sono descritti in §6.5.

## 5. Confine crittografico tra client e server

### 5.1 Classi di dati

| Classe | Contenuto | Chi cifra | Il server legge? | Ricerca | Scadenze e notifiche |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A — Cassaforte** | conti di famiglia, mutui, coperture del credito, polizze e beneficiari, luogo bollette e disdette, previdenza, fondo pensione, trattamento di fine rapporto, documenti di lavoro, eredità digitale Apple/Google, kit password, conti personali, patrimonio personale, documenti fiscali | browser, chiave d'ambito Cassaforte, sblocco con PIN | No | nel browser, dopo lo sblocco | promemoria neutro creato dal browser in classe C |
| **B — Sensibili** | schede sanitarie, farmaci, diario parametri, scheda "Chi sono", consegne, note della rubrica relazioni, contatti di emergenza, codici (Wi‑Fi, cancello, citofono, allarme, PUK della SIM), dati di pagamento (IBAN di addebito) | browser, chiave d'ambito (famiglia, casa, residente, personale) | No | nel browser | promemoria neutro in classe C |
| **C — Operativi** | case, stanze, inventario, manutenzioni, utenze (salvo dati di pagamento), scadenze, calendario, faccende, punti, ricette, dispensa, spesa, contabilità (importi e categorie), telemetria domotica | TLS in transito; cifratura a riposo dell'infrastruttura (disco e bucket) | Sì | full-text PostgreSQL | Web Push completo |
| **S — Segreti di servizio** | segreti TOTP, token Home Assistant, credenziali MQTT, segreti webhook, segreti OIDC, quote server del PIN | server, AES-256-GCM con chiave master da variabile d'ambiente o KMS, versione di chiave per la rotazione | Solo il processo | — | — |
| **P — Pubblicazioni** | istantanea del QR emergenza | browser, chiave nel frammento dell'URL (§5.5) | No | — | — |

Regole aggiuntive:

- **Record misti:** campi C in chiaro più una "busta" cifrata A o B con i soli campi sensibili (es. un'utenza ha fornitore e scadenza in chiaro e IBAN di addebito cifrato).
- Un **file** ha la classe del record a cui appartiene.
- I **campi personalizzati** Premium ereditano la classe della sezione.

### 5.2 Gerarchia delle chiavi

- **Chiave dispositivo:** AES-GCM 256 bit generata nel browser come `CryptoKey` non estraibile e conservata in IndexedDB. È una credenziale del dispositivo, non un dato: non viola la regola "nessuna fonte di verità nel browser".
- **Chiave account:** 256 bit casuali, avvolta da ogni chiave dispositivo e dalla chiave di recupero. Il server conserva solo le versioni avvolte.
- **Frase di recupero:** 24 parole italiane (256 bit di entropia) mostrate una sola volta; da essa si deriva con HKDF-SHA-256 la chiave di recupero.
- **Coppia di chiavi dell'account:** ECDH P-256; la privata è avvolta dalla chiave account, la pubblica è pubblicata nella directory delle chiavi.
- **Chiavi d'ambito** (AES-256), una per ambito di condivisione: `famiglia`, `casa:tecnica`, `casa:ospiti`, `residente`, `personale`, `cassaforte:famiglia`, `cassaforte:personale`. Ciascuna è avvolta (ECDH + HKDF + AES-GCM) per la chiave pubblica di ogni account autorizzato: **possedere la chiave è l'autorizzazione crittografica**; il controllo ruoli del server decide soltanto chi riceve il testo cifrato.
- **Chiave per record:** ogni record o file A/B ha una chiave propria, avvolta dalla chiave d'ambito con indicazione della versione; ruotare un ambito significa riavvolgere queste chiavi, non ricifrare tutti i contenuti.
- **Primitive:** solo Web Crypto — AES-256-GCM con IV casuale di 96 bit, HKDF-SHA-256, ECDH P-256 — più Argon2id in WebAssembly per il PIN. I dati associati autenticati includono id record, versione e ambito: un testo cifrato spostato su un altro record non si decifra.

### 5.3 PIN della Cassaforte

- Le chiavi d'ambito Cassaforte sono avvolte con una chiave derivata (HKDF) da due componenti: un segreto ricavato dalla chiave account (sta sul dispositivo) e una **quota server** di 32 byte casuali per account (classe S).
- La quota server viene rilasciata solo dopo la prova del PIN: il browser invia Argon2id(PIN, sale dell'account) calcolato con hash-wasm; il server lo confronta con il proprio hash Argon2id. Dopo **5 errori consecutivi** lo sblocco con PIN si blocca; si riattiva solo con la frase di recupero, che consente anche di impostare un nuovo PIN.
- Conseguenze:
  - il server da solo non ha la chiave account, quindi non decifra;
  - chi ruba un dispositivo ha la chiave account ma deve passare dal server per ogni tentativo di PIN, quindi la forza bruta è impossibile;
  - chi ruba il database non ha né chiave account né PIN.
- La chiave Cassaforte vive **solo in memoria**; blocco automatico dopo 5 minuti di inattività e quando la scheda viene nascosta; mai salvata, mai in chiaro nella cache offline.
- **Offline:** lo sblocco con PIN non è disponibile (serve la quota server); è disponibile con la frase di recupero, che avvolge anche le chiavi Cassaforte.

### 5.4 Dispositivi e abbinamento "QR + frase segreta"

- L'accesso con password o OIDC autentica verso il server ma **non apre le chiavi**. Su un nuovo dispositivo i dati C sono subito disponibili; i dati A/B dopo l'abbinamento.
- **Abbinamento:** il dispositivo già abbinato mostra un QR (canale + chiave pubblica effimera); il nuovo dispositivo lo scansiona; entrambi mostrano la stessa **frase di verifica di 4 parole** derivata dal segreto ECDH condiviso; l'utente conferma che coincidono e la chiave account passa cifrata attraverso il server, che vede solo testo cifrato. La frase impedisce a un server malevolo di sostituire le chiavi.
- **Alternativa:** inserimento della frase di recupero.
- In Account c'è l'elenco dei dispositivi abbinati; la revoca elimina la chiave account avvolta per quel dispositivo e ne revoca le sessioni.

### 5.5 QR emergenza senza login e inviti

- Il browser compone l'istantanea scelta dall'utente (gruppo sanguigno, allergie, patologie, terapie, dispositivi medici, contatti di emergenza, animali, chiusure acqua/gas/quadro elettrico), la cifra con una chiave casuale K e carica il testo cifrato; il server restituisce un token casuale di 128 bit.
- **URL stampato:** `https://<host della famiglia>/e/<token>#<K>`. I browser non inviano mai al server la parte dopo `#`: il server non può leggere l'istantanea.
- **Pagina emergenza:** entry leggera, nessun cookie, decifratura nel browser. Il server registra solo data e ora dell'ultima scansione e un contatore (nessun indirizzo IP) e avvisa la famiglia con una notifica.
- **Revoca:** cancella testo cifrato e token; la pagina mostra "QR revocato" e i fogli stampati vanno sostituiti.
- **Aggiornamento:** stesso token e stessa K (K conservata avvolta con la chiave d'ambito `famiglia`), quindi i QR già stampati restano validi quando i dati cambiano.
- **Limite dichiarato:** chi ha il foglio stampato legge l'istantanea; è lo scopo del QR, e la linguetta Privacy copre QR e dati sanitari.
- **Inviti via link o QR** usano lo stesso schema: token sul server, chiave nel frammento; la chiave apre un pacchetto di chiavi d'ambito preparato dall'invitante, così l'invitato ottiene l'accesso crittografico anche se l'invitante non è online.

### 5.6 Cache offline

- La cache di TanStack Query è salvata in IndexedDB **cifrata con la chiave dispositivo**. Contiene dati C e i testi cifrati A/B così come scaricati; i dati B si decifrano solo in memoria; i dati A solo durante una sessione Cassaforte sbloccata.
- Le modifiche fatte offline sono accodate (cifrate) e inviate alla riconnessione con `If-Match`; i conflitti sono mostrati all'utente.
- La cache si cancella a logout, revoca della sessione e revoca del dispositivo. Il server resta l'unica fonte di verità.
- **Disponibili offline:** schermata soccorso, schede di emergenza, manuale della casa, chiusure, contatti.

### 5.7 Cosa vede e cosa non vede il server

- **Vede:** identità, appartenenze e ruoli, dati C, metadati strutturali dei record A/B (id, sezione, ambito, versione, date, dimensione), conteggi per i limiti di piano, eventi del registro senza contenuti.
- **Non vede:** contenuti A/B e nomi dei relativi file, PIN, frase di recupero, chiave account, chiavi private, chiavi d'ambito, istantanee QR.
- **Conseguenze progettuali:**
  - ricerca e indicatori di completezza (% Casa, Residenti, Emergenza) sui dati A/B sono calcolati nel browser;
  - le scadenze di record A/B generano un promemoria in classe C con testo neutro, creato dal browser e modificabile dall'utente;
  - stampe e PDF con dati A/B sono generati nel browser, filigrana Free/Basic inclusa;
  - l'AI eseguita dal server lavora solo su dati C.

### 5.8 Limiti dichiarati

- **Rimozione di un membro:** le chiavi d'ambito vengono ruotate e i nuovi contenuti usano la nuova versione; ciò che il membro ha già visto non è revocabile.
- **Perdita di tutti i dispositivi e della frase di recupero** = perdita dei dati A/B personali. I dati di famiglia restano recuperabili se un altro membro possiede la chiave d'ambito.
- **Distribuzione delle chiavi pubbliche:** un server malevolo potrebbe sostituirle nelle richieste di accesso fatte senza QR; mitigazione: impronta della chiave visibile e confrontabile; inviti e abbinamenti via QR non sono esposti a questo rischio.
- **Codice servito dal server:** un server compromesso potrebbe servire JavaScript malevolo (limite comune a tutte le web app con cifratura end-to-end); mitigazioni: CSP rigida, build riproducibili, hash delle release pubblicati.

## 6. Controllo accessi per ruolo (bozza)

### 6.1 Ruoli per famiglia

| Ruolo | Scopo | Ambito |
| :--- | :--- | :--- |
| **Amministratore** | gestisce famiglia, membri, case, integrazioni, sicurezza | tutta la famiglia. Uno degli Amministratori è il **Proprietario**: piano, pagamenti, eliminazione della famiglia; ruolo trasferibile |
| **Genitore** | vita quotidiana, figli, approvazioni | tutta la famiglia salvo amministrazione; Cassaforte solo su concessione |
| **Figlio** | faccende, punti, calendario, lista della spesa | budget in sola lettura; nessun accesso a Cassaforte, utenze o scrittura delle finanze |
| **Caregiver** | assiste residenti specifici | solo residenti e case assegnati: salute, consegne, calendario di quei residenti |
| **Ospite** | ospite, sitter, artigiano | solo vista ospite delle case assegnate, con scadenza obbligatoria |

### 6.2 Soggetti non umani

- **Dispositivo kiosk:** credenziale emessa da un Amministratore via QR; può leggere i widget configurati ed eseguire le azioni del profilo anziani (conferma assunzione farmaco, SOS, chiamata); nessun accesso a Cassaforte o amministrazione; revocabile.
- **Token QR emergenza:** anonimo, legge un solo testo cifrato.
- **Integrazione** (Home Assistant, webhook): scrive solo eventi e telemetria della propria casa, con firma HMAC.
- **Operatori della piattaforma SaaS:** nessun accesso ai dati delle famiglie per ruolo; i dati A/B restano comunque illeggibili.

### 6.3 Regola di autorizzazione

Un'azione è consentita solo se valgono **tutte** le condizioni:

1. il ruolo permette l'azione sulla risorsa;
2. la risorsa è nell'ambito dell'appartenenza (case, residenti, scadenza);
3. il piano della famiglia include la funzione;
4. per i dati A/B, l'account possiede la chiave d'ambito;
5. per la Cassaforte, la sessione Cassaforte è sbloccata con PIN.

Il catalogo dei permessi è tipizzato in `packages/contracts` e condiviso: il web nasconde ciò che non si può fare, il server decide. Ogni modulo ha la propria policy; RLS fa da rete di sicurezza.

### 6.4 Matrice per area

Legenda: **G** gestisce · **M** modifica · **L** legge · **\*** solo ambito assegnato o propri dati · **—** nessun accesso.

| Area | Amministratore | Genitore | Figlio | Caregiver | Ospite |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Membri, inviti, richieste di accesso | G | L, invita Ospiti | L | L\* | — |
| Piano, prova, pagamenti | G se Proprietario, altrimenti L | — | — | — | — |
| Casa: vista tecnica, stanze, chiusure | G | M | L | L\* | — |
| Casa: vista ospite | G | M | L | L\* | L\* |
| Utenze e abbonamenti | G | M | — | — | — |
| Manutenzioni e inventario | G | M | L | L\* | — |
| Domotica | G | L | L | L\* (allarmi, sensori) | — |
| Residenti, salute, farmaci, diario | G | G | L\* (propria scheda) | M\* | — |
| Soccorso, SOS, chiamata 118 | uso | uso | uso | uso | uso |
| Calendario, faccende, consegne | G | G | M\* | M\* | L\* (consegne) |
| Punti e ricompense | G | G (approva) | M\* (richiede) | — | — |
| Cucina, dispensa, spesa | G | G | M (spesa) | M\* | — |
| Finanze familiari | G | M | L\* (budget) | — | — |
| Cassaforte di famiglia, successione | G | su concessione | — | — | — |
| Personale (dati propri) | G\* | G\* | G\* | G\* | — |
| Stampa e QR emergenza | G | G | — | L\* (stampa assistiti) | — |
| Registro attività | L | — | — | — | — |
| Integrazioni, webhook, marchio host | G | — | — | — | — |
| Approvazione proposte dell'assistente AI | sì | sì | — | — | — |

Note:

- Un Amministratore **non** legge i dati Personale di altri account; la regola è garantita anche crittograficamente (chiave d'ambito `personale`).
- "Su concessione" significa che un Amministratore concede esplicitamente la chiave d'ambito `cassaforte:famiglia` a un Genitore.
- Una proposta dell'AI è approvabile solo da chi potrebbe eseguire la stessa azione.
- **Anteprima "cosa vede l'Ospite/sitter":** il server applica la stessa proiezione usata per l'Ospite, quindi l'anteprima coincide con la vista reale.

### 6.5 Flussi

- **Inviti:** link o QR con ruolo e ambiti predefiniti, scadenza, uso singolo, chiave nel frammento (§5.5). Il Genitore può invitare solo Ospiti.
- **Richieste di accesso:** un account chiede di entrare in una famiglia o un ruolo/ambito più ampio; un Amministratore approva dal proprio dispositivo, che avvolge le chiavi d'ambito per il richiedente mostrando l'impronta della sua chiave.
- **Trasferimento di proprietà:** dal Proprietario a un altro Amministratore, con ri-autenticazione 2FA di entrambi e accettazione esplicita; l'abbonamento passa al nuovo Proprietario; la prova Premium resta legata all'account che l'ha usata.
- **Revoche:** sessioni (singola o tutte), dispositivi, appartenenze; la rimozione di un membro ruota le chiavi d'ambito che possedeva.

## 7. Mappa dei moduli

### 7.1 Struttura del repository

```text
domusafe/
├─ apps/
│  ├─ api/          Fastify: /api/v1 (REST), /ws, /api/openapi.json, /api/docs
│  ├─ worker/       pg-boss: notifiche, ricorrenze, connettori, email
│  └─ web/          PWA React (app e /kiosk) + entry emergenza /e/ (TypeScript senza React)
├─ packages/
│  ├─ contracts/    schemi Zod, catalogo permessi, errori, eventi realtime
│  ├─ db/           schema Drizzle, migrazioni, policy RLS, ruoli database
│  ├─ crypto/       Web Crypto, Argon2id, frase di recupero, formati busta, vettori di test
│  ├─ plans/        piani, limiti, prova Premium (funzioni pure condivise)
│  ├─ i18n/         messaggi italiano e inglese
│  ├─ ui/           componenti React Aria + Tailwind, token tema, palette membri
│  └─ config/       configurazioni condivise TypeScript, ESLint, Prettier
├─ infra/           Dockerfile, Docker Compose self-host, Caddyfile
├─ docs/adr/        una decisione architetturale per file
├─ README.md
├─ AGENTS.md
└─ ARCHITECTURE.md
```

### 7.2 Anatomia di un modulo

```text
apps/api/src/modules/<modulo>/
  routes.ts       rotte Fastify con schemi presi da packages/contracts
  service.ts      casi d'uso; unico punto che apre transazioni
  repository.ts   unico punto che usa Drizzle
  policy.ts       regole di autorizzazione del modulo
  events.ts       eventi di dominio emessi
  jobs.ts         handler pg-boss eseguiti dal worker
  *.test.ts
apps/web/src/features/<modulo>/   pagine, pannelli, hook di query
```

I moduli comunicano solo tramite interfacce di servizio esportate o eventi di dominio; un modulo non importa il repository di un altro (regola di lint). Ogni modulo è un plugin Fastify. Il wizard di compilazione usa gli stessi endpoint dei pannelli: nessun percorso dati separato, stessa validazione, ogni campo modificabile a mano.

### 7.3 Moduli per sezione del prompt

Colonna "Piano": solo i vincoli scritti nel prompt; i moduli senza vincolo esplicito vengono assegnati a un piano in fase 3.

| § prompt | Modulo | Responsabilità | Menu | Classe dati | Piano |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `identity` | registrazione, accesso, 2FA, OIDC, sessioni e revoca, ri-autenticazione | Account | C, S | — |
| 1 | `tenancy` | famiglie, case, appartenenze, inviti link/QR, richieste di accesso, trasferimento proprietà, cambio rapido di casa | Famiglia, testata | C | case: Free/Basic 1, Advanced 3, Premium illimitate |
| 1 | `access` | catalogo permessi, policy, contesto tenant | trasversale | — | — |
| 1 | `keys` | directory chiavi pubbliche, chiavi avvolte, dispositivi, abbinamento QR, quota PIN | Account › Dispositivi | S, testo cifrato | — |
| 1 | `sync` | WebSocket, eventi, revisioni, ripristino | trasversale | C (eventi senza contenuti) | sync: Premium |
| 1 | `backup` | export completo cifrato con frase scelta dall'utente, CSV per sezione (assemblati nel browser) | Account | A, B, C | — |
| 1 | `audit` | registro append-only, eventi di sicurezza | Account › Registro | C (senza contenuti) | registro consultabile: Premium |
| 1 | `webhooks` | webhook in entrata e in uscita firmati HMAC | Account › Integrazioni | S | — |
| 1, 7 | `billing` | piani, limiti, prova Premium 30 giorni, pagamenti | Account › Piano | C | — |
| 2 | `dashboard` | cruscotto con % Casa/Residenti/Emergenza, suggerimenti, "What's next", feed novità | Cruscotto (pagina iniziale) | C + calcolo nel browser su A/B | — |
| 2 | `deadlines` | scadenze raggruppate in Scadute / Questa settimana / Questo mese | Cruscotto, globale | C (promemoria neutri per A/B) | — |
| 2 | `notifications` | notifiche in-app e Web Push VAPID, preferenze per canale | globale | C | — |
| 2 | `onboarding` | wizard opzionali sopra gli stessi endpoint dei pannelli | Guida | — | — |
| 2 | `kiosk` | dispositivi kiosk, galleria widget, profilo anziani | Account › Dispositivi, `/kiosk` | C, B (widget) | — |
| 2 | `preferences` | tema chiaro/scuro/automatico, lingua, colore per membro | Account | C | — |
| 2 | `assistant` | AI opzionale (locale, cloud, MCP) con proposte e approvazione umana | Extra | C; A/B solo nel browser con consenso esplicito | — |
| 2 | `guide` | Guida DomuSafe con contenuti localizzati | Guida | contenuto statico | — |
| 3 | `vault` | conti di famiglia, mutui, coperture del credito, polizze e beneficiari, luogo bollette e disdette, previdenza, fondo pensione, trattamento di fine rapporto, documenti di lavoro, eredità digitale Apple/Google, kit password | Cassaforte | A | Cassaforte con PIN per documenti e conti di famiglia: Advanced |
| 3 | `succession` | checklist di successione, Kit Eredità PDF generato nel browser | Cassaforte | A | Premium |
| 4 | `house` | manuale ospiti, Wi‑Fi, citofono, cancello, pacchi, rifiuti, animali e piante per chi custodisce la casa, chiusure acqua/gas/quadro/caldaia con foto, stanze come primo livello (i dispositivi si collegano alle stanze) con foto giorno/sera/luci spente, vista ospite e tecnica, anteprima | Casa | C; codici di accesso B | Free |
| 4 | `contacts` | artigiani, fornitori, contatti condivisi | Casa, Famiglia | C | — |
| 4 | `utilities` | luce, gas, internet, acqua, tassa sui rifiuti, abbonamenti, codici cliente, pagamenti, riconoscimento testo nel browser, modelli per fornitore | Casa › Utenze | C; dati di pagamento B | Free |
| 4 | `maintenance` | manutenzioni ricorrenti per categoria e priorità | Casa | C | — |
| 4 | `inventory` | stanze, armadi, contenitori, oggetti | Casa | C | — |
| 4 | `search` | ricerca full-text, filtri AND/OR salvabili (massimo 5 nella barra laterale) | globale | C sul server, A/B nel browser; filtri salvati cifrati con chiave personale | — |
| 4 | `home-automation` | Home Assistant, MQTT, sensori, solare, ricarica auto elettrica, consumi, allarmi, serrature smart | Casa › Domotica | C; credenziali S | — |
| 4 | `media` | file e foto su S3, URL prefirmati, classe ereditata dal record | trasversale | ereditata | — |
| 5 | `residents` | persone, colore, scheda "Chi sono", assegnazione alle case | Famiglia | C (anagrafica minima), B (Chi sono) | Free 1 residente, Basic illimitati |
| 5 | `health` | schede sanitarie, farmaci, diario parametri | Famiglia › Residenti | B | — |
| 5 | `pets` | animali, veterinario | Famiglia | C; dati sanitari B | Basic illimitati |
| 5 | `emergency` | schermata soccorso, chiamata 118, SOS via SMS/WhatsApp con invio di prova | pulsante sempre visibile | B | SOS: Premium |
| 5 | `care` | consegne, kiosk anziani, rubrica relazioni etica (ricorrenze e ultimo contatto, senza profilazione) | Famiglia | B | — |
| 5 | `calendar` | calendario, orari, faccende, feed .ics | Famiglia | C | — |
| 5 | `rewards` | punti, serie di giorni consecutivi, economia dei ragazzi, ricompense, approvazione dei genitori | Famiglia | C | — |
| 5 | `personal` | telefonia e SIM, veicoli, conti personali, patrimonio personale | Personale | A (conti, patrimonio), B (codici SIM), C (scadenze veicoli) | conti e patrimonio personali: Premium |
| 5 | `taxes` | checklist fiscale italiana con etichette estese (Certificazione Unica, dichiarazione precompilata, modello 730, indicatore della situazione economica equivalente, imposta municipale propria, tassa sui rifiuti, acconti dell'imposta sul reddito) | Personale | C (stato checklist), A (documenti) | Premium |
| 6 | `recipes` | ricette, import da URL (dati strutturati schema.org Recipe, protezione SSRF), piano pasti in PDF | Extra | C | — |
| 6 | `pantry` | dispensa con lettura del codice a barre | Extra | C | — |
| 6 | `shopping` | liste per negozio e corsia | Extra | C | — |
| 6 | `finance` | contabilità in partita doppia multivaluta, movimenti ricorrenti, budget, salvadanai, report, divisione spese | Extra | C; identificativi dei conti B | — |
| 7 | `print` | A4 con linguetta Privacy, A5, filigrana secondo il piano (solo web) | Stampa / QR | generato nel browser | filigrana: Free, Basic |
| 7 | `qr` | QR emergenza senza login, revoca, ultima scansione | Stampa / QR | P | — |
| 7 | `branding` | marchio dell'host, host white-label | Account | C | Premium |
| trasversale | campi personalizzati | capacità di ogni modulo, classe della sezione | in ogni pannello | ereditata | Premium |

**Menu principale** (ordine del prompt): Cassaforte · Famiglia · Casa · Personale · Stampa / QR · Extra · Guida · Account. Il Cruscotto è la pagina iniziale; ricerca, scadenze, notifiche, selettore di casa e pulsante SOS restano sempre visibili fuori dal menu.

## 8. Sicurezza trasversale

- **Intestazioni HTTP:** @fastify/helmet 13 per l'API, Caddy per gli asset web. CSP: `default-src 'self'`; `script-src 'self' 'wasm-unsafe-eval'` (necessario per Argon2id, riconoscimento testo e scanner in WebAssembly); `connect-src` e `img-src` limitati a `'self'`, `blob:` e all'endpoint S3; `object-src 'none'`; `base-uri 'none'`; `frame-ancestors 'none'`. Inoltre HSTS, `Referrer-Policy: no-referrer`, `Permissions-Policy` con fotocamera e geolocalizzazione consentite solo alla stessa origine.
- **Rate limit:** @fastify/rate-limit 11 su Valkey; limite globale per IP e limiti stretti su accesso, 2FA, PIN, inviti, QR emergenza e webhook (valori in fase 3).
- **CORS:** @fastify/cors 11 con lista di origini consentite limitata agli host white-label registrati; il client principale è sulla stessa origine.
- **CSRF:** cookie SameSite=Lax, verifica di `Origin` e header personalizzato obbligatorio sulle richieste che modificano dati.
- **Validazione lato server:** Zod su parametri, query, corpo e header; oggetti `strict` (chiavi sconosciute rifiutate); risposte serializzate dallo schema; limiti di dimensione del corpo.
- **Log senza dati sensibili:** pino con `redact` su cookie, authorization, password, PIN, token e segreti; mai corpi delle richieste. I dati A/B non arrivano mai in chiaro al server. Indirizzi IP solo negli eventi di sicurezza, con durata di conservazione fissata in fase 2.
- **Webhook HMAC:** HMAC-SHA-256 su `timestamp + "." + corpo`; tolleranza di 5 minuti; id evento memorizzato in Valkey contro la ripetizione; confronto a tempo costante; segreto per endpoint (classe S) con due segreti attivi durante la rotazione. Vale per webhook in entrata (Home Assistant) e in uscita; i webhook di pagamento usano la firma del provider.
- **Segreti di servizio (classe S):** AES-256-GCM con chiave master da variabile d'ambiente o KMS e identificativo di versione per la rotazione.
- **SSRF** (import ricette, URL Home Assistant): nel SaaS si bloccano indirizzi privati, loopback e link-local dopo la risoluzione DNS, si limitano dimensione, tempo e redirect; nel self-host l'operatore può consentire indirizzi della rete locale.
- **Upload:** URL prefirmati vincolati per dimensione e tipo, verifica della dimensione dopo l'upload, EXIF rimossi nel browser.
- **Dipendenze:** versioni esatte nel lockfile, `pnpm audit` in CI, nessuna dipendenza aggiunta senza verifica (standard di codice).
- **Domotica:** integrazione principale tramite webhook firmati inviati da Home Assistant (adatta al SaaS, che non raggiunge la rete di casa); interrogazione diretta delle API di Home Assistant e connessione MQTT quando il server le raggiunge (tipicamente in self-host). Serrature smart in sola lettura (decisione 7 in §10).

## 9. Rinviato alle fasi 2–4

### Fase 2 — Schema database e crittografia

- Schema Drizzle completo di tutti i moduli della §7.3: vincoli, indici (GIN full-text, trigrammi), partizionamento (telemetria, registro), policy RLS tabella per tabella, ruoli database.
- Revisioni: modello dati e conservazione.
- Partita doppia: somma zero per valuta, importi interi in unità minori, tassi di cambio della Banca Centrale Europea.
- Campi personalizzati: `jsonb` per la classe C, dentro la busta cifrata per A/B.
- Crittografia: formato versionato della busta, dati associati autenticati, parametri Argon2id lato browser, etichette HKDF, rotazione delle chiavi d'ambito, flusso di rimozione di un membro, formato del backup cifrato, vettori di test.
- Modello di minaccia dettagliato e durata di conservazione dei log.

### Fase 3 — Contratti API e controllo accessi

- Catalogo degli endpoint `/api/v1` in OpenAPI 3.1: errori in formato RFC 9457 (Problem Details), paginazione a cursore, ETag/`If-Match`, chiavi di idempotenza.
- Matrice permessi completa (azione × risorsa × ruolo × ambito), regole di dettaglio per Caregiver, Ospite e kiosk.
- Assegnazione a un piano dei moduli che il prompt non vincola; valori dei limiti di frequenza per rotta; durata degli URL prefirmati.
- Schemi degli eventi WebSocket, webhook in entrata e in uscita, strumenti MCP; contratti per inviti, richieste di accesso, trasferimento di proprietà e prova Premium.

### Fase 4 — Sviluppo modulare e documentazione

- Implementazione in ordine di dipendenza:
  1. fondamenta: `identity`, `tenancy`, `access`, `keys`, `media`, `audit`;
  2. perimetro Free: `house`, `utilities`, `residents`, `emergency`, `qr`, `print`;
  3. Advanced: `vault`;
  4. Premium: `personal`, `taxes`, `succession`, `sync`, `branding`, campi personalizzati;
  5. tutti gli altri moduli delle sezioni 4–6.
- Interfaccia completa (smartphone, tablet kiosk, desktop), PWA, Web Push, i18n, wizard, Guida.
- Test unitari, di integrazione ed end-to-end; Docker Compose; `README.md` in italiano, `AGENTS.md`, `ARCHITECTURE.md`, ADR.
- Scelte operative: provider SaaS in UE, provider SMTP, configurazione del provider di pagamento. Adozione di Paraglide 3, TypeScript 7 e Drizzle 1.0 quando stabili e compatibili.

### Fuori perimetro salvo richiesta esplicita

App native negli store; apertura di serrature da remoto; invio di SMS dal server (gli SOS partono dalle app SMS/WhatsApp del telefono); accesso automatico degli eredi alla Cassaforte oltre al Kit Eredità; passkey.

## 10. Decisioni da confermare prima della fase 2

1. **Stack** delle sezioni 1–3.
2. **Offline con cache cifrata** sul dispositivo, mai fonte di verità e cancellata a logout o revoca. Supera il "nessuna cache locale dei dati" di `feature-matrix-v2.md`.
3. **Classificazione dei dati:** salute, codici di accesso e dati di pagamento illeggibili dal server (classe B); contabilità familiare leggibile dal server (classe C) per ricorrenze, budget e notifiche.
4. **Cassaforte:** sblocco con PIN solo online (offline con la frase di recupero); blocco dopo 5 errori; perdere tutti i dispositivi e la frase di recupero significa perdere i dati personali cifrati.
5. **"Sync" Premium** = aggiornamento in tempo reale tra dispositivi e membri. L'abbinamento di un nuovo dispositivo via QR resta disponibile in tutti i piani; negli altri piani i dati si aggiornano a ogni caricamento.
6. **"Smartphone nativo"** = PWA installabile con esperienza da app; nessuna app negli store.
7. **Domotica in sola lettura:** stati, consumi, allarmi e notifiche; nessun comando di apertura delle serrature.
8. **Soccorso:** schermata soccorso e chiamata al 118 in tutti i piani; i messaggi SOS via SMS/WhatsApp (Premium) partono dalle app del telefono, con modalità di prova.
9. **2FA obbligatoria** per Amministratori e Proprietario.
10. **Pagamenti SaaS con Stripe;** self-host senza fatturazione, piano impostato dall'operatore.
11. **Declassamento di piano:** i dati oltre i nuovi limiti restano leggibili ed esportabili ma non modificabili.
