# Architettura di DomuSafe Suite

Documento di riferimento per persone e agenti AI. Le specifiche complete sono in [`docs/design/`](docs/design/); qui c'è la mappa del codice esistente e le regole che lo tengono coerente.

## Mappa del repository

```text
apps/
  api/                 Fastify 5: /api/v1 (REST, OpenAPI 3.1), /api/auth (Better Auth)
  web/                 PWA React: shell, token, componenti condivisi, sezioni
    src/app.ts         composizione: plugin di sicurezza, accesso, idempotenza, OpenAPI, moduli
    src/auth/          Better Auth (email e password Argon2id, TOTP, sessioni su database)
    src/http/          Problem Details (RFC 9457), convenzioni ETag/If-Match, cursori
    src/plugins/       security (helmet, rate limit, CSRF), access, idempotency, openapi, auth-routes
    src/modules/       un modulo per area: routes.ts · service.ts · repository.ts · policy.ts
    openapi.json       contratto generato, verificato in CI
packages/
  config/              preset TypeScript, ESLint, Vitest condivisi
  contracts/           schemi Zod, codici di errore, catalogo permessi e matrice dei ruoli
  crypto/              formati cifrati, gerarchia delle chiavi, PIN, frase di recupero, segreti S1
  db/                  migrazioni SQL, RLS, funzioni di contesto, specchio Drizzle, contesto transazionale
  plans/               piani, limiti, funzioni, prova Premium
infra/compose.dev.yml  PostgreSQL 18 e Valkey 9 per lo sviluppo
legacy/next-app/       applicazione precedente, in sola consultazione
docs/design/           fasi 1–3 approvate, prompt master, standard di codice
docs/adr/              decisioni architetturali
```

## Ciclo di una richiesta

1. **onRequest** — `security`: intestazioni helmet, limite di frequenza (Valkey in produzione), difesa CSRF: sulle scritture `/api/v1/*` servono `X-DomuSafe-Request: 1` e un `Origin` consentito; sulle scritture `/api/auth/*` un `Origin` consentito.
2. **Validazione** — schemi Zod della rotta (`fastify-type-provider-zod`): corpo, parametri e query rigorosi; risposte serializzate dallo schema, così un campo non dichiarato non esce mai.
3. **preHandler `access`** — sessione Better Auth → per le rotte `family`: appartenenza attiva (altrimenti `404`), permesso del catalogo (`403 forbidden`), 2FA per i permessi di amministrazione (`403 two_factor_setup_required`), funzione del piano (`403 plan_required`). Il risultato è `request.tenant`.
4. **preHandler `idempotency`** — sulle rotte `idempotent`: prenota la `Idempotency-Key`, poi ripete la risposta salvata o rifiuta i riutilizzi.
5. **Handler** → **service** del modulo: unico punto che apre transazioni con `withContext(db, { principal, familyId }, …)`; scrive revisioni e registro attività nella stessa transazione.
6. **Errori** — ogni errore esce come `application/problem+json` con `code` stabile (`packages/contracts/src/problems.ts`).

## Isolamento dei dati

- L'API si connette come `domusafe_app` (senza `BYPASSRLS`). Ogni transazione imposta con `SET LOCAL` `app.principal`, `app.account_id`, `app.kiosk_id`, `app.family_id` (solo in `packages/db/src/context.ts`).
- Le policy RLS (`packages/db/migrations/0007_policies.sql`) combinano una policy permissiva di tenant con policy restrittive: casa (H), residente (R), dati personali (P), ruolo (Q), kiosk (K). Le funzioni `app.*` di tipo `security definer` leggono le appartenenze e sono richiamate dentro `(select …)` per essere valutate una sola volta per istruzione.
- Ogni riferimento tra righe di famiglia è una chiave esterna composta `(family_id, id)`.
- Registro attività, eventi di sicurezza e revisioni sono append-only per privilegi (`SELECT, INSERT`).

## Confine crittografico

- `packages/crypto` gira identico nel browser e in Node (solo Web Crypto più Argon2id in WebAssembly).
- Formati: `DS-ENV v1` (busta), `DS-GRANT v1` (concessione ECIES P-256), `DS-STREAM v1` (file a blocchi), `S1` (segreti del server). Dati associati costruiti solo da `aad.*`; etichette HKDF solo da `HKDF_LABELS`.
- I vettori della fase 2 (§11) sono test automatici in `packages/crypto/test`.
- Il server conserva per i dati A/B solo testo cifrato e metadati strutturali (fase 2 §9).

## Database e migrazioni

- Le migrazioni sono SQL scritto a mano in `packages/db/migrations/NNNN_nome.sql`, applicate da `domusafe-db migrate` come `domusafe_owner`, una transazione per file, con checksum: un file già applicato non si modifica, si aggiunge una nuova migrazione.
- `packages/db/src/schema/*` è lo specchio Drizzle per le query tipizzate; il test di deriva confronta tabelle e colonne con il database reale.
- Le tabelle partizionate (`audit_events`, `security_events`) hanno partizioni mensili create da `app.ensure_partitions()` ed eliminate da `app.drop_expired_partitions()` secondo la conservazione della fase 2.

## Test

- Unitari: `crypto`, `plans`, `contracts`.
- Integrazione su PostgreSQL 18 reale: `db` (RLS, vincoli, partizioni, deriva) e `api` (flussi HTTP completi con Better Auth). Una configurazione globale crea un database modello migrato; ogni file di test ne clona uno nuovo.
- Variabile richiesta: `DATABASE_ADMIN_URL` (superutente). In CI è un servizio `postgres:18.6`.

## Moduli presenti

| Modulo       | Rotte                                        | Note                                                                                                                                        |
| :----------- | :------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ |
| `system`     | `GET /api/v1/health`, `GET /api/v1/ready`    | prontezza: database e archivio chiave-valore                                                                                                |
| `identity`   | `GET /api/v1/me`, `PATCH /api/v1/me/profile` | profilo creato alla registrazione (hook di Better Auth)                                                                                     |
| `tenancy`    | famiglie, case, membri                       | limiti di piano sotto `SELECT … FOR UPDATE`, revisioni delle case, rotazione delle chiavi segnalata alla rimozione o riduzione di un membro |
| `house`      | manuale, chiusure, utenze, manutenzioni      | Casa della casa aperta, senza funzione di piano                                                                                             |
| `personale`  | residenti, soccorso, animali, servizi, tasse | scheda di soccorso leggibile; tasse e conti personali solo con Premium o prova                                                              |
| `vault`      | codice, frase di recupero, documenti cifrati | Cassaforte di famiglia: Argon2id e buste nel browser; il server conserva solo testo cifrato. Avanzato, Premium o prova                      |
| `succession` | checklist di successione della famiglia      | Attività compilate a mano e kit eredità stampato nel browser. Non legge la Cassaforte. Premium o prova di trenta giorni                     |
| `print`      | codici stampati e pagine pubbliche           | Foglio da parete e foglio di soccorso. Il codice di soccorso si apre senza accesso e si può revocare. Filigrana su Gratuito e Base          |

I moduli successivi seguono l'ordine della fase 3 §12.

## Interfaccia

Vincolante per tutta l'applicazione, non solo per la prima schermata. Vedi anche [ADR 0005](docs/adr/0005-interfaccia.md).

- **Linguaggio visivo** ispirato a Linear: denso, calmo, preciso. Il tema scuro è la tavolozza di base, progettata per prima; il tema chiaro è una variante completa. La preferenza dell'account è chiara, scura o automatica e sta in `data-theme` sul documento. I token sono variabili CSS in `apps/web/src/styles/app.css`. I componenti usano i colori semantici e non si biforcano sul tema.
- **Componenti** copiati nel repository secondo il modello shadcn/ui (primitive Radix, Tailwind, `class-variance-authority`): `apps/web/src/components/ui`. Non si aggiunge una libreria di componenti a runtime e non si introduce un secondo sistema visivo. Il lint rifiuta `@radix-ui/*` fuori da quella cartella. Un modulo nuovo importa da lì (`@/components/ui/button` e gli altri) e, se gli serve un controllo che non c'è, lo aggiunge nello stesso modo, con lo stesso file `components.json`.
- **Shell** `AppShell`: menu, selettori di famiglia e casa, contenuto. Una sezione nuova è una rotta figlia di `/f/$familyId/c/$houseId` e una voce in `apps/web/src/lib/navigation.ts` (`SECTIONS` e `NAV_LINKS` insieme). Non si costruisce un altro telaio.
- **Densità e sicurezza.** I controlli ordinari restano compatti (altezza 32 pixel). Le azioni di soccorso e di sicurezza usano `Button` con `size="emergency"`, almeno 48 pixel. Non si allarga tutta l'interfaccia a quella misura.
- **Testi** solo tramite Paraglide (`apps/web/messages/it.json` e `en.json`). Italiano predefinito, senza acronimi.
- La fase 1 indicava React Aria. La direzione confermata dopo è questa: stessi principi di accessibilità, altro sistema di componenti.
