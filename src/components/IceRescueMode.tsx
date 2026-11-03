'use client';

/**
 * Modalità soccorso ICE a schermo intero: solo dati critici + 118.
 * Zero editor — per chi è già in casa con l’app aperta.
 */

import { Phone, X } from 'lucide-react';
import type { DomusRunbookDocument } from '@/types/domus';
import { BLOOD_GROUP_LABELS } from '@/lib/labels';

interface IceRescueModeProps {
  document: DomusRunbookDocument;
  familyName: string;
  onClose: () => void;
}

export function IceRescueMode({
  document,
  familyName,
  onClose,
}: IceRescueModeProps) {
  const residents = document.level2_ice.residents.filter((r) =>
    r.fullName.trim()
  );
  const house = document.level1_public;

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-red-950 text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rescue-title"
    >
      <div className="mx-auto max-w-2xl space-y-5 px-3 py-4 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-red-200">
              Modalità soccorso
            </p>
            <h2 id="rescue-title" className="text-2xl font-black sm:text-3xl">
              {house.houseName || familyName}
            </h2>
            <p className="text-sm text-red-100">{familyName}</p>
          </div>
          <button
            type="button"
            aria-label="Chiudi modalità soccorso"
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-white/80"
            onClick={onClose}
          >
            <X className="size-6" aria-hidden />
          </button>
        </div>

        <a
          href="tel:118"
          className="flex min-h-20 w-full items-center justify-center gap-3 rounded-lg border-4 border-white bg-red-600 text-3xl font-black hover:bg-red-500"
        >
          <Phone className="size-9" aria-hidden />
          118
        </a>

        <section className="rounded-lg border-2 border-white/40 bg-red-900/60 p-3 text-sm">
          <p>
            <strong>Acqua:</strong>{' '}
            {house.utilities.waterCutoff.location || '—'}
          </p>
          <p>
            <strong>Gas:</strong> {house.utilities.gasCutoff.location || '—'}
          </p>
          <p>
            <strong>Quadro:</strong>{' '}
            {house.utilities.electricPanel.breakerLocation || '—'}
          </p>
        </section>

        {residents.length === 0 ? (
          <p className="rounded-lg border-2 border-amber-300 bg-amber-400 p-4 font-bold text-zinc-950">
            Nessuna scheda residente compilata.
          </p>
        ) : (
          residents.map((r) => (
            <article
              key={r.id}
              className="space-y-2 rounded-lg border-4 border-white bg-white p-4 text-zinc-950"
            >
              <div className="flex gap-3">
                {r.photoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.photoDataUrl}
                    alt=""
                    className="size-20 rounded-md border-2 border-zinc-900 object-cover"
                  />
                ) : null}
                <div>
                  <h3 className="text-2xl font-black">{r.fullName}</h3>
                  <p className="text-lg font-bold">
                    Sangue: {BLOOD_GROUP_LABELS[r.bloodGroup]}
                  </p>
                  {r.sleepingRoom ? (
                    <p className="text-sm">Camera: {r.sleepingRoom}</p>
                  ) : null}
                </div>
              </div>
              <p className="text-lg">
                <strong>Allergie:</strong>{' '}
                {r.allergies.join(', ') || 'nessuna annotata'}
              </p>
              <p className="text-lg">
                <strong>Farmaci:</strong>{' '}
                {r.lifesavingMedicines
                  .filter((m) => m.name.trim())
                  .map(
                    (m) =>
                      `${m.name}${m.physicalLocationInHouse ? ` @ ${m.physicalLocationInHouse}` : ''}`
                  )
                  .join(' · ') || '—'}
              </p>
              <ul className="space-y-2">
                {r.iceContacts
                  .filter((c) => c.phoneNumber.trim())
                  .slice(0, 3)
                  .map((c) => (
                    <li key={`${r.id}-ice-${c.priority}`}>
                      <a
                        href={`tel:${c.phoneNumber.replace(/\s+/g, '')}`}
                        className="flex min-h-14 items-center justify-between gap-2 rounded-md border-2 border-zinc-900 bg-emerald-50 px-3 text-base font-bold"
                      >
                        <span>
                          Emergenza {c.priority}: {c.name} · {c.phoneNumber}
                        </span>
                        <Phone className="size-5 shrink-0" aria-hidden />
                      </a>
                    </li>
                  ))}
              </ul>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
