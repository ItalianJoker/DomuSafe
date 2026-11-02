/**
 * Manuale Utente / Guida DomuSafe — aiuto persistente, linguaggio semplice.
 */

const SECTIONS = [
  {
    title: 'Account e accesso',
    body: 'DomuSafe richiede la registrazione. Account e dati restano sul server self-host (non in IndexedDB). Dopo un aggiornamento pagina ti viene chiesta di nuovo la password solo per sbloccare in memoria la chiave di cifratura.',
  },
  {
    title: 'Famiglia',
    body: 'Il primo utente crea una Famiglia sull’account. Gli altri entrano con invito (link o QR). Case, residenti e checklist appartengono all’account → Famiglia / Residente.',
  },
  {
    title: 'Livello 1 — Casa',
    body: 'Salva dove chiudere acqua/gas/elettrico, Wi‑Fi, calendario rifiuti e contatti artigiani. Ideale da condividere con ospiti.',
  },
  {
    title: 'Livello 2 — ICE',
    body: 'Schede sanitarie dei residenti e animali: gruppo sanguigno, allergie, farmaci salvavita, contatti di emergenza. In stampa restano sotto la linguetta da piegare.',
  },
  {
    title: 'Tasse italiane (scheda residente)',
    body: 'Su ogni scheda residente trovi la checklist annuale (CU, precompilata, 730, ISEE, IMU, TARI, acconti). Segna «fatto» per anno e aggiungi note: restano cifrate con il runbook della Famiglia.',
  },
  {
    title: 'Livello 3 — Cassaforte',
    body: 'Dati patrimoniali e di eredità cifrati con un PIN separato (AES-256-GCM). PIN errato → «PIN errato o dati non validi». Serve piano Advanced, Premium o prova attiva.',
  },
  {
    title: 'Checklist successione (Famiglia)',
    body: 'Nella scheda Cassaforte, sotto il patrimonio, c’è la checklist successione per tutta la Famiglia (documenti, testamento, banche, polizze, legacy digitale, scadenze). Non è per singolo residente. Dati cifrati a riposo.',
  },
  {
    title: 'Cifratura (minaccia)',
    body: 'Prima del salvataggio sull’account, runbook e checklist sono cifrati nel browser (AES-GCM + chiave derivata dalla password). Il server self-host conserva solo ciphertext e hash password. Livello 3 usa un PIN aggiuntivo. Non c’è una copia durevole in chiaro nel browser. Proteggi password/PIN e il volume dati del server.',
  },
  {
    title: 'QR e stampa',
    body: 'Nella scheda Stampa/QR generi il codice da appendere e stampi il foglio A4. Piano Basic: watermark DomuSafe. Advanced/Premium: senza watermark.',
  },
  {
    title: 'Sync cloud',
    body: 'Con Advanced/Premium puoi creare una sync E2EE e collegare un altro device con QR. Il server salva solo dati già cifrati.',
  },
  {
    title: 'Licenze e prova Premium',
    body: 'In Licenze vedi piano, limiti e giorni di prova. Ogni account può avviare una prova Premium di 30 giorni una sola volta. Allo scadere torni al piano base (di solito Basic).',
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
