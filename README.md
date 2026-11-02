# DomuSafe

![License](https://img.shields.io/badge/license-BSL%201.1-blue)
![Version](https://img.shields.io/badge/version-0.1.0-green)
![Stack](https://img.shields.io/badge/Next.js-App%20Router-black)
![Mode](https://img.shields.io/badge/offline-BASIC%20MVP-emerald)

## Che cos'è DomuSafe

DomuSafe è il **manuale digitale della tua casa** e un **hub di emergenza**.
Salvi utenze, Wi‑Fi, rifiuti e contatti utili; prepari schede sanitarie ICE per il soccorso 118/112; stampi un foglio A4 con linguetta privacy.
I dati del piano BASIC restano **sul tuo dispositivo** (IndexedDB) — niente account obbligatorio.

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

## La filosofia dei 3 livelli

| Livello | A chi serve | Cosa contiene |
| :--- | :--- | :--- |
| **1 — Pubblico** | Ospiti, host, vicini | Acqua/gas/elettrico, caldaia, Wi‑Fi, rifiuti, artigiani |
| **2 — ICE** | Soccorso 118/112 | Schede residenti, allergie, farmaci, contatti, animali |
| **3 — Cassaforte** | Famiglia / eredità | Dati patrimoniali cifrati (PIN) — piani ADVANCED+ |

Piano **BASIC** (predefinito): 1 casa, Livello 1 completo, fino a **2 residenti** ICE, stampa A4 con watermark, solo storage locale.

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
pnpm build   # build di produzione
pnpm start   # avvia la build
pnpm lint    # ESLint
```

## Stack

- Next.js App Router + TypeScript + Tailwind CSS
- `lucide-react` (icone tree-shaken)
- Web Crypto (PBKDF2 + AES-GCM) in `src/lib/crypto-vault.ts`
- Feature gate in `src/lib/licensing.ts`
- Persistenza `idb-keyval` / IndexedDB
- QR SVG leggero (`qrcode`)

## Privacy

I dati BASIC non lasciano il browser. La stampa nasconde le schede ICE sotto una **linguetta da piegare/sigillare**, da aprire solo per il soccorso sanitario.
