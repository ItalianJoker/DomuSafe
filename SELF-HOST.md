# DomuSafe — installazione self-host

Guida operativa per chi gestisce il server. Per l’uso quotidiano dell’app vedi [`README.md`](./README.md).

## Immagine Docker

Il `Dockerfile` produce un’immagine Next.js **standalone** pronta per produzione.

Con Compose (consigliato):

```bash
docker compose up -d --build
```

Oppure a mano:

```bash
docker build -t domusafe:local .
docker run -d --name domusafe \
  -p 3000:3000 \
  -v domusafe-app:/app/data/app \
  -v domusafe-sync:/app/data/sync \
  -e NEXT_PUBLIC_DOMUSAFE_TIER=FREE \
  domusafe:local
```

Apri il browser su `http://localhost:3000`. I volumi conservano account/Famiglia (ciphertext) e gli envelope di sync.

### Piano incorporato in build

`NEXT_PUBLIC_DOMUSAFE_TIER` (argomento di build / variabile): `FREE` · `BASIC` · `ADVANCED` · `PREMIUM`.  
Il default self-host è **Free**. In app ogni account può comunque avviare la prova Premium di 30 giorni.

## Variabili d’ambiente

| Variabile | Uso |
| :--- | :--- |
| `DOMUSAFE_DATA_DIR` | Directory account/Famiglia (default in container: `/app/data/app`) |
| `DOMUSAFE_SYNC_DIR` | Directory envelope sync E2EE (default: `/app/data/sync`) |
| `NEXT_PUBLIC_DOMUSAFE_TIER` | Piano self-host di default (`FREE` consigliato) |
| `DOMUSAFE_LICENSE_PUBLIC_KEY` | Chiave pubblica Ed25519 (PEM SPKI o Base64 DER) per verificare JWT SaaS |
| `DOMUSAFE_LICENSE_PRIVATE_KEY` | Solo tooling di emissione (non serve al runtime dell’app) |
| `DOMUSAFE_SOS_PROVIDER` | `log` (predefinito), `webhook`, `twilio` |
| `DOMUSAFE_SOS_WEBHOOK_URL` | URL webhook SOS |
| `DOMUSAFE_SOS_WEBHOOK_TOKEN` | Bearer opzionale per il webhook |
| `DOMUSAFE_TWILIO_ACCOUNT_SID` | Account Twilio |
| `DOMUSAFE_TWILIO_AUTH_TOKEN` | Token Twilio |
| `DOMUSAFE_TWILIO_FROM_NUMBER` | Mittente SMS (es. `+39…`) |
| `DOMUSAFE_TWILIO_WHATSAPP_FROM` | Mittente WhatsApp (es. `whatsapp:+14155238886`) |

Nessun SDK a pagamento obbligatorio: il provider SOS usa solo `fetch`.

### Chiavi licenza SaaS (JWT / Ed25519)

Se imposti `DOMUSAFE_LICENSE_PUBLIC_KEY`, gli utenti possono attivare una chiave JWT firmata EdDSA dalla sezione **Piano**. Claim minimi: `tier`, `issuedTo`, `iat`; opzionali `exp` e `sub` (email account). Senza chiave pubblica il server rifiuta le chiavi SaaS (self-host resta su env + prova Premium).

## Pubblicazione su GHCR

Il workflow [`.github/workflows/ghcr.yml`](./.github/workflows/ghcr.yml) pubblica su:

`ghcr.io/<owner>/domusafe:latest`

(al push su `main` e sui tag `v*`). Serve il permesso `packages:write` sul token del workflow. Se la pubblicazione automatica non è abilitata sul repository, costruisci e pubblica a mano:

```bash
docker build -t ghcr.io/<owner>/domusafe:latest .
echo $CR_PAT | docker login ghcr.io -u <user> --password-stdin
docker push ghcr.io/<owner>/domusafe:latest
```

Esempio di avvio da registro:

```bash
docker run -d -p 3000:3000 \
  -v domusafe-app:/app/data/app \
  -v domusafe-sync:/app/data/sync \
  --name domusafe \
  ghcr.io/<owner>/domusafe:latest
```

## Sviluppo locale (programmatori)

```bash
pnpm install
pnpm dev
```

Verifica completa: `pnpm verify` (lint, typecheck, smoke, build).
