/**
 * Stampa solo-emergenza A5 / linguetta: chiusure + ICE + QR 118.
 * Separata dal manuale A4 completo.
 */

import type { DomusRunbookDocument } from '@/types/domus';
import type { FamilyBranding } from '@/types/premium';
import { BLOOD_GROUP_LABELS } from '@/lib/labels';
import { DomuSafeLogo } from '@/components/DomuSafeLogo';

interface EmergencyPrintSheetProps {
  document: DomusRunbookDocument;
  qr118Svg?: string | null;
  branding?: FamilyBranding | null;
}

export function EmergencyPrintSheet({
  document,
  qr118Svg,
  branding,
}: EmergencyPrintSheetProps) {
  const house = document.level1_public;
  const ice = document.level2_ice;
  const brandName = branding?.hostDisplayName?.trim() || 'DomuSafe';

  return (
    <article className="print-page print-only print-emergency mx-auto max-w-[128mm] border border-red-800 bg-white p-3 text-black">
      <header className="mb-2 flex items-start justify-between gap-2 border-b-2 border-red-800 pb-2">
        <div className="flex items-start gap-2">
          {branding?.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoDataUrl}
              alt=""
              className="size-8 shrink-0 object-contain"
            />
          ) : (
            <DomuSafeLogo size={32} className="shrink-0" />
          )}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-red-800">
              {brandName} · Solo emergenza
            </p>
            <h1 className="text-base font-black">
              {house.houseName || 'Scheda emergenza'}
            </h1>
            <p className="text-[9px]">
              Aggiornato {new Date(document.updatedAt).toLocaleString('it-IT')}
            </p>
          </div>
        </div>
        {qr118Svg ? (
          <div className="text-center">
            <div
              className="size-16 rounded border-2 border-red-700 p-0.5 [&_svg]:size-full"
              dangerouslySetInnerHTML={{ __html: qr118Svg }}
            />
            <p className="text-[8px] font-black text-red-800">118</p>
          </div>
        ) : null}
      </header>

      <section className="mb-2 grid grid-cols-2 gap-1 text-[10px]">
        <EmgBox title="Acqua">
          {house.utilities.waterCutoff.location}
          {house.utilities.waterCutoff.photoDataUrl ? ' · foto' : ''}
        </EmgBox>
        <EmgBox title="Gas">{house.utilities.gasCutoff.location}</EmgBox>
        <EmgBox title="Quadro">
          {house.utilities.electricPanel.breakerLocation}
        </EmgBox>
        <EmgBox title="Wi‑Fi">
          {house.wifi.ssid} / {house.wifi.password}
        </EmgBox>
      </section>

      <section className="ice-privacy-flap ice-privacy-flap-a5 text-[10px]">
        <h2 className="mb-1 text-xs font-black uppercase text-red-800">
          ICE — aprire solo per soccorso
        </h2>
        {ice.residents.length === 0 ? (
          <p>Nessun residente.</p>
        ) : (
          <ul className="space-y-1">
            {ice.residents.map((r) => (
              <li key={r.id} className="border border-red-300 p-1.5">
                <p className="font-black">
                  {r.fullName || 'Residente'} ·{' '}
                  {BLOOD_GROUP_LABELS[r.bloodGroup]}
                </p>
                <p>Allergie: {r.allergies.join(', ') || '—'}</p>
                <p>
                  Farmaci:{' '}
                  {r.lifesavingMedicines
                    .map((m) => `${m.name} @ ${m.physicalLocationInHouse}`)
                    .join(' · ') || '—'}
                </p>
                <p>
                  ICE:{' '}
                  {r.iceContacts
                    .map((c) => `${c.priority}. ${c.name} ${c.phoneNumber}`)
                    .join(' · ') || '—'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function EmgBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-50 p-1.5">
      <p className="font-black uppercase">{title}</p>
      <p>{children || '—'}</p>
    </div>
  );
}
