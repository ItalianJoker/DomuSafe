# DomuSafe

![License](https://img.shields.io/badge/license-BSL%201.1-blue)
![Version](https://img.shields.io/badge/version-0.4.0-green)
![Stack](https://img.shields.io/badge/Next.js-App%20Router-black)
![Auth](https://img.shields.io/badge/auth-account%20%2B%20Famiglia-emerald)

## Che cos'è DomuSafe

DomuSafe è il **manuale digitale della tua casa** e un **hub di emergenza**.
Ti registri, crei una **Famiglia**, invitì i membri con link/QR, salvi utenze e schede ICE, cifri il patrimonio e stampi un foglio A4 con linguetta privacy.
I dati durevoli vivono sull’**account** (server self-host), sotto **Famiglia** o **Residente** — non in IndexedDB/localStorage.

## Avvio rapido (Docker)

```bash
docker run -d -p 3000:3000 \
  -v domusafe-data:/app/data/app \
  -v domusafe-sync:/app/data/sync \
  --name domussafe ghcr.io/italianjoker/domussafe:latest
```

Apri [http://localhost:3000](http://localhost:3000), registrati e crea la Famiglia.

### Build locale

```bash
docker build -t domusafe:local .
docker run -d -p 3000:3000 \
  -v domusafe-data:/app/data/app \
  -v domusafe-sync:/app/data/sync \
  --name domusafe domusafe:local
```

Piano ADVANCED in build:

```bash
docker build --build-arg NEXT_PUBLIC_DOMUSAFE_TIER=ADVANCED -t domusafe:advanced .
```

## Registrazione e Famiglia

1. Crea un account (email + password ≥ 8 caratteri).
2. Il primo utente **crea la Famiglia**; gli altri entrano con **invito + QR**.
3. Senza sessione non si apre il runbook.
4. Dopo un refresh serve di nuovo la password solo per sbloccare in memoria la chiave di cifratura (cookie httpOnly per la sessione).

## Cifratura (minaccia in breve)

- Prima del salvataggio, runbook / checklist / sessione sync sono cifrati nel browser (PBKDF2 100k + AES-256-GCM, IV 12 byte).
- Il server conserva **solo ciphertext** e hash password (PBKDF2).
- Livello 3 (cassaforte) ha un PIN aggiuntivo: PIN errato → *«PIN errato o dati non validi»*.
- Nessuna fonte di verità nel browser: solo cache/ephemeral in memoria.

## La filosofia dei 3 livelli

| Livello | A chi serve | Cosa contiene |
| :--- | :--- | :--- |
| **1 — Pubblico** | Ospiti, host | Acqua/gas/elettrico, Wi‑Fi, rifiuti, artigiani |
| **2 — ICE** | Soccorso 118/112 | Schede residenti (+ **checklist tasse IT**), animali |
| **3 — Cassaforte** | Famiglia / eredità | Patrimonio cifrato PIN + **checklist successione Famiglia** |

### Piani (Feature Gate)

| Funzione | BASIC | ADVANCED | PREMIUM |
| :--- | :--- | :--- | :--- |
| Abitazioni | 1 | ≤3 | illimitate |
| ICE | max 2 | illimitati | illimitati |
| Cassaforte + successione Famiglia | teaser | sì | sì |
| Sync cloud E2EE | no | sì | sì |
| Prova Premium 30 giorni | una volta / account | — | — |

## Tasse e successione

- **Tasse IT**: checklist annuale **sulla scheda residente** (CU, 730, ISEE, IMU/TARI…).
- **Successione**: checklist **per Famiglia**, accanto alla cassaforte (ADVANCED+ / trial).

## Manuale Utente / Guida DomuSafe

In-app: scheda **Manuale** (anche chiamata Guida DomuSafe). Tutorial al primo accesso.

## Variabili d'ambiente

| Variabile | Default | Descrizione |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_DOMUSAFE_TIER` | `BASIC` | Piano base self-host |
| `DOMUSAFE_DATA_DIR` | `./data/app` | Account, Famiglie, blob cifrati |
| `DOMUSAFE_SYNC_DIR` | `./data/sync` | Envelope sync E2EE |

## Licenza (BSL 1.1)

- ✅ Gratuito per self-host personale/familiare.
- ❌ Vietato SaaS commerciale a terzi (riservato all’autore).
- Dettagli in [`LICENSE.md`](./LICENSE.md).

## Sviluppo locale

```bash
pnpm install
pnpm dev
pnpm verify   # lint + typecheck + smoke + build
```

## Stack

- Next.js App Router + TypeScript + Tailwind
- Auth lean: credenziali + cookie httpOnly, store filesystem
- Web Crypto client (`crypto-auth`, `crypto-vault`, `crypto-sync`)
- Feature gate + trial Premium 30g
- Logo: `public/domusafe-logo.svg` + `src/components/DomuSafeLogo.tsx`
