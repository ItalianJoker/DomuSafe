# Istruzioni per agenti e sviluppatori

Regole vincolanti per chi modifica questo repository, persona o agente AI. In caso di dubbio prevalgono gli standard in [`docs/design/coding-standards.md`](docs/design/coding-standards.md) e le fasi approvate in [`docs/design/`](docs/design/).

## Prima di consegnare

```bash
export DATABASE_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres   # PostgreSQL 18
pnpm verify
```

`pnpm verify` esegue formattazione, controllo dei tipi, lint, test unitari e di integrazione e verifica che `apps/api/openapi.json` corrisponda al codice. Dopo una modifica alle rotte: `pnpm openapi:write`.

## Regole di codice

- TypeScript `strict` con `exactOptionalPropertyTypes` e `noUncheckedIndexedAccess`; solo ESM; import relativi con estensione `.js`.
- Nessun segnaposto, `TODO`, stub o dipendenza non verificata; versioni esatte in `package.json`.
- Ogni simbolo esportato da `src/` ha TSDoc con scopo, precondizioni, postcondizioni e contratto dei dati (il lint lo impone).
- Identificatori e TSDoc in inglese; testi per l'utente solo tramite i18n, in italiano senza acronimi.
- **Interfaccia:** linguaggio visivo denso e calmo (tema scuro progettato per primo, chiaro e automatico) e un solo kit in `apps/web/src/components/ui` (modello shadcn/ui: Radix + Tailwind, componenti copiati). Vietato un secondo kit o importare `@radix-ui/*` fuori da quella cartella. Le sezioni nuove passano dalla shell e da `apps/web/src/lib/navigation.ts`. I controlli di soccorso usano `size="emergency"` (almeno 48 pixel). Dettaglio in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Regole di architettura

- **Contratti:** ogni schema di richiesta e risposta sta in `packages/contracts` (Zod) con `.strict()` sugli oggetti; le rotte non definiscono schemi propri salvo intestazioni e wrapper.
- **Moduli:** `routes.ts` (HTTP) → `service.ts` (casi d'uso, unico punto che apre transazioni) → `repository.ts` (unico punto che usa Drizzle). Un modulo non importa il repository di un altro (lint).
- **Accesso:** ogni rotta dichiara `config.access` (`public`, `account`, `family`); le rotte `family` dichiarano `config.permission` dal catalogo `PERMISSION_MATRIX` e, se serve, `config.planFeature`. Le creazioni dichiarano `config.idempotent: true`.
- **Database:** mai connettersi come proprietario dall'applicazione; mai impostare variabili `app.*` fuori da `packages/db/src/context.ts`; ogni nuova tabella di dominio ha RLS, chiavi esterne composte `(family_id, …)` e il suo specchio Drizzle (il test di deriva fallisce altrimenti).
- **Migrazioni:** solo nuovi file `NNNN_nome.sql`; mai modificare un file già rilasciato.
- **Concorrenza:** le risorse versionate usano `version`, `ETag` e `If-Match`; conflitto `409 version_conflict` con `currentVersion`.
- **Errori:** solo `ProblemError` con codici del catalogo chiuso; mai messaggi del database verso il client.
- **Crittografia:** i dati A/B si cifrano nel browser con `packages/crypto`; il server non riceve mai chiavi in chiaro, PIN o frasi di recupero. Nuove etichette HKDF o nuovi formati sono una decisione architetturale (ADR).
- **Log:** mai corpi delle richieste, cookie, token, password, PIN o segreti; gli indirizzi IP solo in `security_events`.

## Dove si trova cosa

| Cerco                                   | File                                                                    |
| :-------------------------------------- | :---------------------------------------------------------------------- |
| Matrice dei permessi                    | `packages/contracts/src/access.ts`                                      |
| Codici di errore                        | `packages/contracts/src/problems.ts`                                    |
| Limiti e funzioni dei piani             | `packages/plans/src/index.ts`                                           |
| Policy RLS e funzioni `app.*`           | `packages/db/migrations/0006_access_functions.sql`, `0007_policies.sql` |
| Contesto transazionale                  | `packages/db/src/context.ts`                                            |
| Formati cifrati e vettori               | `packages/crypto/src/formats.ts`, `packages/crypto/test/vectors.ts`     |
| Hook di autenticazione e autorizzazione | `apps/api/src/plugins/access.ts`                                        |
| Interfaccia, token, shell               | `apps/web/src/components/ui`, `apps/web/src/styles/app.css`             |
| Registro letture dei codici pubblici    | `packages/db/migrations/0013_publication_readings.sql`                  |
