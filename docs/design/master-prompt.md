# DomuSafe Suite — prompt master (ricostruzione da zero)

Ruolo: Principal Full-Stack Architect e Senior Security Engineer. Piattaforma SaaS all-in-one per casa, famiglia e persona.

## Stack
Scegliere in autonomia lo stack più moderno, tipizzato e performante: database relazionale, storage S3-compatibile, API REST con Swagger/OpenAPI.

## Qualità
Codice pulito, modulare, tipizzato (SOLID, DRY, KISS). Zero placeholder/TODO/librerie inesistenti. Docstring con scopo, pre/postcondizioni, contratti. README, AGENTS.md, ARCHITECTURE.md dual-target (umani + AI).

## Workflow
4 fasi con conferma dopo ciascuna: 1) Stack e architettura 2) Schema DB e crittografia 3) Contratti API e RBAC 4) Sviluppo modulare e documentazione.

## 1. SaaS, sicurezza, crittografia
Multi-tenant familiare; multi-abitazione con cambio rapido. RBAC: Amministratore, Genitore, Figlio (budget sola lettura), Caregiver, Ospite; richieste accesso; trasferimento proprietà. Auth: bcrypt cost 12 o Argon2, 2FA, OAuth/OIDC (Google, Keycloak, Authentik), revoca sessioni, inviti link/QR. Cassaforte cifrata client-side prima del DB, PIN dedicato, mai segreti in chiaro. Sync realtime WebSocket o QR+frase segreta; versioning/rollback; export backup/CSV. Helmet, rate limit, CORS restrittivo, validazione server, log senza dati sensibili, webhook HMAC.

## 2. Design, UI/UX
PWA installabile, offline, multilingua, tema chiaro/scuro/automatico. Smartphone nativo + Kiosk tablet (galleria widget, trasparenze). Colore per membro. Menu: Cassaforte, Famiglia, Casa, Personale, Stampa/QR, Extra, Guida, Account. Wizard e compilazione manuale. Cruscotto: % Casa/Residenti/Emergenza, suggerimenti, What's next, feed novità. Scadenze: Scadute / Questa settimana / Questo mese; in-app + Web Push VAPID. Stanze prima dei dispositivi; foto giorno/sera/luci spente. Vista ospite vs tecnica; anteprima cosa vede ospite/sitter. AI opzionale human-in-the-loop (locale/cloud/MCP) con approvazione.

## 3. Cassaforte, successione
Conti familiari, mutui, coperture credito, polizze e beneficiari, luogo bollette e disdette. Previdenza, fondo pensione, TFR, HR. Eredità digitale Apple/Google e kit password. Checklist successione ed export Kit Eredità PDF.

## 4. Casa, inventario, domotica
Manuale ospiti, Wi‑Fi, citofono, cancello, pacchi, rifiuti, animali e piante. Foto chiusure acqua/gas/quadro/caldaia; artigiani. Utenze luce/gas/internet/acqua/TARI, abbonamenti, codici cliente, pagamenti, OCR, template. Manutenzioni ricorrenti per categoria e priorità. Inventario stanze/armadi/contenitori. Ricerca full-text e filtri AND/OR salvabili (max 5 in sidebar). Home Assistant, MQTT, sensori, solare, EV, consumi, allarmi, smart lock.

## 5. Personale, soccorso, famiglia
Schede sanitarie, farmaci, contatti, animali, veterinario. Schermata soccorso, 118, SOS SMS/WhatsApp con prova. Diario parametri, scheda Chi sono, consegne, kiosk anziani, CRM etico. Calendario .ics, orari, faccende. Punti, streak, economia ragazzi, ricompense, approvazione genitori. Mobile/SIM, veicoli, conti personali, checklist tasse IT (CU, precompilata, 730, ISEE, IMU, TARI, acconti IRPEF) — etichette estese, niente acronimi in UI.

## 6. Cucina, spesa, finanze
Ricette, import URL, meal planner PDF, dispensa barcode, liste per negozio/corsia. Contabilità multi-valuta partita doppia, ricorrenti, budget, salvadanai, report, divisione spese.

## 7. Stampa, QR, piani
A4 linguetta Privacy, A5, QR emergenza senza login, revocabile, ultima scansione. Audit log; white-label host. Piani: Free (1 casa, 1 residente, casa+utenze, filigrana); Basic (residenti e animali illimitati); Advanced (fino a 3 case, senza filigrana, cassaforte PIN documenti e conti famiglia); Premium (case illimitate, tasse e conti personali, patrimonio personale, successione e kit, campi custom, registro, SOS, marchio host, sync). Prova Premium 30 giorni una volta per account.
