# DomuSafe — installazione (SaaS / self-host)

Guida operativa per chi gestisce il server. Per l’uso quotidiano dell’app vedi [`README.md`](./README.md).

## Avvio consigliato (Compose + Postgres)

I dati durevoli (account, Famiglia, blob cifrati, sync) stanno su **Postgres**, non su file locali. Il `Dockerfile` e `docker-compose.yml` nella root costruiscono app + database.

```bash
docker compose up -d --build
```

Apri il browser su `http://localhost:3000`.

Serve la variabile `DATABASE_URL` (Compose la imposta verso il servizio `db`).

### Piano incorporato in build

`NEXT_PUBLIC_DOMUSAFE_TIER` (argomento di build / variabile): `FREE` · `BASIC` · `ADVANCED` · `PREMIUM`.  
Il default è **Free**. In app ogni account può comunque avviare la prova Premium di 30 giorni.

## Variabili d’ambiente

| Variabile | Uso |
| :--- | :--- |
| `DATABASE_URL` | **Obbligatoria.** Connessione Postgres (fonte di verità SaaS) |
| `NEXT_PUBLIC_DOMUSAFE_TIER` | Piano di default (`FREE` consigliato) |
| `DOMUSAFE_LICENSE_PUBLIC_KEY` | Chiave pubblica Ed25519 (PEM SPKI o Base64 DER) per verificare JWT SaaS |
| `DOMUSAFE_LICENSE_PRIVATE_KEY` | Solo tooling di emissione (non serve al runtime dell’app) |
| `DOMUSAFE_SOS_PROVIDER` | `log` (predefinito), `webhook`, `twilio` |
| `DOMUSAFE_SOS_WEBHOOK_URL` | URL webhook avvisi di soccorso |
| `DOMUSAFE_SOS_WEBHOOK_TOKEN` | Bearer opzionale per il webhook |
| `DOMUSAFE_TWILIO_ACCOUNT_SID` | Account Twilio |
| `DOMUSAFE_TWILIO_AUTH_TOKEN` | Token Twilio |
| `DOMUSAFE_TWILIO_FROM_NUMBER` | Mittente SMS (es. `+39…`) |
| `DOMUSAFE_TWILIO_WHATSAPP_FROM` | Mittente WhatsApp (es. `whatsapp:+14155238886`) |

Nessun SDK a pagamento obbligatorio: il provider di soccorso usa solo `fetch`.

Lo schema Postgres viene creato automaticamente all’avvio (tabelle account, famiglie, sessioni, blob cifrati, sync).

### Chiavi licenza SaaS (JWT / Ed25519)

Se imposti `DOMUSAFE_LICENSE_PUBLIC_KEY`, gli utenti possono attivare una chiave JWT firmata EdDSA dalla sezione **Piano**. Claim minimi: `tier`, `issuedTo`, `iat`; opzionali `exp` e `sub` (email account). Senza chiave pubblica il server rifiuta le chiavi SaaS (resta su env + prova Premium).

## Pubblicazione su GHCR

Il workflow [`.github/workflows/ghcr.yml`](./.github/workflows/ghcr.yml) pubblica su:

`ghcr.io/<owner>/domusafe:latest`

(al push su `main` e sui tag `v*`). Serve il permesso `packages:write` sul token del workflow.

## Sviluppo locale

```bash
# Postgres in esecuzione (es. docker compose up -d db)
export DATABASE_URL=postgres://domusafe:domusafe@127.0.0.1:5432/domusafe
pnpm install
pnpm dev
```

Verifica: `pnpm verify` (richiede Postgres raggiungibile via `DATABASE_URL`).
