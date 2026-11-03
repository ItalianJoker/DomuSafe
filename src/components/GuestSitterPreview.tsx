'use client';

/**
 * Anteprima “cosa vede ospite / sitter” (sola lettura).
 * Mostra i campi L1 sicuri — niente ICE, vault, utenze Famiglia complete.
 */

import { Eye, X } from 'lucide-react';
import type { PublicHouseData } from '@/types/domus';

interface GuestSitterPreviewProps {
  house: PublicHouseData;
  familyName: string;
  onClose: () => void;
}

export function GuestSitterPreview({
  house,
  familyName,
  onClose,
}: GuestSitterPreviewProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-preview-title"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg border-2 border-zinc-900 bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--brand-forest)]">
              Anteprima invito
            </p>
            <h2
              id="guest-preview-title"
              className="flex items-center gap-2 text-xl font-black"
            >
              <Eye className="size-5" aria-hidden />
              Cosa vede ospite / sitter
            </h2>
            <p className="text-sm text-zinc-600">
              {familyName} · {house.houseName || 'Casa'} — solo lettura, senza
              dati sanitari né cassaforte.
            </p>
          </div>
          <button
            type="button"
            aria-label="Chiudi"
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-zinc-900"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <PreviewRow
            title="Wi‑Fi"
            body={`${house.wifi.ssid || '—'} / ${house.wifi.password || '—'}`}
          />
          <PreviewRow
            title="Accessi"
            body={`Citofono: ${house.access?.intercom || '—'} · Cancello: ${house.access?.gate || '—'} · Pacchi: ${house.access?.parcels || '—'}`}
          />
          <PreviewRow
            title="Acqua"
            body={`${house.utilities.waterCutoff.location || '—'} — ${house.utilities.waterCutoff.instructions || ''}`}
            photo={house.utilities.waterCutoff.photoDataUrl}
          />
          <PreviewRow
            title="Gas"
            body={`${house.utilities.gasCutoff.location || '—'} — ${house.utilities.gasCutoff.instructions || ''}`}
            photo={house.utilities.gasCutoff.photoDataUrl}
          />
          <PreviewRow
            title="Quadro elettrico"
            body={house.utilities.electricPanel.breakerLocation || '—'}
            photo={house.utilities.electricPanel.photoDataUrl}
          />
          {(house.houseSitting?.animalsNotes ||
            house.houseSitting?.plantsNotes) && (
            <PreviewRow
              title="House-sitting"
              body={`Animali: ${house.houseSitting.animalsNotes || '—'} · Piante: ${house.houseSitting.plantsNotes || '—'}`}
            />
          )}
          {house.wasteSchedule.length > 0 ? (
            <PreviewRow
              title="Rifiuti"
              body={house.wasteSchedule
                .map((w) => `${w.day}: ${w.fractions.join(', ')}`)
                .join(' · ')}
            />
          ) : null}
          <p className="rounded-md border-2 border-amber-800 bg-amber-50 p-3 font-semibold text-amber-950">
            Non vedono: schede ICE, allergie, farmaci, cassaforte, conti,
            scadenze Famiglia complete.
          </p>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({
  title,
  body,
  photo,
}: {
  title: string;
  body: string;
  photo?: string;
}) {
  return (
    <div className="rounded-md border border-zinc-300 bg-zinc-50 p-3">
      <p className="font-black uppercase tracking-wide text-zinc-800">{title}</p>
      <p className="mt-1 text-zinc-800">{body}</p>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          className="mt-2 h-28 w-full rounded border border-zinc-400 object-cover"
        />
      ) : null}
    </div>
  );
}
