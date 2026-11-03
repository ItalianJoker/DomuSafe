# DomuSafe Suite — Fase 3: contratti API e controllo accessi

> **Stato:** approvata in autonomia il 3 novembre 2026 su istruzione esplicita dell'utente ("conferma ogni fase e prosegui"). È la base vincolante della fase 4.
> **Fonti:** [fase 1](phase-1-stack-architecture.md) · [fase 2](phase-2-database-crypto.md) · [prompt master](master-prompt.md) · [standard di codice](coding-standards.md).
> **Fonte di verità del contratto:** gli schemi Zod in `packages/contracts`; il documento `openapi.json` (OpenAPI 3.1) è generato da essi e versionato. Questo documento ne fissa regole, catalogo e permessi.

---

## 1. Sintesi

| Tema | Decisione |
| :--- | :--- |
| Stile | REST JSON su `/api/v1`, risorse annidate sotto `/families/{familyId}` e `/houses/{houseId}` |
| Errori | RFC 9457 Problem Details con `code` stabile e catalogo chiuso (§3) |
| Concorrenza | `ETag: "<version>"`, `If-Match` obbligatorio su `PATCH`, `PUT` di sostituzione e `DELETE`; conflitto `409 version_conflict` con versione corrente |
| Idempotenza | `Idempotency-Key` obbligatoria sui `POST` di creazione e sulle azioni; risposta memorizzata 24 ore |
| Paginazione | a cursore opaco, `limit` 1–200 (predefinito 50) |
| Autenticazione | cookie di sessione (web), token personale `dst_` (agenti e server MCP), credenziale kiosk `dsk_`, HMAC (domotica), firma del provider (pagamenti) |
| Autorizzazione | catalogo tipizzato di permessi; regola a 5 condizioni (ruolo, ambito, piano, chiave, sessione Cassaforte) |
| Realtime | WebSocket `/ws`, sottoprotocollo `domusafe.v1`, eventi di sola notifica |
| Piani | assegnazione completa delle funzioni non vincolate dal prompt (§9) |

## 2. Convenzioni

### 2.1 Formato

- `Content-Type: application/json; charset=utf-8`; chiavi in `camelCase`.
- Identificatori UUID in forma canonica minuscola.
- Istanti RFC 3339 in UTC (`2026-11-03T21:56:00Z`); date di calendario `YYYY-MM-DD` nel fuso della famiglia; orari `HH:MM`.
- Importi: `{ "amountMinor": 12345, "currency": "EUR" }` (interi in unità minori).
- Byte (chiavi, buste, hash): base64url senza riempimento.
- Busta A/B nel JSON:

```json
{
  "sealed": {
    "scopeId": "0190…",
    "keyVersion": 3,
    "dek": "AT…",
    "payload": "AQ…"
  }
}
```

- `PATCH` con semantica di fusione esplicita: i campi assenti non cambiano, `null` svuota un campo facoltativo; la busta, se presente, sostituisce quella precedente per intero.
- Lingua dei messaggi (`title`, `detail` degli errori) da `Accept-Language` (`it` predefinito, `en`); `code` non dipende dalla lingua.
- Ordinamento `sort=<campo>` o `sort=-<campo>` solo sui campi elencati nello schema della rotta.

### 2.2 Intestazioni

| Intestazione | Direzione | Regola |
| :--- | :--- | :--- |
| `ETag` | risposta | `"<version>"` su ogni risorsa singola |
| `If-Match` | richiesta | obbligatoria su `PATCH`, `PUT` di sostituzione e `DELETE` di risorse versionate; assente → `428 precondition_required` |
| `Idempotency-Key` | richiesta | UUID; obbligatoria su `POST` di creazione e azioni; stessa chiave con corpo diverso → `422 idempotency_key_reused` |
| `X-DomuSafe-Request: 1` | richiesta | obbligatoria su metodi che modificano dati con autenticazione a cookie (difesa CSRF insieme a `Origin`) |
| `X-Request-Id` | entrambe | generato se assente; riportato in ogni errore come `requestId` |
| `RateLimit-Policy`, `RateLimit` | risposta | formato della bozza IETF sulle intestazioni di rate limit |
| `Retry-After` | risposta | con `429` e `503` |
| `Location` | risposta | con `201` |

### 2.3 Paginazione e filtri

- Richiesta: `?limit=50&cursor=<opaco>`; risposta: `{ "items": [...], "nextCursor": "…" | null }`.
- Il cursore codifica in base64url la chiave di ordinamento e l'id dell'ultima riga; scade se l'ordinamento cambia (`400 cursor_invalid`).
- Filtri come parametri tipizzati della rotta (`houseId`, `status`, `from`, `to`, `q`); valori multipli ripetendo il parametro.

### 2.4 Codici di stato

| Stato | Uso |
| :--- | :--- |
| 200 | lettura, aggiornamento con corpo |
| 201 | creazione (con `Location` ed `ETag`) |
| 202 | lavoro accodato (importazione ricetta, webhook in entrata) |
| 204 | eliminazione, azioni senza corpo |
| 400 | validazione |
| 401 | non autenticato, sessione o dispositivo revocati |
| 403 | permesso, piano, ri-autenticazione o 2FA mancanti |
| 404 | risorsa inesistente **o non visibile** (nessuna distinzione, contro l'enumerazione) |
| 409 | conflitto di versione, duplicato, versione di chiave d'ambito superata |
| 410 | invito, QR o canale scaduti o revocati |
| 413 · 415 | corpo troppo grande · tipo non supportato |
| 422 | chiave di idempotenza riutilizzata, regola di dominio violata |
| 423 | Cassaforte bloccata o PIN bloccato |
| 428 | `If-Match` mancante |
| 429 | limite di frequenza |
| 500 · 502 · 503 | errore interno · servizio esterno · manutenzione |

### 2.5 Versionamento e OpenAPI

- Le modifiche additive (nuovi campi facoltativi, nuove rotte, nuovi valori di enum documentati come estendibili) restano in `v1`; ogni modifica incompatibile apre `/api/v2`.
- `operationId` = `<modulo>.<verbo><Risorsa>` (es. `tenancy.createHouse`); un tag OpenAPI per modulo; ogni operazione dichiara `x-permission` (§8) e `x-plan-feature` (§9) quando applicabili.
- Gli schemi di risposta sono serializzati da Zod: un campo non dichiarato non esce mai.

## 3. Errori (RFC 9457)

```json
{
  "type": "urn:domusafe:problem:version_conflict",
  "title": "La risorsa è stata modificata da un altro utente",
  "status": 409,
  "detail": "Ricarica la scheda per vedere la versione aggiornata.",
  "instance": "/api/v1/families/0190…/houses/0190…",
  "code": "version_conflict",
  "requestId": "4f2c…",
  "currentVersion": 7
}
```

Campi aggiuntivi facoltativi: `errors` (array `{ path, code, message }` per la validazione), `currentVersion`, `requiredPlan`, `limit`, `usage`, `remainingAttempts`, `retryAfterSeconds`, `currentKeyVersion`.

| `code` | Stato | Significato |
| :--- | :--- | :--- |
| `validation_failed` | 400 | corpo, parametri o intestazioni non validi (`errors`) |
| `cursor_invalid` | 400 | cursore non decodificabile o non coerente |
| `envelope_invalid` | 400 | busta con versione di formato, lunghezza o ambito non ammessi |
| `unauthenticated` | 401 | nessuna credenziale valida |
| `session_revoked` | 401 | sessione revocata: il client cancella la cache |
| `device_revoked` | 401 | dispositivo revocato: il client cancella cache e chiavi |
| `pin_invalid` | 401 | PIN errato (`remainingAttempts`) |
| `forbidden` | 403 | il ruolo o l'ambito non consentono l'azione |
| `plan_required` | 403 | funzione non inclusa nel piano (`requiredPlan`) |
| `plan_limit_reached` | 403 | limite del piano raggiunto (`limit`, `usage`) |
| `plan_locked` | 403 | dato in sola lettura dopo un declassamento |
| `reauthentication_required` | 403 | serve una ri-autenticazione recente |
| `two_factor_setup_required` | 403 | azione da Amministratore senza 2FA attiva |
| `csrf_rejected` | 403 | `Origin` o `X-DomuSafe-Request` non validi |
| `not_found` | 404 | inesistente o non visibile |
| `version_conflict` | 409 | `If-Match` diverso dalla versione corrente (`currentVersion`) |
| `duplicate` | 409 | vincolo di unicità |
| `key_version_stale` | 409 | busta cifrata con una versione di chiave d'ambito non corrente (`currentKeyVersion`) |
| `gone` | 410 | invito, QR, canale di abbinamento scaduto, usato o revocato |
| `payload_too_large` | 413 | — |
| `unsupported_media_type` | 415 | — |
| `idempotency_key_reused` | 422 | stessa chiave con richiesta diversa |
| `domain_rule_violated` | 422 | regola di dominio (es. movimento non bilanciato, Proprietario senza ruolo Amministratore) con `detail` |
| `vault_locked` | 423 | Cassaforte non sbloccata in questa sessione |
| `pin_locked` | 423 | PIN bloccato dopo 5 errori: serve la frase di recupero |
| `precondition_required` | 428 | `If-Match` mancante |
| `rate_limited` | 429 | `retryAfterSeconds` |
| `upstream_unavailable` | 502 | provider esterno non raggiungibile |
| `maintenance` | 503 | manutenzione programmata |
| `internal_error` | 500 | errore non previsto; il dettaglio resta nei log con `requestId` |

## 4. Autenticazione e principal

| Principal | Credenziale | Dove | Note |
| :--- | :--- | :--- | :--- |
| Account (web) | cookie `__Secure-domusafe.session_token` | tutte le rotte | Better Auth; `SameSite=Lax`, `HttpOnly`, `Secure`, `Path=/`, senza `Domain` (stesse garanzie pratiche di `__Host-`, prefisso che Better Auth non supporta) |
| Account (agente, server MCP) | `Authorization: Bearer dst_<43 caratteri>` | rotte con ambito `read` o `proposals:write` | token personale per famiglia; mai rotte di chiavi, Cassaforte, membri, fatturazione |
| Kiosk | `Authorization: Bearer dsk_<43 caratteri>` | `/api/v1/kiosk/*` | credenziale del dispositivo (§7.3) |
| Integrazione | `X-DomuSafe-Timestamp`, `X-DomuSafe-Event-Id`, `X-DomuSafe-Signature: v1=<hex>` | `/api/v1/public/webhooks/home-assistant/{connectionId}` | HMAC-SHA-256 su `timestamp + "." + corpo`, tolleranza 5 minuti, anti-ripetizione in Valkey |
| Provider di pagamento | firma del provider | `/api/v1/public/webhooks/stripe` | solo SaaS |
| Anonimo | token nel percorso | `/api/v1/public/*` | rate limit stretto |

**Rotte di Better Auth** su `/api/auth/*` (documento OpenAPI del plugin `open-api` unito a quello principale): registrazione e accesso con email e password, verifica email, password dimenticata e reimpostazione, accesso con Google e con provider OIDC generici (Keycloak, Authentik), 2FA TOTP (attivazione, verifica, disattivazione con ri-autenticazione, codici di recupero), elenco e revoca delle sessioni, uscita.

**Ri-autenticazione recente** (`POST /api/v1/me/reauthenticate` con password, TOTP o nuovo accesso OIDC) imposta `fresh_until = now() + 5 minuti` sulla sessione. È obbligatoria per: trasferimento di proprietà, disattivazione della 2FA, impostazione, cambio e reimpostazione del PIN, rigenerazione della frase di recupero, export completo, abbinamento e revoca di dispositivi e kiosk, creazione di token personali, eliminazione della famiglia o dell'account.

**2FA obbligatoria per gli Amministratori** (decisione 9 della fase 1): un account con almeno un'appartenenza `admin` e accesso con password deve avere la 2FA attiva; finché non lo è, le azioni con permesso del gruppo Amministrazione rispondono `403 two_factor_setup_required` e la procedura guidata di registrazione propone l'attivazione come primo passo. Gli accessi OIDC delegano il secondo fattore all'identity provider.

## 5. Catalogo delle rotte

Prefisso `/api/v1`. Abbreviazioni: `{f}` = `familyId`, `{h}` = `houseId`, `{r}` = `residentId`; "CRUD" indica `GET` elenco, `POST` creazione, `GET`/`PATCH`/`DELETE` sul singolo. La colonna Permesso usa il catalogo della §8.

### 5.1 Sistema e pubbliche

| Metodo e percorso | Permesso | Note |
| :--- | :--- | :--- |
| `GET /health` · `GET /ready` | pubblico | vitalità; prontezza verifica PostgreSQL, Valkey e bucket |
| `GET /openapi.json` · `GET /docs` | pubblico | contratto e interfaccia Swagger |
| `GET /public/branding` | pubblico | marchio della famiglia per l'host della richiesta (white-label) |
| `GET /public/emergency/{token}` | anonimo | `app.emergency_snapshot`; `{ id, snapshotVersion, snapshot }` o `410 gone` se revocato |
| `GET /public/invitations/{token}` | anonimo | anteprima: nome famiglia, ruolo, scadenza, stato |
| `GET /public/ics/{token}` | anonimo | feed `text/calendar`, solo dati C dell'ambito del feed |
| `GET /public/tls-ask?domain=` | rete interna | risposta `200` solo per host verificati di famiglie Premium (Caddy on-demand TLS) |
| `POST /public/webhooks/home-assistant/{connectionId}` | integrazione | §7.4 |
| `POST /public/webhooks/stripe` | provider | idempotente su `billing_events` |

### 5.2 Account (`/me`)

| Metodo e percorso | Permesso | Note |
| :--- | :--- | :--- |
| `GET /me` | autenticato | profilo, appartenenze con ruolo e piano effettivo, stato 2FA, stato chiavi |
| `PATCH /me/profile` | autenticato | nome visualizzato, lingua, tema, ultima famiglia e casa |
| `POST /me/reauthenticate` | autenticato | §4 |
| `GET /me/sessions` · `DELETE /me/sessions/{id}` · `DELETE /me/sessions` | autenticato | revoca singola o di tutte le altre; chiude i WebSocket |
| `GET /me/security-events` | autenticato | ultimi 90 giorni |
| `GET /me/tokens` · `POST /me/tokens` · `DELETE /me/tokens/{id}` | autenticato, piano con `integrations` | il token compare solo nella risposta di creazione |
| `GET /me/notifications` · `POST /me/notifications/{id}/read` · `POST /me/notifications/read-all` | autenticato | — |
| `GET /me/notification-preferences` · `PUT /me/notification-preferences` | autenticato | per famiglia e categoria |
| `POST /me/push-subscriptions` · `DELETE /me/push-subscriptions/{id}` | autenticato | chiave pubblica VAPID in `GET /me` |
| `GET /me/onboarding/{f}` · `PUT /me/onboarding/{f}/{wizardKey}` | autenticato | avanzamento delle procedure guidate |
| `PUT /me/dashboard-dismissals/{f}/{suggestionKey}` | autenticato | nasconde un suggerimento fino a una data |
| `GET /news` · `POST /news/read` | autenticato | feed novità |
| `GET /me/access-requests` · `DELETE /me/access-requests/{id}` | autenticato | ritiro |
| `DELETE /me` | autenticato, ri-autenticazione | eliminazione dell'account; vietata se Proprietario di una famiglia con altri membri |

### 5.3 Chiavi, dispositivi, PIN (`keys`)

| Metodo e percorso | Permesso | Note |
| :--- | :--- | :--- |
| `GET /me/keys` | autenticato | la propria riga `account_keys` (buste avvolte comprese) |
| `POST /me/keys` | autenticato, una sola volta | avvio dopo la registrazione: chiavi account, dispositivo, ambiti e concessioni della famiglia principale in un'unica transazione |
| `POST /public-keys/lookup` | autenticato | `{ accountIds }` → chiavi pubbliche e impronte (`app.public_keys`) |
| `GET /me/devices` · `POST /me/devices` · `PATCH /me/devices/{id}` · `DELETE /me/devices/{id}` | autenticato; creazione e revoca con ri-autenticazione | `POST` dopo abbinamento o recupero |
| `POST /me/pairing-channels` | autenticato, ri-autenticazione | crea il canale (5 minuti) e restituisce `channelId` |
| `PUT /me/pairing-channels/{id}/joiner` | autenticato | il nuovo dispositivo pubblica chiave pubblica e id dispositivo |
| `GET /me/pairing-channels/{id}` | autenticato | stato del canale (attesa lunga fino a 25 secondi) |
| `PUT /me/pairing-channels/{id}/transfer` | autenticato | il dispositivo esistente invia la chiave account cifrata |
| `DELETE /me/pairing-channels/{id}` | autenticato | annullamento |
| `POST /me/recovery/verify` | autenticato | `{ verifier }` → copie di recupero di chiave account e chiave privata di recupero |
| `PUT /me/recovery` | autenticato, ri-autenticazione, Cassaforte sbloccata se esiste | rigenerazione della frase |
| `GET /me/vault-pin` | autenticato | sale, parametri, stato (`not_set`, `active`, `locked`), tentativi rimasti |
| `PUT /me/vault-pin` | autenticato, ri-autenticazione | impostazione o cambio (§8.7 della fase 2) |
| `POST /me/vault-pin/unlock` | autenticato | `{ verifier }` → `{ serverShare, unlockedUntil }` o `401 pin_invalid` / `423 pin_locked` |
| `POST /me/vault-pin/lock` | autenticato | chiude la sessione Cassaforte |
| `POST /me/vault-pin/reset` | autenticato, ri-autenticazione | con verificatore di recupero |
| `GET /families/{f}/key-scopes` | membro | ambiti visibili, versioni, le proprie concessioni, `rotationRequired` |
| `POST /families/{f}/key-scopes` | `keys.scope.create` | nuovo ambito con versione 1 e concessioni |
| `POST /families/{f}/key-scopes/{id}/versions` | `keys.scope.rotate` | nuova versione con concessioni a tutti i titolari rimasti |
| `POST /families/{f}/key-scopes/{id}/grants` · `DELETE …/grants/{grantId}` | `keys.scope.grant` | il server verifica che il destinatario abbia diritto all'ambito per ruolo |
| `GET /families/{f}/key-scopes/{id}/rewrap-queue` | `keys.scope.rotate` | record con DEK su versioni precedenti (a pagine) |
| `POST /families/{f}/key-scopes/{id}/rewrap` | `keys.scope.rotate` | fino a 200 `{ table, id, keyVersion, dek }` per richiesta |

### 5.4 Famiglia (`tenancy`)

| Metodo e percorso | Permesso | Note |
| :--- | :--- | :--- |
| `GET /families` · `POST /families` | autenticato | elenco delle proprie famiglie; creazione con `app.create_family` |
| `GET /families/{f}` · `PATCH /families/{f}` | `family.read` · `family.manage` | nome, fuso, valuta base, lingua |
| `DELETE /families/{f}` | `family.delete` (Proprietario), ri-autenticazione | 30 giorni di ripensamento |
| `GET /families/{f}/houses` · `POST /families/{f}/houses` | `houses.read` · `houses.manage` | limite di piano nella transazione |
| `GET /families/{f}/houses/{h}` · `PATCH` · `DELETE` | `houses.read` · `houses.manage` | — |
| `GET /families/{f}/members` | `members.read` | appartenenze con ambiti e residente collegato |
| `PATCH /families/{f}/members/{id}` | `members.manage` | ruolo, ambiti, scadenza, concessione Cassaforte di famiglia |
| `DELETE /families/{f}/members/{id}` | `members.manage` | rimozione; segna gli ambiti da ruotare |
| `POST /families/{f}/leave` | membro | uscita; i dati personali seguono l'account (fase 1 §4.2) |
| `GET /families/{f}/invitations` · `POST` · `DELETE /{id}` | `invitations.create` o `invitations.create_guest` | §6.1 |
| `POST /invitations/accept` | autenticato | §6.1 |
| `GET /families/{f}/join-links` · `POST` · `DELETE /{id}` | `members.manage` | link "Chiedi di entrare" |
| `POST /join/{token}/requests` | autenticato | crea una richiesta di accesso |
| `GET /families/{f}/access-requests` · `POST /{id}/approve` · `POST /{id}/reject` | `access_requests.decide` | §6.2 |
| `POST /families/{f}/ownership-transfers` · `POST /{id}/accept` · `POST /{id}/cancel` | `ownership.transfer` (Proprietario) / destinatario | §6.3 |

### 5.5 Piano (`billing`)

| Metodo e percorso | Permesso | Note |
| :--- | :--- | :--- |
| `GET /families/{f}/billing` | `billing.read` | piano pagato ed effettivo, prova, limiti, utilizzo, funzioni |
| `POST /families/{f}/billing/checkout` | `billing.manage` | SaaS: URL di pagamento per `{ plan }` |
| `POST /families/{f}/billing/portal` | `billing.manage` | SaaS: URL del portale cliente |
| `POST /families/{f}/billing/trial` | `billing.manage` | §6.4 |
| `PUT /families/{f}/billing/active-entities` | `billing.manage` | dopo un declassamento: `{ houseIds, residentIds, petIds }` che restano modificabili |

In self-host il piano si imposta con il comando `domusafe plan set <familyId> <piano>` eseguito dall'operatore (`plan_source = 'operator'`); nessuna rotta API lo espone.

### 5.6 File, revisioni, registro, webhook

| Metodo e percorso | Permesso | Note |
| :--- | :--- | :--- |
| `POST /families/{f}/files` | permesso di scrittura sulla risorsa proprietaria | riga `pending` + URL `PUT` prefirmato (10 minuti) |
| `POST /families/{f}/files/{id}/complete` | come sopra | verifica dimensione e stato |
| `GET /families/{f}/files/{id}` · `GET …/download` | permesso di lettura sulla risorsa | metadati · URL `GET` prefirmato (5 minuti) |
| `DELETE /families/{f}/files/{id}` | permesso di scrittura sulla risorsa | cestino |
| `GET /families/{f}/revisions?resourceType=&resourceId=` · `GET …/{id}` | permesso di lettura sulla risorsa | — |
| `POST /families/{f}/revisions/{id}/restore` | permesso di scrittura sulla risorsa | dati C ripristinati dal server; per A/B il corpo porta la nuova busta |
| `GET /families/{f}/audit-events` | `audit.read`, piano con `audit_log` | filtri `from`, `to`, `action`, `actorId` |
| `CRUD /families/{f}/webhooks` · `POST …/{id}/rotate-secret` · `POST …/{id}/test` · `GET …/{id}/deliveries` | `integrations.manage`, piano con `integrations` | §7.5 |
| `GET /families/{f}/export/records` | membro, ri-autenticazione | tutte le righe leggibili dal chiamante, a pagine, per l'assemblaggio del backup nel browser |

### 5.7 Cruscotto, scadenze, notifiche, kiosk, assistente

| Metodo e percorso | Permesso | Note |
| :--- | :--- | :--- |
| `GET /families/{f}/dashboard` | membro | completezza calcolata sui dati C, suggerimenti, "What's next", conteggio novità; le percentuali sui dati A/B sono completate dal browser |
| `GET /families/{f}/reminders?group=overdue\|week\|month&houseId=` | `deadlines.read` | gruppi Scadute / Questa settimana / Questo mese |
| `CRUD /families/{f}/reminders` · `POST …/{id}/complete` · `POST …/{id}/dismiss` | `deadlines.write` | i promemoria con `sourceModule` sono gestiti dal modulo di origine |
| `CRUD /families/{f}/kiosks` · `PUT …/{id}/layout` | `kiosk.manage`; creazione e revoca con ri-autenticazione | registrazione con chiave pubblica, hash della credenziale e concessioni |
| `GET /kiosk/me` · `GET /kiosk/widgets` | kiosk | configurazione e dati dei widget |
| `POST /kiosk/medication-intakes` · `POST /kiosk/sos-events` · `POST /kiosk/chore-completions` | kiosk | profilo anziani; faccende in attesa di approvazione |
| `GET /families/{f}/assistant/settings` · `PUT` | `assistant.manage` | chiave API conservata in classe S, mai restituita |
| `POST /families/{f}/assistant/chat` | `assistant.use` | risposta in streaming (Server-Sent Events); contesto solo con dati C letti con i permessi del chiamante |
| `GET /families/{f}/assistant/proposals` · `POST …/{id}/approve` · `POST …/{id}/reject` | `assistant.use` · permesso dell'azione proposta | §7.6 |
| `POST /mcp` | token personale | server MCP (HTTP in streaming) |

### 5.8 Cassaforte, successione, personale, tasse

| Metodo e percorso | Permesso | Note |
| :--- | :--- | :--- |
| `GET /families/{f}/vault/items?section=&visibility=` | `vault.family.read` o `vault.personal.read`; sessione Cassaforte | solo metadati strutturali e buste |
| `POST /families/{f}/vault/items` · `GET`/`PATCH`/`DELETE /{id}` | `vault.family.write` o `vault.personal.write`; sessione Cassaforte | piano per sezione (§9) |
| `CRUD /families/{f}/phone-lines` | `personal.write` sui propri, `residents.write` su residenti | — |
| `CRUD /families/{f}/vehicles` | come sopra | promemoria assicurazione, bollo, revisione, tagliando |
| `GET /families/{f}/tax-checklist?year=&residentId=` · `POST /families/{f}/tax-checklist/generate` · `PATCH /families/{f}/tax-checklist/{id}` | `taxes.read` · `taxes.write`; piano con `taxes` | generazione delle voci predefinite per anno e persona |

La checklist di successione e il Kit Eredità usano `vault/items` con `section = 'succession_task'`.

### 5.9 Casa, contatti, utenze, manutenzioni, inventario, domotica

| Metodo e percorso | Permesso | Note |
| :--- | :--- | :--- |
| `CRUD /families/{f}/houses/{h}/rooms` | `house.read` · `house.write` | — |
| `CRUD /families/{f}/houses/{h}/guide-entries` | `house.guest_view.*` o `house.technical.*` secondo `audience` | — |
| `CRUD /families/{f}/houses/{h}/shutoffs` | `house.technical.*` | — |
| `CRUD /families/{f}/houses/{h}/waste-collections` | `house.write` | — |
| `GET /families/{f}/houses/{h}/guest-view` | `house.guest_view.read` | proiezione "vista ospite" |
| `GET /families/{f}/houses/{h}/guest-view/preview` | `house.write` | stessa proiezione, per "Cosa vede l'Ospite" |
| `CRUD /families/{f}/contacts` | `contacts.read` · `contacts.write` | — |
| `CRUD /families/{f}/houses/{h}/utilities` · `CRUD …/utilities/{id}/bills` | `utilities.read` · `utilities.write` | — |
| `GET /families/{f}/utility-templates` · `POST` · `PATCH`/`DELETE /{id}` | `utilities.read` · `utilities.write` | modelli di sistema in sola lettura |
| `CRUD /families/{f}/subscriptions` | `utilities.*` (famiglia) o `personal.write` (personali) | — |
| `CRUD /families/{f}/houses/{h}/maintenance-tasks` · `POST …/{id}/complete` · `GET …/{id}/logs` | `maintenance.read` · `maintenance.write` | il completamento crea il registro e avanza la ricorrenza |
| `CRUD /families/{f}/houses/{h}/storage-units` · `CRUD …/inventory-items` | `inventory.read` · `inventory.write` | — |
| `CRUD /families/{f}/houses/{h}/automation/connections` · `POST …/{id}/rotate-secret` · `POST …/{id}/test` | `automation.manage`; piano con `home_automation` | segreti mostrati una sola volta |
| `GET /families/{f}/houses/{h}/automation/devices` · `PATCH …/{id}` | `automation.read` · `automation.manage` | assegnazione a stanza e nome |
| `GET /families/{f}/houses/{h}/automation/devices/{id}/measurements?from=&to=&resolution=raw\|hour` | `automation.read` | — |
| `GET /families/{f}/houses/{h}/automation/events` | `automation.read` | Caregiver: solo allarmi e sensori |
| `GET /families/{f}/search?q=&types=&houseId=&tags=&tagMode=and\|or` · `CRUD /families/{f}/saved-filters` | membro · proprietario del filtro | massimo 5 filtri fissati |

### 5.10 Residenti, salute, animali, soccorso, assistenza

| Metodo e percorso | Permesso | Note |
| :--- | :--- | :--- |
| `CRUD /families/{f}/residents` · `PUT …/{r}/houses` | `residents.read` · `residents.write` | limite di piano |
| `GET`/`PUT /families/{f}/residents/{r}/cards/{kind}` | `health.read` · `health.write` | `about_me`, `health_profile` |
| `CRUD /families/{f}/residents/{r}/medications` · `CRUD …/medication-schedules` | `health.*` | — |
| `GET`/`POST /families/{f}/residents/{r}/medication-intakes` | `health.read` · `health.confirm_intake` | — |
| `CRUD /families/{f}/residents/{r}/vitals` | `health.*` | — |
| `CRUD /families/{f}/emergency-contacts` | `health.*` (residente) o `family.write` (famiglia) | — |
| `CRUD /families/{f}/pets` · `CRUD …/{id}/health-records` | `pets.read` · `pets.write` | limite di piano |
| `GET`/`PUT /families/{f}/emergency/settings` | `emergency.configure` | — |
| `POST /families/{f}/emergency/sos-events` | `emergency.sos`; piano con `sos` per `kind = real` | prova sempre consentita |
| `CRUD /families/{f}/handovers` · `POST …/{id}/acknowledge` | `care.read` · `care.write` | Ospite: sola lettura e presa visione delle consegne `guest` |
| `CRUD /families/{f}/relationships` | `care.relationships` | personali per impostazione predefinita |

### 5.11 Calendario, faccende, punti

| Metodo e percorso | Permesso | Note |
| :--- | :--- | :--- |
| `GET /families/{f}/calendar/events?from=&to=` · `POST` · `PATCH`/`DELETE /{id}` | `calendar.read` · `calendar.write` | ricorrenze espanse dal server nell'intervallo (massimo 366 giorni) |
| `POST /families/{f}/calendar/import` | `calendar.write` | fino a 500 eventi già interpretati nel browser, deduplicati per `icsUid` |
| `CRUD /families/{f}/calendar/feeds` | `calendar.read` | URL del feed mostrato una sola volta |
| `CRUD /families/{f}/residents/{r}/timetable` | `calendar.write` | orari |
| `CRUD /families/{f}/chores` | `chores.manage` | — |
| `POST /families/{f}/chores/{id}/completions` | `chores.complete` | in attesa di approvazione se richiesto |
| `POST /families/{f}/chore-completions/{id}/approve` · `…/reject` | `rewards.approve` | — |
| `GET /families/{f}/points?residentId=` · `POST /families/{f}/points` | `rewards.read` · `rewards.adjust` | saldo, voci, serie di giorni |
| `CRUD /families/{f}/rewards` | `rewards.manage` | — |
| `POST /families/{f}/rewards/{id}/redemptions` · `POST /families/{f}/redemptions/{id}/approve` · `…/reject` · `…/fulfil` | `rewards.request` · `rewards.approve` | controllo del saldo |

### 5.12 Cucina, dispensa, spesa, finanze

| Metodo e percorso | Permesso | Note |
| :--- | :--- | :--- |
| `CRUD /families/{f}/recipes` | `kitchen.read` · `kitchen.write` | — |
| `POST /families/{f}/recipe-imports` · `GET …/{id}` | `kitchen.write` | `202`; protezione SSRF (fase 1 §8) |
| `GET /families/{f}/meal-plan?from=&to=` · `POST` · `PATCH`/`DELETE /{id}` | `kitchen.read` · `kitchen.write` | PDF generato nel browser |
| `CRUD /families/{f}/houses/{h}/pantry-items` · `GET`/`PUT /families/{f}/barcode-products/{code}` | `kitchen.*` | — |
| `CRUD /families/{f}/stores` · `CRUD /families/{f}/shopping-lists` · `CRUD …/{l}/items` · `POST …/items/{i}/check` | `shopping.read` · `shopping.write` | — |
| `CRUD /families/{f}/finance/accounts` · `GET …/{id}/ledger` | `finance.read` · `finance.write`; piano con `finance` | — |
| `CRUD /families/{f}/finance/transactions` | `finance.write` | il corpo contiene le righe; bilanciamento verificato dal database |
| `PUT /families/{f}/finance/transactions/{id}/splits` | `finance.write` | divisione spese |
| `CRUD /families/{f}/finance/budgets` · `CRUD …/savings-goals` · `CRUD …/recurring` | `finance.write`; budget leggibili dal Figlio | — |
| `GET /families/{f}/finance/reports/{kind}?from=&to=` | `finance.read` | `balances`, `income-expense`, `by-category`, `net-worth` |
| `GET /fx-rates?date=&quote=` | autenticato | tassi BCE |

### 5.13 Stampa, QR, marchio, campi personalizzati

| Metodo e percorso | Permesso | Note |
| :--- | :--- | :--- |
| `CRUD /families/{f}/emergency-qr` · `PUT …/{id}/snapshot` · `POST …/{id}/revoke` | `qr.manage` (Caregiver: lettura dei QR dei residenti assistiti per la stampa) | — |
| `GET`/`PUT /families/{f}/branding` | `branding.manage`; piano con `branding` | — |
| `CRUD /families/{f}/hosts` · `POST …/{id}/verify` | `branding.manage` | verifica del record DNS TXT |
| `CRUD /families/{f}/custom-fields` | `custom_fields.manage`; piano con `custom_fields` | — |

Stampe A4/A5, linguetta Privacy, filigrana e PDF sono generati nel browser: il piano effettivo (`GET /families/{f}/billing`) indica se applicare la filigrana.

## 6. Contratti dei flussi

Schemi in notazione TypeScript; nel codice sono schemi Zod con gli stessi nomi.

### 6.1 Inviti

```ts
type CreateInvitationRequest = {
  id: UuidV7;                                 // generato dal browser (AAD del pacchetto)
  role: 'parent' | 'child' | 'caregiver' | 'guest' | 'admin';
  allHouses: boolean; houseIds: Uuid[];
  allResidents: boolean; residentIds: Uuid[];
  membershipExpiresAt: Instant | null;        // obbligatorio per 'guest'
  expiresAt: Instant;                         // al massimo 14 giorni
  tokenHash: Base64Url;                       // SHA-256 del token di 128 bit
  keyPackage: Base64Url;                      // DS-ENV con K_inv
  keyPackageScopes: { scopeId: Uuid; version: number }[];
  delivery: 'link' | 'qr' | 'email';
  email: string | null;
};
type AcceptInvitationRequest = {
  token: Base64Url;                           // il server ne calcola lo SHA-256
  grants: { scopeId: Uuid; version: number; grantBlob: Base64Url }[];
};
type AcceptInvitationResponse = { familyId: Uuid; membershipId: Uuid; role: MemberRole };
```

Il server rifiuta `keyPackageScopes` che includono ambiti non coerenti con ruolo e ambiti dell'invito, e all'accettazione `grants` diversi da `keyPackageScopes` (`422 domain_rule_violated`).

### 6.2 Richieste di accesso

```ts
type CreateAccessRequest = {
  requestedRole: 'parent' | 'child' | 'caregiver';
  requestedAllHouses: boolean; requestedHouseIds: Uuid[];
  requestedAllResidents: boolean; requestedResidentIds: Uuid[];
  message: string | null;                     // massimo 500 caratteri
};
type ApproveAccessRequest = {
  role: MemberRole; allHouses: boolean; houseIds: Uuid[];
  allResidents: boolean; residentIds: Uuid[];
  grants: { scopeId: Uuid; version: number; grantBlob: Base64Url }[];  // per la chiave pubblica del richiedente
  confirmedFingerprint: string;               // 6 parole lette dall'Amministratore
};
```

`confirmedFingerprint` deve coincidere con l'impronta della chiave pubblica del richiedente: il server rifiuta l'approvazione se la chiave è cambiata nel frattempo.

### 6.3 Trasferimento di proprietà

```ts
type CreateOwnershipTransfer = { toAccountId: Uuid };     // destinatario già Amministratore
type AcceptOwnershipTransfer = Record<string, never>;     // con ri-autenticazione del destinatario
```

Regole: entrambi gli account con 2FA (o OIDC) e ri-autenticazione recente; un solo trasferimento in attesa per famiglia; scadenza 7 giorni; all'accettazione cambiano `families.owner_account_id` e `subscriptions.payer_account_id` nella stessa transazione; la prova Premium resta legata all'account che l'ha usata.

### 6.4 Prova Premium

```ts
type StartTrialResponse = { familyId: Uuid; startedAt: Instant; endsAt: Instant; effectivePlan: 'premium' };
```

Regole: solo il Proprietario; una volta per account (`premium_trials.account_id` è chiave primaria); `409 duplicate` se già usata; la prova vale sulla famiglia indicata; alla scadenza il piano effettivo torna a quello pagato e si applica il declassamento (fase 2 §6.4). Un trasferimento di proprietà durante la prova non la estende al nuovo Proprietario.

### 6.5 PIN e Cassaforte

```ts
type VaultPinStatus = {
  state: 'not_set' | 'active' | 'locked';
  salt: Base64Url | null;
  kdf: { memoryKib: number; iterations: number; parallelism: number } | null;
  remainingAttempts: number;                  // 0–5
};
type SetVaultPinRequest = {
  salt: Base64Url; kdf: VaultPinStatus['kdf'];
  verifier: Base64Url;                        // Argon2id del PIN, 32 byte
  serverShare: Base64Url;                     // 32 byte
  vaultPublicKey: Base64Url;                  // solo alla prima impostazione
  wrappedVaultPrivateKey: Base64Url;
  recoverySealedVaultKey: Base64Url;          // solo alla prima impostazione
  pinGeneration: number;                      // generazione attuale + 1
};
type UnlockVaultRequest = { verifier: Base64Url };
type UnlockVaultResponse = { serverShare: Base64Url; unlockedUntil: Instant };
type ResetVaultPinRequest = SetVaultPinRequest & { recoveryVerifier: Base64Url };
```

### 6.6 Abbinamento dei dispositivi

```ts
type PairingChannel = {
  id: Uuid; expiresAt: Instant;
  state: 'waiting_joiner' | 'waiting_confirmation' | 'transferred' | 'cancelled';
  joiner: { devicePublicKey: Base64Url; deviceId: UuidV7; label: string; platform: Platform } | null;
  transfer: Base64Url | null;                 // DS-ENV della chiave account con la chiave di trasferimento
};
```

### 6.7 Busta e versioni di chiave

Ogni scrittura con busta è accettata solo se `sealed.keyVersion` è la `current_version` dell'ambito (`409 key_version_stale` con `currentKeyVersion`) e se il tipo d'ambito è tra quelli ammessi dalla tabella (`400 envelope_invalid`).

## 7. Realtime, webhook, MCP

### 7.1 WebSocket `/ws`

- Upgrade con cookie di sessione, verifica di `Origin`, sottoprotocollo `domusafe.v1`. Messaggi JSON di massimo 4 KiB; `ping` ogni 25 secondi, chiusura dopo 60 secondi senza risposta.
- Client → server:

```ts
type ClientMessage =
  | { type: 'subscribe'; channel: `family:${Uuid}` | `house:${Uuid}` }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'ping' };
```

- Server → client:

```ts
type ServerMessage =
  | { type: 'event'; channel: string; event: RealtimeEvent }
  | { type: 'session_revoked' }
  | { type: 'subscribed' | 'unsubscribed'; channel: string }
  | { type: 'error'; code: 'forbidden' | 'invalid_message' | 'plan_required' }
  | { type: 'pong' };
type RealtimeEvent = {
  kind: 'resource.changed' | 'resource.deleted' | 'membership.changed' | 'keys.rotation_required'
      | 'notification.created' | 'vault.locked';
  resource: string;                           // es. 'shopping_items'
  id: Uuid; version: number | null;
  houseId: Uuid | null; occurredAt: Instant;
};
```

- Un evento raggiunge solo chi potrebbe leggere la risorsa con le stesse regole RLS (case, residenti, dati personali, vista ospite).
- Piano: le famiglie con `realtime_sync` ricevono tutti gli eventi; le altre ricevono solo `notification.created`, `session_revoked`, `membership.changed` e `keys.rotation_required` (decisione 5 della fase 1).

### 7.2 Eventi di dominio pubblicati

Ogni servizio emette, dopo il commit, un evento `resource.changed` o `resource.deleted` per ogni risorsa modificata; il modulo `notifications` crea notifiche dagli eventi elencati in §7.5.

### 7.3 Kiosk

| Profilo | Può leggere | Può scrivere |
| :--- | :--- | :--- |
| `standard` | widget configurati: eventi del giorno, promemoria del giorno (testo neutro), faccende del giorno, lista della spesa, vista ospite della propria casa, schermata soccorso | completamento faccende (in attesa di approvazione), voci della lista della spesa |
| `elderly` | come `standard` più farmaci e orari del residente, contatti di emergenza del residente | conferma di assunzione farmaco, evento SOS, avvio chiamata (dal dispositivo) |

### 7.4 Webhook in entrata (Home Assistant)

```ts
type HomeAssistantIngest = {
  events: {
    entityId: string;                         // es. 'sensor.cucina_temperatura'
    state: string;
    value: number | null;
    unit: string | null;
    occurredAt: Instant;
    attributes: Record<string, string | number | boolean | null> | null;
  }[];                                        // da 1 a 500 voci, corpo massimo 256 KiB
};
```

Firma: `hex(HMAC-SHA-256(segreto, timestamp + "." + corpo))`, confronto a tempo costante con il segreto attuale e con quello precedente durante la rotazione; `X-DomuSafe-Event-Id` memorizzato 10 minuti in Valkey contro la ripetizione. Risposta `202`. Le entità sconosciute creano `ha_devices` con `kind` dedotto dal dominio dell'entità (`sensor`, `binary_sensor`, `lock`, `alarm_control_panel`).

### 7.5 Webhook in uscita

- Eventi disponibili (solo dati C): `reminder.due`, `reminder.completed`, `maintenance.completed`, `utility_bill.created`, `emergency_qr.scanned`, `sos.triggered`, `automation.alarm`, `shopping_item.created`, `chore.completed`, `calendar_event.created`.
- Corpo: `{ "id": Uuid, "type": string, "occurredAt": Instant, "familyId": Uuid, "data": {…} }`.
- Intestazioni: `X-DomuSafe-Event-Id`, `X-DomuSafe-Timestamp`, `X-DomuSafe-Signature: v1=<hex>[,v1=<hex>]` (due firme durante la rotazione).
- Tentativi: dopo 1 minuto, 5 minuti, 30 minuti, 2 ore, 12 ore, 24 ore; poi `failed`. Successo con qualsiasi `2xx` entro 10 secondi.

### 7.6 Assistente AI e server MCP

- **Proposte:** ogni scrittura suggerita dall'assistente diventa `assistant_proposals` in stato `pending`; l'approvazione esegue la stessa rotta che l'utente userebbe a mano, con i suoi permessi; il rifiuto archivia.
- **Strumenti MCP** (token personale con ambito `read` e, se concesso, `proposals:write`):

| Strumento | Ambito | Effetto |
| :--- | :--- | :--- |
| `search` | `read` | ricerca full-text sui dati C |
| `list_deadlines` | `read` | promemoria per gruppo |
| `get_house_manual` | `read` | vista ospite o tecnica (testi C) di una casa |
| `list_shopping_items` | `read` | voci aperte delle liste |
| `list_calendar_events` | `read` | eventi in un intervallo |
| `propose_maintenance_task` | `proposals:write` | proposta di manutenzione |
| `propose_shopping_item` | `proposals:write` | proposta di voce della spesa |
| `propose_calendar_event` | `proposals:write` | proposta di evento |
| `propose_reminder` | `proposals:write` | proposta di promemoria |

Nessuno strumento MCP legge o scrive dati A/B, chiavi, membri, piano o integrazioni.

## 8. Controllo accessi

### 8.1 Regola

Un'azione è consentita solo se valgono tutte le condizioni (fase 1 §6.3):

1. il ruolo concede il **permesso** (§8.3);
2. la risorsa è nell'**ambito** dell'appartenenza (case e residenti assegnati, dati propri, scadenza) — §8.4;
3. il **piano** effettivo include la funzione (§9);
4. per A/B, il chiamante possiede la **chiave d'ambito** (verifica crittografica nel browser; il server controlla che esista la concessione prima di servire o accettare buste);
5. per la Cassaforte, la **sessione Cassaforte** è sbloccata.

Ordine di valutazione nel server: autenticazione → appartenenza → permesso → ambito → piano → stato della risorsa (`plan_locked`, cestino) → sessione Cassaforte. Una risorsa fuori ambito risponde `404`, non `403`.

### 8.2 Implementazione

- `packages/contracts/src/access/permissions.ts`: unione di stringhe `Permission`, matrice `ROLE_PERMISSIONS: Record<MemberRole, ReadonlySet<Permission>>`, insiemi per kiosk, integrazione e token personali.
- `packages/contracts/src/access/can.ts`: funzione pura `can(subject, permission, resource?)` usata dal web per nascondere ciò che non si può fare e dal server per decidere.
- Ogni rotta dichiara `config.permission`; un hook Fastify `preHandler` costruisce il `TenantContext` e rifiuta prima dell'handler. Un test elenca tutte le rotte e fallisce se una rotta autenticata non dichiara permesso o eccezione esplicita.

### 8.3 Catalogo dei permessi e matrice

Legenda: ✓ consentito · \* solo nell'ambito assegnato o sui propri dati · P solo il Proprietario · C su concessione esplicita · — negato.

| Permesso | Ammin. | Genitore | Figlio | Caregiver | Ospite |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `family.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `family.manage` | ✓ | — | — | — | — |
| `family.delete` | P | — | — | — | — |
| `members.read` | ✓ | ✓ | ✓ | \* | — |
| `members.manage` | ✓ | — | — | — | — |
| `invitations.create` | ✓ | — | — | — | — |
| `invitations.create_guest` | ✓ | ✓ | — | — | — |
| `access_requests.decide` | ✓ | — | — | — | — |
| `ownership.transfer` | P | — | — | — | — |
| `billing.read` | ✓ | — | — | — | — |
| `billing.manage` | P | — | — | — | — |
| `keys.scope.create` · `keys.scope.rotate` | ✓ | \* (propri ambiti) | \* (propri ambiti) | \* (propri ambiti) | — |
| `keys.scope.grant` | ✓ | \* (ambiti che possiede, verso ruoli ammessi) | — | — | — |
| `houses.read` | ✓ | ✓ | ✓ | \* | \* |
| `houses.manage` | ✓ | — | — | — | — |
| `house.read` · `house.technical.read` | ✓ | ✓ | ✓ | \* | — |
| `house.write` · `house.technical.write` | ✓ | ✓ | — | — | — |
| `house.guest_view.read` | ✓ | ✓ | ✓ | \* | \* |
| `house.guest_view.write` | ✓ | ✓ | — | — | — |
| `contacts.read` | ✓ | ✓ | ✓ | \* | \* (visibili agli Ospiti) |
| `contacts.write` | ✓ | ✓ | — | — | — |
| `utilities.read` · `utilities.write` | ✓ | ✓ | — | — | — |
| `maintenance.read` · `inventory.read` | ✓ | ✓ | ✓ | \* | — |
| `maintenance.write` · `inventory.write` | ✓ | ✓ | — | — | — |
| `automation.read` | ✓ | ✓ | ✓ | \* (allarmi e sensori) | — |
| `automation.manage` | ✓ | — | — | — | — |
| `residents.read` | ✓ | ✓ | ✓ | \* | — |
| `residents.write` | ✓ | ✓ | — | — | — |
| `health.read` | ✓ | ✓ | \* (propria scheda) | \* | — |
| `health.write` | ✓ | ✓ | — | \* | — |
| `health.confirm_intake` | ✓ | ✓ | \* | \* | — |
| `pets.read` | ✓ | ✓ | ✓ | \* (case assegnate) | — |
| `pets.write` | ✓ | ✓ | — | — | — |
| `emergency.use` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `emergency.sos` | ✓ | ✓ | ✓ | ✓ | — |
| `emergency.configure` | ✓ | ✓ | — | — | — |
| `calendar.read` | ✓ | ✓ | ✓ | \* | — |
| `calendar.write` | ✓ | ✓ | \* (propri eventi) | \* | — |
| `chores.manage` | ✓ | ✓ | — | — | — |
| `chores.complete` | ✓ | ✓ | \* | — | — |
| `care.read` | ✓ | ✓ | — | \* | \* (consegne per Ospiti) |
| `care.write` | ✓ | ✓ | — | \* | \* (solo presa visione) |
| `care.relationships` | ✓ (propri) | ✓ (propri) | ✓ (propri) | ✓ (propri) | — |
| `rewards.read` | ✓ | ✓ | \* | — | — |
| `rewards.adjust` · `rewards.manage` · `rewards.approve` | ✓ | ✓ | — | — | — |
| `rewards.request` | — | — | \* | — | — |
| `kitchen.read` | ✓ | ✓ | ✓ | \* | — |
| `kitchen.write` | ✓ | ✓ | — | \* | — |
| `shopping.read` · `shopping.write` | ✓ | ✓ | ✓ | \* | — |
| `finance.read` | ✓ | ✓ | \* (budget e proprio salvadanaio) | — | — |
| `finance.write` | ✓ | ✓ | — | — | — |
| `vault.family.read` · `vault.family.write` | ✓ | C | — | — | — |
| `vault.personal.read` · `vault.personal.write` | ✓ (propri) | ✓ (propri) | ✓ (propri) | ✓ (propri) | — |
| `personal.read` · `personal.write` | ✓ (propri) | ✓ (propri) | ✓ (propri) | ✓ (propri) | — |
| `taxes.read` · `taxes.write` | ✓ | ✓ | \* (propri) | — | — |
| `deadlines.read` | ✓ | ✓ | ✓ | \* | — |
| `deadlines.write` | ✓ | ✓ | \* (propri) | \* | — |
| `qr.manage` | ✓ | ✓ | — | — | — |
| `qr.print` | ✓ | ✓ | — | \* (residenti assistiti) | — |
| `audit.read` | ✓ | — | — | — | — |
| `integrations.manage` | ✓ | — | — | — | — |
| `kiosk.manage` | ✓ | — | — | — | — |
| `branding.manage` | ✓ | — | — | — | — |
| `custom_fields.manage` | ✓ | ✓ | — | — | — |
| `assistant.manage` | ✓ | — | — | — | — |
| `assistant.use` | ✓ | ✓ | — | — | — |
| `export.full` | ✓ | ✓ | ✓ | ✓ | — |

Note:

- Un Amministratore non legge i dati Personale di altri account: i permessi "(propri)" sono limitati anche dalla RLS P e dalla chiave d'ambito `personal`.
- `vault.family.*` per un Genitore richiede `memberships.vault_family = true` **e** la concessione della chiave `vault_family` sulla sua chiave Cassaforte.
- Approvare una proposta dell'assistente richiede il permesso dell'azione proposta.
- `export.full` esporta solo ciò che il chiamante può leggere.

### 8.4 Regole di ambito

| Soggetto | Ambito |
| :--- | :--- |
| Caregiver | residenti in `membership_residents` e case in `membership_houses`; legge le schede, i farmaci, il diario, le consegne e gli eventi di quei residenti; nelle case assegnate legge vista tecnica, manutenzioni, inventario, allarmi e sensori, e scrive la spesa |
| Ospite | case in `membership_houses`, solo righe con `audience = 'guest'` o `visible_to_guests`; consegne con `audience = 'guest'`; `expires_at` obbligatorio: alla scadenza l'appartenenza passa a `left` e parte la rotazione di `house_guest` |
| Figlio | dati propri tramite il residente collegato (`residents.account_id`): propria scheda sanitaria, propri eventi, proprie faccende e punti, proprio salvadanaio |
| Kiosk | la propria casa e, nel profilo anziani, il proprio residente (§7.3) |
| Integrazione | la casa della connessione, solo inserimento di misure ed eventi |
| Token personale | i permessi di lettura del titolare nella famiglia del token, ridotti agli strumenti della §7.6 |

### 8.5 Anteprima "Cosa vede l'Ospite"

`GET …/guest-view/preview` esegue la stessa funzione di proiezione di `GET …/guest-view` con un soggetto fittizio di ruolo `guest` limitato alla casa: l'anteprima coincide per costruzione con la vista reale. I codici B della vista ospite sono decifrati nel browser dell'Amministratore con la chiave `house_guest`.

## 9. Piani

### 9.1 Funzioni e limiti

I valori in grassetto sono vincolati dal prompt master; gli altri sono decisi in questa fase.

| Funzione (`feature`) | Free | Basic | Advanced | Premium |
| :--- | :---: | :---: | :---: | :---: |
| Case (`houses`) | **1** | **1** | **3** | **illimitate** |
| Residenti (`residents`) | **1** | **illimitati** | illimitati | illimitati |
| Animali (`pets`) | 1 | **illimitati** | illimitati | illimitati |
| Casa: manuale, vista ospite e tecnica, stanze, chiusure, rifiuti, contatti | **✓** | ✓ | ✓ | ✓ |
| Utenze, abbonamenti, bollette | **✓** | ✓ | ✓ | ✓ |
| Manutenzioni e inventario | ✓ | ✓ | ✓ | ✓ |
| Residenti: salute, farmaci, diario, "Chi sono", contatti di emergenza, consegne, rubrica relazioni | ✓ | ✓ | ✓ | ✓ |
| Schermata soccorso, chiamata al 118, QR emergenza | **✓** | ✓ | ✓ | ✓ |
| Messaggi SOS via SMS e WhatsApp (`sos`) | — | — | — | **✓** |
| Calendario, orari, faccende, punti, ricompense | ✓ | ✓ | ✓ | ✓ |
| Cucina, dispensa, spesa | ✓ | ✓ | ✓ | ✓ |
| Personale: telefonia, veicoli, abbonamenti personali | ✓ | ✓ | ✓ | ✓ |
| Contabilità in partita doppia (`finance`) | — | ✓ | ✓ | ✓ |
| Domotica (`home_automation`) | — | — | ✓ | ✓ |
| Webhook e token per agenti AI / MCP (`integrations`) | — | — | ✓ | ✓ |
| Assistente AI in app con proprio modello | ✓ | ✓ | ✓ | ✓ |
| Kiosk | ✓ | ✓ | ✓ | ✓ |
| Cassaforte di famiglia con PIN: documenti e conti di famiglia (`vault_family`) | — | — | **✓** | ✓ |
| Sezioni personali della Cassaforte, conti e patrimonio personale (`vault_personal`) | — | — | — | **✓** |
| Checklist fiscale e documenti fiscali (`taxes`) | — | — | — | **✓** |
| Checklist di successione e Kit Eredità (`succession`) | — | — | — | **✓** |
| Campi personalizzati (`custom_fields`) | — | — | — | **✓** |
| Registro attività consultabile (`audit_log`) | — | — | — | **✓** |
| Aggiornamento in tempo reale (`realtime_sync`) | — | — | — | **✓** |
| Marchio dell'host white-label (`branding`) | — | — | — | **✓** |
| Filigrana su stampe e report (`watermark`) | **sì** | **sì** | **no** | **no** |
| Export completo e CSV | ✓ | ✓ | ✓ | ✓ |
| Abbinamento dispositivi con QR | ✓ | ✓ | ✓ | ✓ |

Motivazioni delle scelte non vincolate:

- **Funzioni di vita quotidiana in tutti i piani** (manutenzioni, inventario, salute, calendario, cucina): lo scopo del prodotto è il cruscotto completo con adozione graduale; i limiti di Free stanno nel numero di case, residenti e animali.
- **Animali: 1 in Free**, in coerenza con 1 residente; illimitati dal Basic come da prompt.
- **Contabilità da Basic**: è la funzione con più dati e uso continuativo, adatta a famiglie con più residenti.
- **Domotica e integrazioni da Advanced**: richiedono configurazione tecnica e un costo di elaborazione continuo.
- **Export in tutti i piani**: portabilità dei dati (Regolamento generale sulla protezione dei dati).

### 9.2 Applicazione

- `packages/plans` espone `PLAN_DEFINITIONS`, `effectivePlan(family, trial, now)`, `hasFeature(plan, feature)`, `limitFor(plan, resource)`; funzioni pure condivise da web e server.
- Il controllo dei limiti avviene nella transazione di creazione con `SELECT … FOR UPDATE` sulla riga `families` e conteggio delle righe attive non bloccate.
- Le rotte con funzione di piano dichiarano `config.planFeature`; il controllo segue quello dei permessi (`403 plan_required` con `requiredPlan`).
- Dopo un declassamento le scritture su righe con `plan_locked_at` o su funzioni non più incluse rispondono `403 plan_locked`; letture ed export restano disponibili.

## 10. Limiti di frequenza

Contatori in Valkey a finestra scorrevole, condivisi tra repliche.

| Rotta o gruppo | Limite | Chiave |
| :--- | :--- | :--- |
| tutte | 600 al minuto | indirizzo IP |
| tutte le rotte autenticate | 1200 al minuto | account |
| registrazione | 5 all'ora | IP |
| accesso con password | 10 ogni 15 minuti | IP + email |
| verifica 2FA | 5 ogni 5 minuti | account |
| password dimenticata | 3 all'ora | email |
| `POST /me/vault-pin/unlock` | 1 ogni 2 secondi e 10 all'ora (oltre al blocco dopo 5 errori) | account |
| `POST /me/recovery/verify` · `POST /me/vault-pin/reset` | 5 all'ora | account |
| creazione inviti | 30 all'ora | famiglia |
| `GET /public/invitations/{token}` · `POST /invitations/accept` | 30 al minuto | IP |
| richieste di accesso | 10 all'ora | account |
| `GET /public/emergency/{token}` | 60 al minuto per token, 300 al minuto per IP | hash del token · IP |
| `GET /public/ics/{token}` | 60 all'ora | hash del token |
| webhook Home Assistant | 600 al minuto | connessione |
| creazione file | 120 all'ora | account |
| importazione ricette | 30 all'ora | famiglia |
| `POST /assistant/chat` | 60 all'ora | account |
| token personali e MCP | 300 al minuto | token |
| canali di abbinamento | 10 all'ora | account |

## 11. Altre durate

| Elemento | Durata |
| :--- | :--- |
| URL prefirmato di caricamento (`PUT`) | 10 minuti |
| URL prefirmato di download (`GET`) | 5 minuti |
| sessione | 30 giorni scorrevoli; 12 ore senza "Ricordami" |
| ri-autenticazione recente | 5 minuti |
| sessione Cassaforte | 5 minuti scorrevoli |
| canale di abbinamento | 5 minuti |
| invito | al massimo 14 giorni, uso singolo |
| link "Chiedi di entrare" | al massimo 30 giorni |
| trasferimento di proprietà | 7 giorni |
| proposta dell'assistente | 7 giorni |
| chiave di idempotenza | 24 ore |
| anti-ripetizione webhook | 10 minuti |
| token personale | al massimo 365 giorni |

## 12. Ordine di sviluppo (fase 4)

1. **Fondamenta** — monorepo e strumenti; `packages/crypto` (formati, AAD, etichette, gerarchia, vettori); `packages/plans`; `packages/contracts` (convenzioni, errori, permessi); `packages/db` (schema delle fondamenta, ruoli, funzioni, RLS, partizioni, test di isolamento); `apps/api` (sicurezza trasversale, errori, OpenAPI, autenticazione, `/me`, famiglie, case, appartenenze, registro).
2. **Chiavi e dispositivi** — `/me/keys`, dispositivi, abbinamento, PIN, recupero, ambiti e concessioni; client web di avvio.
3. **Perimetro Free** — `house`, `utilities`, `residents`, `health`, `emergency`, `qr`, `print`, `deadlines`, `notifications`, `dashboard`, `media`.
4. **Advanced** — `vault` di famiglia, `home-automation`, `webhooks`, token personali e MCP.
5. **Premium** — `personal` A, `taxes`, `succession`, `sync` realtime, `branding`, campi personalizzati, registro consultabile, SOS.
6. **Restanti moduli** — `calendar`, `rewards`, `recipes`, `pantry`, `shopping`, `finance`, `kiosk`, `assistant`, `search` avanzata.

Ogni passo si chiude con controllo dei tipi, lint, test unitari e di integrazione su PostgreSQL 18 reale, `openapi.json` aggiornato e documentazione (`README.md`, `AGENTS.md`, `ARCHITECTURE.md`).

## 13. Decisioni prese in questa fase

1. **409 per i conflitti di versione** (come da fase 1) e **428** per `If-Match` mancante.
2. **404 per risorse fuori ambito**, mai 403, contro l'enumerazione.
3. **Tipo dei problemi come URN** (`urn:domusafe:problem:<code>`), senza dipendere da un dominio pubblico.
4. **Assegnazione dei piani** della §9.1 per le funzioni non vincolate dal prompt.
5. **Token personali e MCP solo in lettura più proposte**, mai scritture dirette.
6. **Realtime ridotto fuori da Premium** agli eventi di sicurezza e alle notifiche.
7. **Limiti di frequenza** della §10 e durate della §11.

## 14. Correzioni emerse nella fase 4

1. **Cookie di sessione:** `__Secure-domusafe.session_token` invece di `__Host-` (§4; ADR 0003 nel repository).
2. **Origine sulle rotte di Better Auth:** le scritture su `/api/auth/*` passano dalla stessa lista di origini consentite delle rotte `/api/v1`, perché Better Auth verifica `Origin` solo quando la richiesta porta già dei cookie; così è bloccato anche il login CSRF.
3. **Stato attuale:** le rotte implementate e documentate in `apps/api/openapi.json` sono `system`, `identity` (`/me`, `/me/profile`) e `tenancy` (famiglie, case, membri); le altre seguono l'ordine della §12.
