# DomuSafe

DomuSafe è il cruscotto completo per la casa, la famiglia e le persone che ci vivono: manuale della casa per ospiti e tecnici, utenze e scadenze, schede di emergenza, Cassaforte per i documenti importanti, calendario, cucina, finanze di famiglia. È pensato per essere semplice da usare per tutti, anche in un momento di emergenza.

Questo repository contiene **DomuSafe Suite**, la nuova versione costruita da zero, e conserva l'applicazione precedente in [`legacy/next-app/`](legacy/next-app/) finché la Suite non ne avrà raggiunto tutte le funzioni.

## Cosa protegge DomuSafe

- **I dati più delicati restano tuoi.** I documenti della Cassaforte, i codici di accesso e i dati di pagamento vengono cifrati sul dispositivo prima di essere salvati. La scheda di soccorso è leggibile dalle persone della famiglia autorizzate, così si può usare in un momento di emergenza.
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

L'interfaccia web è installabile e parla con questa API: accesso, creazione della famiglia, elenco e cambio casa, tema chiaro, scuro o automatico. Il cruscotto raggruppa le scadenze in scadute, questa settimana e questo mese: controllo caldaia, date dei veicoli, voci fiscali che hanno una data e, solo se è una data vera, il promemoria di successione. Un lavoro di manutenzione si aggiunge a mano (titolo, data, fatto) e resta nel database. Dal cruscotto e da Personale si apre la schermata di soccorso a tutto schermo: chiusure di acqua, gas e luce, scheda essenziale di chi vive in casa e chiamata al soccorso sanitario. Non mostra la Cassaforte né i numeri di conto. Le otto sezioni del menu sono percorsi veri. Famiglia, Casa, Personale, Cassaforte e Stampa e codice si usano già. In Famiglia, la checklist di successione si compila a mano: documenti, testamento, notaio, titoli di proprietà, dichiarazione entro dodici mesi e volture delle utenze. Il kit eredità si stampa dal browser e non contiene i documenti della Cassaforte. Modifica e stampa sono nel piano Premium, anche durante la prova di trenta giorni; gli altri piani vedono solo la spiegazione. In Cassaforte i documenti della famiglia si cifrano sul dispositivo con un codice dedicato; i piani Gratuito e Base vedono solo la spiegazione, mentre Avanzato, Premium e la prova di trenta giorni possono compilarli. Da Stampa e codice si preparano il foglio da parete e il foglio di soccorso: i piani Gratuito e Base portano la filigrana, Avanzato e Premium no. In Extra, chi può modificare la casa e ha Premium, oppure la prova di trenta giorni, vede il registro delle letture dei codici pubblici, dalla più recente, insieme all'ultima lettura già mostrata in Stampa e codice. Gratuito, Base e Avanzato vedono solo la spiegazione. In Account, l'amministratore con Premium o durante la prova di trenta giorni può scegliere il nome della casa, un colore, una frase di benvenuto e un logo piccolo: compaiono sul foglio da parete, sul foglio di soccorso e sulle pagine pubbliche. Gratuito e Base tengono il marchio DomuSafe sui fogli. Avanzato non mostra quel marchio e non ha un marchio proprio. Nel registro restano l'orario, il tipo di codice e, se il browser lo invia, un'etichetta breve del dispositivo: niente dati sanitari, niente contenuti della cassaforte, niente numeri di conto. Dettaglio visivo in [`ARCHITECTURE.md`](ARCHITECTURE.md).

I prossimi passi (chiavi e dispositivi, poi casa, utenze, residenti, emergenza e stampa) seguono l'ordine della [fase 3, §12](docs/design/phase-3-api-rbac.md) e riusano la stessa shell.

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

Interfaccia, in un altro terminale (il server di sviluppo inoltra `/api` all'API; aggiungi `http://localhost:5173` a `TRUSTED_ORIGINS`):

```bash
pnpm --filter @domusafe/web dev
```

Guide per lo sviluppo: [`ARCHITECTURE.md`](ARCHITECTURE.md) (come è fatto il sistema) e [`AGENTS.md`](AGENTS.md) (regole operative per persone e agenti AI). Le decisioni architetturali sono in [`docs/adr/`](docs/adr/).

## Licenza

Vedi [`LICENSE.md`](LICENSE.md).
