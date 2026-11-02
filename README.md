# DomuSafe

![License](https://img.shields.io/badge/license-BSL%201.1-blue)
![Version](https://img.shields.io/badge/version-0.6.0-green)
![Devices](https://img.shields.io/badge/telefono%20·%20tablet%20·%20computer-ok-emerald)

**Your home handbook and emergency hub — private, family-ready, works on phone, tablet, and computer.**

## Che cos’è

**DomuSafe** è il manuale digitale della casa e un punto di riferimento in caso di emergenza.

Lo apri dal telefono, dal tablet o dal computer: stessi contenuti, pulsanti grandi, parole semplici.
Ti registri, crei la tua **Famiglia**, invitì chi vive con te (anche inquadrando un QR), salvi dove chiudere acqua e gas, le schede per il soccorso e — se vuoi — i documenti più riservati dietro un PIN.

I dati appartengono al tuo **account** (per **Famiglia** o per **Residente**) e vengono protetti sul dispositivo prima di essere salvati. Non dipendono dalla sola memoria del browser.

## Come iniziare

1. Apri DomuSafe e **crea un account** (email e una password che ricordi).
2. **Crea la Famiglia**, oppure entra con l’invito / QR che ti hanno mandato.
3. Compila **Casa** (utenze, Wi‑Fi) e **Emergenza** (schede sanitarie ICE).

Al primo accesso compare una guida breve. Quando vuoi, riapri la **Guida DomuSafe** (Manuale Utente) dal menu.

## Cosa trovi nell’app

| Sezione | A cosa serve |
| :--- | :--- |
| **Casa** | Dove chiudere acqua, gas e luce; Wi‑Fi; rifiuti; artigiani |
| **Emergenza (ICE)** | Schede per il 118 / 112: allergie, farmaci, contatti |
| **Cassaforte** | Documenti riservati protetti da PIN (da Advanced in su) · kit eredità (Premium) |
| **Stampa / QR** | Foglio A4 da appendere e codice da scansionare |
| **Premium** | Registro scan, SOS SMS/WhatsApp, marchio host |
| **Famiglia** | Inviti e QR per aggiungere i membri |
| **Piano** | Free, Basic, Advanced, Premium e prova Premium 30 giorni |
| **Altri telefoni** | Collegare un altro dispositivo in modo cifrato (Premium o prova) |

### Tre livelli di protezione

1. **Pubblico** — sicuro da lasciare agli ospiti  
2. **ICE** — per il soccorso; in stampa resta sotto la linguetta pieghevole  
3. **Cassaforte** — protetta da PIN (PIN sbagliato → *«PIN errato o dati non validi»*)

## Piani

| Piano | Cosa include | Residenti | In più |
| :--- | :--- | :--- | :--- |
| **Free** | Livelli 1 e 2 | 1 | Marchio DomuSafe in stampa · campi standard |
| **Basic** | Livelli 1 e 2 | Illimitati | Marchio in stampa · campi standard |
| **Advanced** | + Cassaforte (documenti di Famiglia) | Illimitati | Stampa senza marchio |
| **Premium** | Tutto | Illimitati | Tasse IT, successione, sync, campi personalizzati, **registro accessi**, **SOS**, **white-label**, **kit eredità PDF** |

Ogni account può attivare **una sola volta** la prova **Premium di 30 giorni**, dalla sezione **Piano**.

## Funzioni Premium in breve

- **Registro accessi** — QR di monitoraggio per ospiti; vedi chi ha scansionato e quando (senza esporre dati sanitari).
- **SOS** — messaggio ai contatti ICE via SMS e/o WhatsApp (provider configurabile sull’installazione).
- **Marchio host** — nome, colore e logo piccolo su stampa e pagina di conferma QR.
- **Kit eredità** — stampa / «Salva come PDF» della checklist successione Famiglia.

## Su telefono, tablet e computer

- Interfaccia pensata per le dita: pulsanti ampi, testo leggibile, niente gergo.
- Sul **telefono** il menu delle sezioni sta in basso; su **tablet** e **computer** in alto.
- Con Premium (o durante la prova) puoi collegare un altro dispositivo da **Altri telefoni** con un QR: i contenuti partono già protetti.

## Privacy, in breve

DomuSafe protegge i contenuti sensibili **sul tuo dispositivo** prima del salvataggio.
Sul server restano solo dati già protetti e le informazioni necessarie all’accesso. Non c’è una copia “in chiaro” nel browser come fonte ufficiale dei tuoi dati.

Il registro accessi memorizza solo metadati (quando, etichetta dispositivo/hash), non schede ICE né cassaforte.

## Avvisi SOS — variabili d’ambiente (host)

Nessun SDK a pagamento obbligatorio. Scegli il provider:

| Variabile | Valori / uso |
| :--- | :--- |
| `DOMUSAFE_SOS_PROVIDER` | `log` (predefinito, solo registro), `webhook`, `twilio` |
| `DOMUSAFE_SOS_WEBHOOK_URL` | URL che riceve il JSON SOS (se provider = webhook) |
| `DOMUSAFE_SOS_WEBHOOK_TOKEN` | Bearer opzionale per il webhook |
| `DOMUSAFE_TWILIO_ACCOUNT_SID` | Account Twilio (se provider = twilio) |
| `DOMUSAFE_TWILIO_AUTH_TOKEN` | Token Twilio |
| `DOMUSAFE_TWILIO_FROM_NUMBER` | Numero mittente SMS (es. `+39…`) |
| `DOMUSAFE_TWILIO_WHATSAPP_FROM` | Mittente WhatsApp (es. `whatsapp:+14155238886`) |

Altre variabili già usate dall’app: `DOMUSAFE_DATA_DIR`, `DOMUSAFE_SYNC_DIR`, `NEXT_PUBLIC_DOMUSAFE_TIER` (self-host / test).

## Licenza — Business Source License 1.1 (BSL 1.1)

DomuSafe è rilasciato sotto **BSL 1.1**. Dopo **36 mesi** da ogni versione pubblica, quella versione passa automaticamente ad **Apache 2.0**.

| | |
| :--- | :--- |
| **Consentito** | Uso personale e familiare; installazione a casa per la tua Famiglia |
| **Non consentito** | Offrire DomuSafe ad altri come servizio cloud / SaaS a pagamento (riservato all’autore — *Use Limitation*) |

Testo completo della licenza: [`LICENSE.md`](./LICENSE.md) (copia anche in [`LICENSE`](./LICENSE)).

---

*DomuSafe — la casa a portata di mano, anche nell’emergenza.*
