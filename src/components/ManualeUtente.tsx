/**
 * Manuale Utente / Guida DomuSafe — aiuto persistente, linguaggio semplice.
 */

const SECTIONS = [
  {
    title: 'Account e accesso',
    body: 'Per usare DomuSafe serve un account. I dati restano legati al tuo profilo Famiglia/Residente, non alla sola memoria del browser. Quando riapri l’app su un dispositivo, ti chiediamo la password per sbloccare in sicurezza i contenuti protetti.',
  },
  {
    title: 'Famiglia',
    body: 'Il primo utente crea la Famiglia. Gli altri entrano con un invito (link o QR): l’invito porta anche la chiave protetta del workspace, così tutti i membri vedono le stesse case e checklist. Case, residenti e successione appartengono alla Famiglia; le tasse restano sulla scheda Residente.',
  },
  {
    title: 'Casa (livello 1)',
    body: 'Annota dove chiudere acqua, gas ed elettricità, il Wi‑Fi, i rifiuti e i contatti degli artigiani. Sono informazioni pensate anche per gli ospiti.',
  },
  {
    title: 'Emergenza ICE (livello 2)',
    body: 'Schede sanitarie di residenti e animali: gruppo sanguigno, allergie, farmaci salvavita, contatti di emergenza. In stampa restano sotto la linguetta da piegare.',
  },
  {
    title: 'Tasse italiane (scheda residente)',
    body: 'Con Premium (o durante la prova) su ogni scheda residente trovi la checklist annuale (CU, precompilata, 730, ISEE, IMU, TARI, acconti). Segna «fatto» per anno e aggiungi note: restano protette insieme ai dati della Famiglia.',
  },
  {
    title: 'Cassaforte (livello 3)',
    body: 'Advanced: documenti di Famiglia (utenze, eredità digitale) protetti da un PIN. Premium: anche patrimonio personale (conti, polizze, lavoro). PIN sbagliato → «PIN errato o dati non validi».',
  },
  {
    title: 'Checklist successione (Famiglia)',
    body: 'Con Premium, nella Cassaforte trovi la checklist successione per tutta la Famiglia (documenti, testamento, banche, polizze, eredità digitale, scadenze). Non è per un singolo residente.',
  },
  {
    title: 'Campi personalizzati',
    body: 'Solo Premium (o prova): oltre ai campi previsti puoi aggiungere etichette libere su casa, residenti, animali, cassaforte e successione. Free, Basic e Advanced usano solo i campi standard.',
  },
  {
    title: 'Come sono protetti i dati',
    body: 'Prima del salvataggio, DomuSafe protegge i contenuti sensibili sul tuo dispositivo. Sul server restano solo dati già protetti. La Cassaforte ha un PIN aggiuntivo. Conserva con cura password e PIN.',
  },
  {
    title: 'QR e stampa',
    body: 'In Stampa/QR generi il codice da appendere e stampi il foglio A4. Free e Basic mostrano il marchio DomuSafe; Advanced e Premium stampano senza marchio.',
  },
  {
    title: 'Altri telefoni',
    body: 'Con Premium (o prova) colleghi un altro telefono o computer con un QR, in modo cifrato. Ogni caricamento tiene anche le versioni precedenti (backup storico): puoi ripristinare una revisione sul dispositivo. Free e Basic salvano sull’account senza questa funzione tra dispositivi.',
  },
  {
    title: 'Chiave di licenza (SaaS)',
    body: 'Nella sezione Piano puoi incollare una chiave firmata ricevuta dall’autore. DomuSafe verifica la firma sul server e attiva il piano indicato. Senza chiave restano piano base, prova Premium e l’eventuale piano impostato da chi gestisce l’installazione.',
  },
  {
    title: 'Registro accessi (scan)',
    body: 'Con Premium, nella sezione Premium trovi il registro di chi ha inquadrato il QR di monitoraggio per gli ospiti e quando. Puoi anche annotare accessi a mano. Non mostra dati sanitari né cassaforte.',
  },
  {
    title: 'Avvisi SOS',
    body: 'Premium può inviare SMS o WhatsApp ai contatti ICE. Chi gestisce l’installazione sceglie come far partire i messaggi. Usa «Prova» nell’app prima di un invio reale.',
  },
  {
    title: 'Marchio host',
    body: 'Premium permette un marchio personalizzato (nome struttura, colore, logo piccolo) su stampa e sulla pagina di conferma QR per gli ospiti.',
  },
  {
    title: 'Kit eredità',
    body: 'Nella Cassaforte, con Premium, puoi stampare o salvare come PDF il kit eredità: checklist successione della Famiglia in formato A4 da archiviare o consegnare al professionista di fiducia.',
  },
  {
    title: 'Piani: Free, Basic, Advanced, Premium',
    body: 'Free: Casa + Emergenza, una scheda residente, Watermark in stampa, solo campi standard. Basic: come Free con residenti illimitati. Advanced: aggiunge la Cassaforte Famiglia (PIN) e stampa senza Watermark; niente tasse, patrimonio personale, successione, sync né campi personalizzati. Premium: tutto (tasse sulle schede residenti, patrimonio personale, successione Famiglia, sync, campi personalizzati, registro accessi, SOS, marchio host).',
  },
  {
    title: 'Prova Premium',
    body: 'Ogni account può avviare una prova Premium di 30 giorni una sola volta, dalla sezione Piano. Durante la prova usi tutte le funzioni Premium. Alla scadenza torni al piano base (di solito Free).',
  },
  {
    title: 'Installare DomuSafe sul telefono',
    body: 'Su molti telefoni puoi «aggiungere alla schermata Home» DomuSafe come app. Se sei senza rete vedi la shell offline; per entrare nell’account e nei dati Famiglia serve di nuovo la connessione.',
  },
] as const;

export function ManualeUtente() {
  return (
    <article className="space-y-4">
      <header>
        <h2 className="font-display text-2xl font-black text-[var(--brand-ink)]">
          Manuale Utente
        </h2>
        <p className="text-sm font-semibold text-[var(--brand-forest)]">
          Guida DomuSafe — come usare le funzioni principali
        </p>
      </header>

      <ol className="space-y-3">
        {SECTIONS.map((section) => (
          <li
            key={section.title}
            className="border-l-4 border-[var(--brand-gold)] bg-white/70 py-3 pl-4 pr-2"
          >
            <h3 className="font-display text-lg font-bold text-[var(--brand-ink)]">
              {section.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-zinc-800">
              {section.body}
            </p>
          </li>
        ))}
      </ol>
    </article>
  );
}
