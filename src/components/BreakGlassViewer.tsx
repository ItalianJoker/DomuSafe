'use client';

/**
 * Consultazione pubblica L1/L2 break-glass — zero login.
 * Panic UX: disclaimer legale, bottoni XL, 118 one-tap, audit già lato API.
 */

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Droplets,
  Flame,
  Phone,
  ShieldAlert,
  Wifi,
  Zap,
} from 'lucide-react';
import type { EmergencyBreakGlassPack } from '@/types/domus';
import {
  EMERGENCY_PACK_ERROR_MESSAGE,
  decodeEmergencyKeyFragment,
  openEmergencyPack,
  parseEmergencyKeyFromHash,
} from '@/lib/crypto-emergency';
import { BLOOD_GROUP_LABELS, MOBILITY_LABELS } from '@/lib/labels';
import { DomuSafeLogo } from '@/components/DomuSafeLogo';

interface BreakGlassViewerProps {
  token: string;
}

type Phase = 'loading' | 'disclaimer' | 'open' | 'error';

export function BreakGlassViewer({ token }: BreakGlassViewerProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [pack, setPack] = useState<EmergencyBreakGlassPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [familyName, setFamilyName] = useState<string>('');
  const [openedAt, setOpenedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const keyFrag = parseEmergencyKeyFromHash(
          typeof window !== 'undefined' ? window.location.hash : ''
        );
        if (!keyFrag) {
          throw new Error(
            'Chiave emergenza assente nel QR. Usa il QR completo (con #k=…).'
          );
        }
        const res = await fetch(
          `/api/emergency/${encodeURIComponent(token)}?ack=1`
        );
        const data = (await res.json()) as {
          error?: string;
          familyName?: string;
          blob?: { ivBase64: string; ciphertextBase64: string };
        };
        if (!res.ok || !data.blob) {
          throw new Error(data.error || 'Pacchetto non disponibile');
        }
        const opened = await openEmergencyPack(
          {
            version: 'emg-1',
            ivBase64: data.blob.ivBase64,
            ciphertextBase64: data.blob.ciphertextBase64,
          },
          decodeEmergencyKeyFragment(keyFrag)
        );
        if (cancelled) return;
        setPack(opened);
        setFamilyName(data.familyName || opened.familyName);
        setPhase('disclaimer');
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : EMERGENCY_PACK_ERROR_MESSAGE
        );
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (phase === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--brand-ink)] px-4 text-white">
        <p className="text-lg font-bold">Caricamento emergenza…</p>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-red-950 px-4 text-white">
        <div className="max-w-md space-y-3 text-center">
          <AlertTriangle className="mx-auto size-12" aria-hidden />
          <h1 className="text-2xl font-black">QR emergenza non valido</h1>
          <p className="font-semibold">{error}</p>
        </div>
      </main>
    );
  }

  if (phase === 'disclaimer' && pack) {
    return (
      <main className="min-h-screen bg-red-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-lg space-y-6">
          <DomuSafeLogo size={48} className="mx-auto" />
          <h1 className="text-center text-3xl font-black">
            Accesso emergenza
          </h1>
          <p className="text-center text-lg font-semibold text-red-100">
            {familyName} · {pack.houseName}
          </p>
          <div className="rounded-lg border-4 border-white bg-red-900 p-4 text-sm leading-relaxed">
            <p className="mb-2 font-black uppercase tracking-wide">
              Disclaimer legale
            </p>
            <p>
              Stai per aprire dati sanitari e istruzioni di casa destinati al
              soccorso (118/112) o a chi è autorizzato in emergenza. L’accesso
              viene registrato con data e ora. Non usare queste informazioni per
              scopi diversi dall’emergenza. Continuando dichiari di aver letto
              questo avviso.
            </p>
          </div>
          <a
            href="tel:118"
            className="flex min-h-16 w-full items-center justify-center gap-3 rounded-lg border-4 border-white bg-red-600 text-2xl font-black hover:bg-red-500"
          >
            <Phone className="size-8" aria-hidden />
            Chiama 118
          </a>
          <button
            type="button"
            className="flex min-h-16 w-full items-center justify-center gap-3 rounded-lg border-4 border-amber-300 bg-amber-400 text-xl font-black text-zinc-950 hover:bg-amber-300"
            onClick={() => {
              setOpenedAt(new Date().toISOString());
              setPhase('open');
            }}
          >
            <ShieldAlert className="size-7" aria-hidden />
            Ho letto · Apri schede emergenza
          </button>
        </div>
      </main>
    );
  }

  if (!pack) return null;

  return (
    <main className="min-h-screen bg-[var(--brand-cream)] px-3 py-4 text-zinc-950 sm:px-4">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="rounded-lg border-4 border-red-800 bg-red-50 p-4">
          <p className="text-xs font-black uppercase tracking-widest text-red-800">
            Emergenza · senza login
          </p>
          <h1 className="mt-1 text-2xl font-black">
            {pack.houseName || 'Manuale emergenza'}
          </h1>
          <p className="text-sm font-semibold text-zinc-700">
            {familyName}
            {openedAt
              ? ` · Aperto ${new Date(openedAt).toLocaleString('it-IT')}`
              : ''}
          </p>
          <a
            href="tel:118"
            className="mt-4 flex min-h-16 items-center justify-center gap-3 rounded-lg border-4 border-red-900 bg-red-700 text-xl font-black text-white"
          >
            <Phone className="size-7" aria-hidden />
            Chiama 118
          </a>
        </header>

        <section className="space-y-3 rounded-lg border-2 border-zinc-900 bg-white p-4">
          <h2 className="text-lg font-black">Casa — chiusure e Wi‑Fi</h2>
          <UtilityLine
            icon={<Droplets className="size-5" aria-hidden />}
            title="Acqua"
            body={`${pack.level1.utilities.waterCutoff.location} — ${pack.level1.utilities.waterCutoff.instructions}`}
            photo={pack.level1.utilities.waterCutoff.photoDataUrl}
          />
          <UtilityLine
            icon={<Flame className="size-5" aria-hidden />}
            title="Gas"
            body={`${pack.level1.utilities.gasCutoff.location} — ${pack.level1.utilities.gasCutoff.instructions}`}
            photo={pack.level1.utilities.gasCutoff.photoDataUrl}
          />
          <UtilityLine
            icon={<Zap className="size-5" aria-hidden />}
            title="Elettrico"
            body={`${pack.level1.utilities.electricPanel.breakerLocation} / ${pack.level1.utilities.electricPanel.externalMeterLocation}`}
            photo={pack.level1.utilities.electricPanel.photoDataUrl}
          />
          <UtilityLine
            icon={<Wifi className="size-5" aria-hidden />}
            title="Wi‑Fi"
            body={`${pack.level1.wifi.ssid} / ${pack.level1.wifi.password}`}
          />
          {pack.level1.access ? (
            <div className="text-sm">
              <p>
                <strong>Citofono:</strong> {pack.level1.access.intercom || '—'}
              </p>
              <p>
                <strong>Cancello:</strong> {pack.level1.access.gate || '—'}
              </p>
              <p>
                <strong>Pacchi:</strong> {pack.level1.access.parcels || '—'}
              </p>
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-black text-red-900">
            Schede di emergenza
          </h2>
          {pack.level2.residents.length === 0 ? (
            <p className="text-sm text-zinc-700">Nessun residente pubblicato.</p>
          ) : (
            pack.level2.residents.map((r) => (
              <article
                key={r.id}
                className="space-y-2 rounded-lg border-4 border-red-800 bg-white p-4"
              >
                <div className="flex gap-3">
                  {r.photoDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.photoDataUrl}
                      alt=""
                      className="size-16 rounded-md border-2 border-zinc-900 object-cover"
                    />
                  ) : null}
                  <div>
                    <h3 className="text-xl font-black">{r.fullName || 'Residente'}</h3>
                    <p className="text-sm">
                      {BLOOD_GROUP_LABELS[r.bloodGroup]} ·{' '}
                      {MOBILITY_LABELS[r.mobilityStatus]}
                    </p>
                    {r.idDocumentHint ? (
                      <p className="text-xs text-zinc-600">
                        Documento: {r.idDocumentHint}
                      </p>
                    ) : null}
                  </div>
                </div>
                <p>
                  <strong>Allergie:</strong>{' '}
                  {r.allergies.join(', ') || 'nessuna annotata'}
                </p>
                <p>
                  <strong>Patologie:</strong>{' '}
                  {r.chronicConditions.join(', ') || '—'}
                </p>
                <p>
                  <strong>Dispositivi:</strong>{' '}
                  {r.medicalDevices.join(', ') || '—'}
                </p>
                <p>
                  <strong>Camera:</strong> {r.sleepingRoom || '—'}
                </p>
                {r.lifesavingMedicines.length > 0 ? (
                  <ul className="text-sm">
                    {r.lifesavingMedicines.map((m, i) => (
                      <li key={`${r.id}-med-${i}`}>
                        <strong>{m.name}</strong> — {m.dosageSchedule} ·{' '}
                        {m.physicalLocationInHouse}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ul className="space-y-2">
                  {r.iceContacts.map((c) => (
                    <li key={`${r.id}-ice-${c.priority}`}>
                      <a
                        href={`tel:${c.phoneNumber.replace(/\s+/g, '')}`}
                        className="flex min-h-14 items-center justify-between gap-2 rounded-md border-2 border-zinc-900 bg-emerald-50 px-3 font-bold"
                      >
                        <span>
                          Emergenza {c.priority}: {c.name} ({c.relationship})
                        </span>
                        <Phone className="size-5 shrink-0" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            ))
          )}
        </section>

        {pack.level2.pets.length > 0 ? (
          <section className="space-y-3 rounded-lg border-2 border-zinc-900 bg-amber-50 p-4">
            <h2 className="text-lg font-black">Animali</h2>
            {pack.level2.pets.map((pet, i) => (
              <div key={`pet-${i}`} className="text-sm">
                <p className="font-bold">
                  {pet.name} · {pet.species}
                </p>
                <p>Nascondigli panico: {pet.panicHideouts || '—'}</p>
                {pet.vetEmergencyH24.phone ? (
                  <a
                    href={`tel:${pet.vetEmergencyH24.phone.replace(/\s+/g, '')}`}
                    className="mt-2 inline-flex min-h-12 items-center gap-2 font-bold text-emerald-900 underline"
                  >
                    <Phone className="size-4" aria-hidden />
                    Vet H24 {pet.vetEmergencyH24.clinicName}
                  </a>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function UtilityLine({
  icon,
  title,
  body,
  photo,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  photo?: string;
}) {
  return (
    <div className="flex gap-2 rounded-md border border-zinc-300 bg-zinc-50 p-3 text-sm">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p>
          <strong>{title}:</strong> {body || '—'}
        </p>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            className="mt-2 max-h-40 w-full rounded-md border-2 border-zinc-900 object-cover"
          />
        ) : null}
      </div>
    </div>
  );
}
