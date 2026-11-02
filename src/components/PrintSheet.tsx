/**
 * Foglio A4 stampabile: Livello 1 in chiaro + Livello 2 sotto linguetta privacy.
 * Classe `.ice-privacy-flap` attiva il messaggio di piega solo in @media print.
 */

import type { DomusRunbookDocument } from '@/types/domus';
import { BLOOD_GROUP_LABELS, MOBILITY_LABELS } from '@/lib/labels';
import { shouldShowPrintWatermark } from '@/lib/licensing';

interface PrintSheetProps {
  document: DomusRunbookDocument;
  qrSvg?: string | null;
}

export function PrintSheet({ document, qrSvg }: PrintSheetProps) {
  const house = document.level1_public;
  const ice = document.level2_ice;

  return (
    <article className="print-page print-only mx-auto max-w-[194mm] border border-zinc-300 bg-white p-4 text-black">
      <header className="mb-3 flex items-start justify-between gap-4 border-b-2 border-black pb-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest">DomuSafe</p>
          <h1 className="text-xl font-black">
            {house.houseName || 'Manuale casa'}
          </h1>
          <p className="text-xs">
            Piano {document.tier} · Aggiornato{' '}
            {new Date(document.updatedAt).toLocaleString('it-IT')}
          </p>
        </div>
        {qrSvg ? (
          <div
            className="size-24 shrink-0 [&_svg]:size-full"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        ) : null}
      </header>

      <section className="mb-3">
        <h2 className="mb-1 text-sm font-black uppercase">Livello 1 — Casa</h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <p>
            <strong>Acqua:</strong> {house.utilities.waterCutoff.location} —{' '}
            {house.utilities.waterCutoff.instructions}
          </p>
          <p>
            <strong>Gas:</strong> {house.utilities.gasCutoff.location} —{' '}
            {house.utilities.gasCutoff.instructions}
          </p>
          <p>
            <strong>Elettrico:</strong>{' '}
            {house.utilities.electricPanel.breakerLocation} / contatore{' '}
            {house.utilities.electricPanel.externalMeterLocation}
          </p>
          <p>
            <strong>Caldaia:</strong> {house.utilities.heatingBoiler.location}{' '}
            {house.utilities.heatingBoiler.notes
              ? `— ${house.utilities.heatingBoiler.notes}`
              : ''}
          </p>
          <p>
            <strong>Wi‑Fi:</strong> {house.wifi.ssid} / {house.wifi.password}
          </p>
          <p>
            <strong>Rifiuti:</strong>{' '}
            {house.wasteSchedule
              .map((w) => `${w.day}: ${w.fractions.join('+')}`)
              .join('; ') || '—'}
          </p>
        </div>
        {house.artisanContacts.length > 0 ? (
          <p className="mt-1 text-xs">
            <strong>Artigiani:</strong>{' '}
            {house.artisanContacts
              .map((a) => `${a.trade} ${a.name} ${a.phone}`)
              .join(' · ')}
          </p>
        ) : null}
        {shouldShowPrintWatermark(document.tier) ? (
          <p className="mt-2 text-[9px] font-semibold text-zinc-600">
            Stampato con DomuSafe · piano BASIC
          </p>
        ) : null}
      </section>

      <section className="ice-privacy-flap text-xs">
        <h2 className="mb-2 text-sm font-black uppercase text-red-800">
          Livello 2 — ICE (solo soccorso)
        </h2>
        {ice.residents.length === 0 ? (
          <p>Nessuna scheda residente.</p>
        ) : (
          ice.residents.map((r) => (
            <div key={r.id} className="mb-2 border-t border-red-200 pt-1">
              <p className="font-bold">
                {r.fullName || 'Residente'} · {r.birthYear} ·{' '}
                {BLOOD_GROUP_LABELS[r.bloodGroup]} ·{' '}
                {MOBILITY_LABELS[r.mobilityStatus]} · Camera: {r.sleepingRoom}
              </p>
              <p>
                Allergie: {r.allergies.join(', ') || '—'} · Patologie:{' '}
                {r.chronicConditions.join(', ') || '—'} · Dispositivi:{' '}
                {r.medicalDevices.join(', ') || '—'}
              </p>
              {r.lifesavingMedicines.length > 0 ? (
                <p>
                  Farmaci:{' '}
                  {r.lifesavingMedicines
                    .map(
                      (m) =>
                        `${m.name} (${m.dosageSchedule}) @ ${m.physicalLocationInHouse}`
                    )
                    .join('; ')}
                </p>
              ) : null}
              {r.iceContacts.length > 0 ? (
                <p>
                  Contatti:{' '}
                  {r.iceContacts
                    .map(
                      (c) =>
                        `#${c.priority} ${c.name} (${c.relationship}) ${c.phoneNumber}${
                          c.hasHouseKeys ? ' [chiavi]' : ''
                        }`
                    )
                    .join(' · ')}
                </p>
              ) : null}
            </div>
          ))
        )}
        {ice.pets.length > 0 ? (
          <div className="mt-2 border-t border-red-200 pt-1">
            <p className="font-bold">Animali</p>
            {ice.pets.map((p, i) => (
              <p key={`print-pet-${i}`}>
                {p.name} ({p.species}) — nascondigli: {p.panicHideouts} — vet:{' '}
                {p.vetEmergencyH24.clinicName} {p.vetEmergencyH24.phone}{' '}
                {p.vetEmergencyH24.address}
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </article>
  );
}
