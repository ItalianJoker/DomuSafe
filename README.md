# DomuSafe

![License](https://img.shields.io/badge/license-BSL%201.1-blue)
![Version](https://img.shields.io/badge/version-0.2.0-green)
![Stack](https://img.shields.io/badge/Next.js-App%20Router-black)
![Mode](https://img.shields.io/badge/offline-ADVANCED%20unlocks-emerald)

## Che cos'è DomuSafe

DomuSafe è il **manuale digitale della tua casa** e un **hub di emergenza**.
Salvi utenze, Wi‑Fi, rifiuti e contatti utili; prepari schede sanitarie ICE per il soccorso 118/112; cifri i dati patrimoniali in una cassaforte PIN; stampi un foglio A4 con linguetta privacy.
I dati restano **sul tuo dispositivo** (IndexedDB) — niente account obbligatorio.

## Avvio rapido (Docker, anche se non sei tecnico)

Quando l'immagine sarà pubblicata sul registry:

```bash
docker run -d -p 3000:3000 --name domusafe ghcr.io/italianjoker/domusafe:latest
```

Poi apri il browser su [http://localhost:3000](http://localhost:3000): il tuo manuale è pronto.

### Build locale dell'immagine

```bash
docker build -t domusafe:local .
docker run -d -p 3000:3000 --name domusafe domusafe:local
```

Per costruire un'immagine con piano ADVANCED (la variabile è incorporata in build):

```bash
docker build --build-arg NEXT_PUBLIC_DOMUSAFE_TIER=ADVANCED -t domusafe:advanced .
docker run -d -p 3000:3000 --name domusafe domusafe:advanced
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
| Stampa A4 | con watermark | senza watermark + privacy flap | senza watermark (+ white-label più avanti) |

## Variabili d'ambiente

| Variabile | Default | Descrizione |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_DOMUSAFE_TIER` | `BASIC` | Piano self-host: `BASIC`, `ADVANCED` o `PREMIUM`. Usare `ADVANCED` per sbloccare multi-casa, ICE illimitati e cassaforte Livello 3 in test. |

Esempio `.env.local`:

```bash
NEXT_PUBLIC_DOMUSAFE_TIER=ADVANCED
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
pnpm smoke     # smoke critici (licensing, multi-casa, IndexedDB, vault PIN, print CSS)
pnpm verify    # lint + typecheck + smoke + build
```

## Stack

- Next.js App Router + TypeScript + Tailwind CSS
- `lucide-react` (icone tree-shaken)
- Web Crypto (PBKDF2 + AES-GCM) in `src/lib/crypto-vault.ts`
- Feature gate in `src/lib/licensing.ts` + `src/components/FeatureGate.tsx`
- Cassaforte UI in `src/components/Level3VaultPanel.tsx`
- Persistenza multi-casa `idb-keyval` / IndexedDB
- QR SVG leggero (`qrcode`)

## Privacy

I dati non lasciano il browser (piano offline). La cassaforte Livello 3 è cifrata con PIN: un PIN errato mostra *«PIN errato o dati non validi»* senza crash.
La stampa nasconde le schede ICE sotto una **linguetta da piegare/sigillare**, da aprire solo per il soccorso sanitario.
