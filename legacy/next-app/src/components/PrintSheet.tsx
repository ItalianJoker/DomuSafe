/**
 * Foglio A4 stampabile: box L1 + ICE sotto linguetta + QR app + QR rosso 118.
 */

import type { DomusRunbookDocument } from '@/types/domus';
import type { FamilyBranding } from '@/types/premium';
import { BLOOD_GROUP_LABELS, MOBILITY_LABELS } from '@/lib/labels';
import { shouldShowPrintWatermark } from '@/lib/licensing';
import { DomuSafeLogo } from '@/components/DomuSafeLogo';

interface PrintSheetProps {
  document: DomusRunbookDocument;
  qrSvg?: string | null;
  qr118Svg?: string | null;
  branding?: FamilyBranding | null;
}

export function PrintSheet({
  document,
  qrSvg,
  qr118Svg,
  branding,
}: PrintSheetProps) {
  const house = document.level1_public;
  const ice = document.level2_ice;
  const brandName = branding?.hostDisplayName?.trim() || 'DomuSafe';

  return (
    <article className="print-page print-only print-runbook mx-auto max-w-[194mm] border border-zinc-300 bg-white p-4 text-black">
      <header className="mb-3 flex items-start justify-between gap-4 border-b-2 border-black pb-2">
        <div className="flex items-start gap-2">
          {branding?.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoDataUrl}
              alt=""
              className="size-9 shrink-0 object-contain"
            />
          ) : (
            <DomuSafeLogo size={36} className="shrink-0" />
          )}
          <div>
            <p
              className="text-xs font-bold uppercase tracking-widest"
              style={
                branding?.accentColor
                  ? { color: branding.accentColor }
                  : undefined
              }
            >
              {brandName}
            </p>
            <h1 className="text-xl font-black">
              {house.houseName || 'Manuale casa'}
            </h1>
            <p className="text-xs">
              Piano {document.tier} · Aggiornato{' '}
              {new Date(document.updatedAt).toLocaleString('it-IT')}
            </p>
            {branding?.tagline ? (
              <p className="text-xs text-zinc-600">{branding.tagline}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {qrSvg ? (
            <div className="text-center">
              <div
                className="size-20 [&_svg]:size-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <p className="text-[8px] font-bold">App</p>
            </div>
          ) : null}
          {qr118Svg ? (
            <div className="text-center">
              <div
                className="size-20 rounded border-2 border-red-700 p-0.5 [&_svg]:size-full"
                dangerouslySetInnerHTML={{ __html: qr118Svg }}
              />
              <p className="text-[8px] font-black text-red-800">118</p>
            </div>
          ) : null}
        </div>
      </header>

      <section className="mb-3">
        <h2 className="mb-2 text-sm font-black uppercase">Livello 1 — Casa</h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <PrintBox title="Acqua">
            {house.utilities.waterCutoff.location} —{' '}
            {house.utilities.waterCutoff.instructions}
          </PrintBox>
          <PrintBox title="Gas">
            {house.utilities.gasCutoff.location} —{' '}
            {house.utilities.gasCutoff.instructions}
          </PrintBox>
          <PrintBox title="Luce / quadro">
            {house.utilities.electricPanel.breakerLocation} / contatore{' '}
            {house.utilities.electricPanel.externalMeterLocation}
          </PrintBox>
          <PrintBox title="Caldaia">
            {house.utilities.heatingBoiler.location}
            {house.utilities.heatingBoiler.notes
              ? ` — ${house.utilities.heatingBoiler.notes}`
              : ''}
          </PrintBox>
          <PrintBox title="Wi‑Fi">
            {house.wifi.ssid} / {house.wifi.password}
          </PrintBox>
          <PrintBox title="Accessi">
            Citofono: {house.access?.intercom || '—'} · Cancello:{' '}
            {house.access?.gate || '—'} · Pacchi: {house.access?.parcels || '—'}
          </PrintBox>
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
          <div className="mt-2 flex items-center gap-2 text-[9px] font-semibold text-zinc-600">
            <DomuSafeLogo size={16} />
            <span>Watermark DomuSafe · piano Free/Basic</span>
          </div>
        ) : null}
      </section>

      <section className="ice-privacy-flap text-xs">
        <h2 className="mb-2 text-sm font-black uppercase text-red-800">
          Livello 2 — Emergenza (solo soccorso)
        </h2>
        {ice.residents.length === 0 ? (
          <p>Nessun residente compilato.</p>
        ) : (
          <ul className="space-y-2">
            {ice.residents.map((r) => (
              <li key={r.id} className="border border-red-300 p-2">
                <p className="font-black">
                  {r.fullName || 'Residente'} · {BLOOD_GROUP_LABELS[r.bloodGroup]}{' '}
                  · {MOBILITY_LABELS[r.mobilityStatus]}
                </p>
                <p>Allergie: {r.allergies.join(', ') || '—'}</p>
                <p>Patologie: {r.chronicConditions.join(', ') || '—'}</p>
                <p>Dispositivi: {r.medicalDevices.join(', ') || '—'}</p>
                <p>Camera: {r.sleepingRoom || '—'}</p>
                {r.lifesavingMedicines.map((m, i) => (
                  <p key={`${r.id}-m-${i}`}>
                    Farmaco: {m.name} — {m.dosageSchedule} @{' '}
                    {m.physicalLocationInHouse}
                  </p>
                ))}
                <p>
                  Contatti di emergenza:{' '}
                  {r.iceContacts
                    .map(
                      (c) =>
                        `${c.priority}. ${c.name} ${c.phoneNumber}${c.hasHouseKeys ? ' (chiavi)' : ''}`
                    )
                    .join(' · ') || '—'}
                </p>
              </li>
            ))}
          </ul>
        )}
        {ice.pets.length > 0 ? (
          <div className="mt-2">
            <p className="font-bold">Animali</p>
            {ice.pets.map((p, i) => (
              <p key={`pet-${i}`}>
                {p.name} ({p.species}) — nascondigli: {p.panicHideouts || '—'} —
                vet {p.vetEmergencyH24.clinicName} {p.vetEmergencyH24.phone}
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </article>
  );
}

function PrintBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-50 p-2">
      <p className="font-black uppercase tracking-wide">{title}</p>
      <p>{children || '—'}</p>
    </div>
  );
}
