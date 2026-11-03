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
    title: 'Panoramica (dashboard)',
    body: 'La Home mostra la Famiglia in un colpo d’occhio e propone un solo «prossimo passo» (casa → residenti → emergenza → utenze → cassaforte), senza riempire lo schermo. La checklist completa resta nascosta finché non la apri. C’è anche la compilazione rapida guidata.',
  },
  {
    title: 'Casa (livello 1)',
    body: 'Annota le chiusure di emergenza (acqua, gas, quadro), il Wi‑Fi (copia + QR), citofono/cancello/pacchi e house-sitting. Ogni campo si compila a mano; la guida rapida è opzionale. Vista ospite/sitter o tecnica. I contratti Famiglia non stanno qui: usa la sezione Utenze.',
  },
  {
    title: 'Utenze (Famiglia)',
    body: 'Nella sezione Utenze del menu gestisci Luce, Gas, Internet, Acqua, tassa sui rifiuti, abbonamenti familiari e scadenze (es. controllo caldaia). Restano protetti con i dati della casa. I conti bancari Famiglia invece sono in Cassaforte (codice di sblocco).',
  },
  {
    title: 'QR emergenza senza login',
    body: 'In Stampa / QR puoi pubblicare un QR di emergenza: chi lo inquadra apre Casa + schede di emergenza senza account, dopo un avviso, con tasto 118. L’accesso viene registrato. Aggiorna il QR dopo modifiche importanti.',
  },
  {
    title: 'Emergenza e soccorso (livello 2)',
    body: 'Schede sanitarie di residenti e animali: gruppo sanguigno, allergie, farmaci salvavita, contatti di emergenza. Ogni campo è modificabile a mano sulla scheda. Sulla scheda chiusa trovi i collegamenti a mobile, abbonamenti, conti e tasse. In stampa le parti sanitarie restano sotto la linguetta da piegare.',
  },
  {
    title: 'Tasse italiane (scheda residente)',
    body: 'Con Premium (o durante la prova) su ogni scheda residente trovi la checklist annuale (Certificazione Unica, dichiarazione precompilata, modello 730, indicatore economico, imposta sugli immobili, tassa rifiuti, acconti). Segna «fatto» per anno e aggiungi note: restano protette insieme ai dati della Famiglia.',
  },
  {
    title: 'Tema chiaro / scuro',
    body: 'Dall’intestazione puoi scegliere tema chiaro, scuro o sistema. La scelta viene salvata sul tuo account.',
  },
  {
    title: 'Conti bancari',
    body: 'I conti della Famiglia stanno nella Cassaforte (da Advanced in su), protetti da PIN. I conti personali di ciascun Residente stanno sulla sua scheda Emergenza e richiedono Premium (o prova).',
  },
  {
    title: 'Cassaforte (livello 3)',
    body: 'Advanced: documenti di Famiglia (archivio bollette, eredità digitale, conti bancari Famiglia) protetti da un PIN. Premium: anche patrimonio personale (polizze, lavoro) e campi liberi. PIN sbagliato → «PIN errato o dati non validi».',
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
    title: 'Avvisi di soccorso',
    body: 'Premium può inviare SMS o WhatsApp ai contatti di emergenza. Chi gestisce l’installazione sceglie come far partire i messaggi. Usa «Prova» nell’app prima di un invio reale.',
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
    body: 'Free: Casa + Emergenza (utenze/abbonamenti standard), una scheda residente, marchio DomuSafe in stampa, solo campi standard. Basic: come Free con residenti illimitati. Advanced: aggiunge la Cassaforte Famiglia (PIN, conti Famiglia) e stampa senza marchio DomuSafe; niente tasse, conti/patrimonio personale, successione, sync né campi personalizzati. Premium: tutto (tasse e conti personali sulle schede residenti, patrimonio personale in cassaforte, successione Famiglia, sync, campi/servizi personalizzati, registro accessi, avvisi di soccorso, marchio host).',
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
