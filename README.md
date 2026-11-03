# DomuSafe

DomuSafe è il cruscotto completo per la casa, la famiglia e le persone che ci vivono: manuale della casa per ospiti e tecnici, utenze e scadenze, schede di emergenza, Cassaforte per i documenti importanti, calendario, cucina, finanze di famiglia. È pensato per essere semplice da usare per tutti, anche in un momento di emergenza.

Questo repository contiene **DomuSafe Suite**, la nuova versione costruita da zero, e conserva l'applicazione precedente in [`legacy/next-app/`](legacy/next-app/) finché la Suite non ne avrà raggiunto tutte le funzioni.

## Cosa protegge DomuSafe

- **I dati più delicati restano tuoi.** Cassaforte, schede sanitarie, codici di accesso e dati di pagamento vengono cifrati sul tuo dispositivo prima di essere salvati: il server conserva solo contenuti illeggibili.
- **Ogni famiglia è separata dalle altre**, anche a livello di database: un errore del programma non può mostrare i dati di un'altra famiglia.
- **Ognuno vede solo ciò che gli serve.** Amministratore, Genitore, Figlio, Caregiver e Ospite hanno permessi diversi; l'Ospite vede solo la casa che gli è stata affidata e solo fino alla scadenza.
- **Ogni modifica è registrata** e si può tornare a una versione precedente.

## Stato della ricostruzione

La Suite procede in quattro fasi, ciascuna documentata in [`docs/design/`](docs/design/):

| Fase | Contenuto                                                            | Stato                           |
| :--- | :------------------------------------------------------------------- | :------------------------------ |
| 1    | [Stack e architettura](docs/design/phase-1-stack-architecture.md)    | approvata                       |
| 2    | [Database e crittografia](docs/design/phase-2-database-crypto.md)    | approvata                       |
| 3    | [Contratti API e controllo accessi](docs/design/phase-3-api-rbac.md) | approvata                       |
| 4    | Sviluppo modulare                                                    | in corso: fondamenta completate |

Le **fondamenta** già disponibili:

- registrazione e accesso con email e password, verifica in due passaggi;
- famiglie, case e membri con ruoli, ambiti e limiti del piano (Free, Basic, Advanced, Premium);
- isolamento tra famiglie, case e persone direttamente nel database;
- registro attività e storico delle versioni;
- crittografia lato dispositivo pronta per Cassaforte e dati sensibili (formati, chiavi, PIN, frase di recupero);
- documentazione dell'interfaccia di programmazione consultabile su `/api/v1/docs`.

I prossimi passi (chiavi e dispositivi, poi casa, utenze, residenti, emergenza, QR e stampa) seguono l'ordine della [fase 3, §12](docs/design/phase-3-api-rbac.md).

## Per chi sviluppa

Requisiti: Node.js 26, pnpm 12, PostgreSQL 18 (e Valkey 9 in produzione).

```bash
pnpm install
docker compose -f infra/compose.dev.yml up -d        # PostgreSQL 18 e Valkey 9 locali
export DATABASE_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres
pnpm verify                                          # formattazione, tipi, lint, test, contratto OpenAPI
```

Avvio dell'API in sviluppo:

```bash
export PGURL=postgres://postgres:postgres@localhost:5432
DATABASE_MIGRATION_URL=$PGURL/postgres DOMUSAFE_APP_DB_PASSWORD=change-me pnpm db:roles   # ruoli, una volta
createdb -h localhost -U postgres -O domusafe_owner domusafe                               # database di proprietà di domusafe_owner
DATABASE_MIGRATION_URL=$PGURL/domusafe pnpm db:migrate                                    # schema, RLS, funzioni
cp apps/api/.env.example apps/api/.env                                                    # poi imposta chiavi e indirizzi
pnpm --filter @domusafe/api dev
```

Guide per lo sviluppo: [`ARCHITECTURE.md`](ARCHITECTURE.md) (come è fatto il sistema) e [`AGENTS.md`](AGENTS.md) (regole operative per persone e agenti AI). Le decisioni architetturali sono in [`docs/adr/`](docs/adr/).

## Licenza

Vedi [`LICENSE.md`](LICENSE.md).
