# DomuSafe

![License](https://img.shields.io/badge/license-BSL%201.1-blue)
![Version](https://img.shields.io/badge/version-0.3.0-green)
![Stack](https://img.shields.io/badge/Next.js-App%20Router-black)
![Mode](https://img.shields.io/badge/sync-E2EE%20ADVANCED+-emerald)

## Che cos'è DomuSafe

DomuSafe è il **manuale digitale della tua casa** e un **hub di emergenza**.
Salvi utenze, Wi‑Fi, rifiuti e contatti utili; prepari schede sanitarie ICE per il soccorso 118/112; cifri i dati patrimoniali in una cassaforte PIN; stampi un foglio A4 con linguetta privacy.
Di base i dati restano **sul tuo dispositivo** (IndexedDB). Con piano **ADVANCED+** puoi attivare una **sync cloud cifrata end-to-end** e collegare un altro device con un QR.

## Avvio rapido (Docker, anche se non sei tecnico)

Quando l'immagine sarà pubblicata sul registry:

```bash
docker run -d -p 3000:3000 \
  -v domusafe-sync:/app/data/sync \
  --name domussafe ghcr.io/italianjoker/domussafe:latest
```

Poi apri il browser su [http://localhost:3000](http://localhost:3000): il tuo manuale è pronto.
La cartella montata conserva i backup sync **già cifrati** (il server non legge i tuoi dati in chiaro).

### Build locale dell'immagine

```bash
docker build -t domusafe:local .
docker run -d -p 3000:3000 -v domusafe-sync:/app/data/sync --name domusafe domusafe:local
```

Per costruire un'immagine con piano ADVANCED (la variabile è incorporata in build):

```bash
docker build --build-arg NEXT_PUBLIC_DOMUSAFE_TIER=ADVANCED -t domusafe:advanced .
docker run -d -p 3000:3000 \
  -e DOMUSAFE_SYNC_DIR=/app/data/sync \
  -v domusafe-sync:/app/data/sync \
  --name domusafe domusafe:advanced
```

## La filosofia dei 3 livelli

| Livello | A chi serve | Cosa contiene |
| :--- | :--- | :--- |
| **1 — Pubblico** | Ospiti, host, vicini | Acqua/gas/elettrico, caldaia, Wi‑Fi, rifiuti, artigiani |
| **2 — ICE** | Soccorso 118/112 | Schede residenti, allergie, farmaci, contatti, animali |
| **3 — Cassaforte** | Famiglia / eredità | Dati patrimoniali cifrati (PIN) — piani ADVANCED+ |

### Piani (Feature Gate)

| Funzione | BASIC (predefinito) | ADVANCED | PREMIUM |
| :--- | :--- | :--- | :--- |
| Abitazioni | 1 | fino a 3 | illimitate |
| Livello 2 ICE | max 2 residenti | illimitati | illimitati |
| Livello 3 cassaforte | bloccato | AES-256-GCM | AES-256-GCM |
| Sync cloud E2EE + QR multi-device | solo locale | incluso | incluso (+ versioning storico più avanti) |
| Stampa A4 | con watermark | senza watermark + privacy flap | senza watermark (+ white-label più avanti) |

## Sync cloud E2EE (ADVANCED+)

1. Imposta il piano `ADVANCED` o `PREMIUM`.
2. Nella scheda **Sync**, tocca **Crea sync + QR**: DomuSafe cifra le case sul dispositivo e invia solo il ciphertext all’API locale `/api/sync/…`.
3. Inquadra il QR dall’altro device (stessa installazione) oppure incolla il codice `ds1.…`.
4. Opzionale: un **PIN sync** permette il ripristino senza QR (chiave derivata con PBKDF2; PIN errato → *«Chiave sync errata o dati non validi»*).

Il server **non** decifra nulla: salva file JSON opachi in `DOMUSAFE_SYNC_DIR` con un contatore `revision` per conflitti semplici.

## Variabili d'ambiente

| Variabile | Default | Descrizione |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_DOMUSAFE_TIER` | `BASIC` | Piano self-host: `BASIC`, `ADVANCED` o `PREMIUM`. Usare `ADVANCED` per multi-casa, cassaforte e sync E2EE. |
| `DOMUSAFE_SYNC_DIR` | `./data/sync` | Cartella server per gli envelope cifrati. In Docker: `/app/data/sync` (montare un volume). |

Esempio `.env.local`:

```bash
NEXT_PUBLIC_DOMUSAFE_TIER=ADVANCED
DOMUSAFE_SYNC_DIR=./data/sync
```

Poi `pnpm dev` (o rebuild). Il piano viene applicato ai documenti locali al caricamento.

## Licenza (BSL 1.1)

- ✅ Gratuito per sempre per installazioni personali, famiglie e self-hosting.
- ❌ Vietato l'uso commerciale come servizio Cloud/SaaS a terzi (riservato all'autore).
- Dopo la Change Date la versione passa ad **Apache 2.0**. Dettagli in [`LICENSE.md`](./LICENSE.md).

## Sviluppo locale

Requisiti: Node.js 22+, [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev
```

Apri [http://localhost:3000](http://localhost:3000).

Altri comandi:

```bash
pnpm build     # build di produzione
pnpm start     # avvia la build
pnpm lint      # ESLint
pnpm typecheck # TypeScript
pnpm smoke     # smoke critici (licensing, vault, sync E2EE, IndexedDB, print)
pnpm verify    # lint + typecheck + smoke + build
```

## Stack

- Next.js App Router + TypeScript + Tailwind CSS
- `lucide-react` (icone tree-shaken)
- Web Crypto (PBKDF2 + AES-GCM) in `src/lib/crypto-vault.ts` e `src/lib/crypto-sync.ts`
- Sync self-host: `src/app/api/sync/[syncId]/route.ts` + `src/lib/sync-server.ts` (filesystem, zero DB)
- Feature gate in `src/lib/licensing.ts` + `src/components/FeatureGate.tsx`
- Persistenza multi-casa `idb-keyval` / IndexedDB
- QR SVG leggero (`qrcode`) per accesso e pairing multi-device

## Privacy

Piano BASIC: i dati non lasciano il browser.
ADVANCED+: la sync invia **solo ciphertext**; la chiave resta nel QR/hash locale o nel PIN sync.
La cassaforte Livello 3 è cifrata con PIN: un PIN errato mostra *«PIN errato o dati non validi»* senza crash.
La stampa nasconde le schede ICE sotto una **linguetta da piegare/sigillare**, da aprire solo per il soccorso sanitario.
