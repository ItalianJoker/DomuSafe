'use client';

/**
 * Gestione licenza per account/Famiglia + avvio prova Premium 30 giorni.
 * Piani: Free / Basic / Advanced / Premium (binding license-tiers).
 */

import { useState } from 'react';
import { BadgeCheck, Loader2, Sparkles } from 'lucide-react';
import type { DomuAccount } from '@/types/account';
import {
  TIER_LABELS,
  TIER_LIMITS,
  getMaxHouses,
  getMaxResidents,
  shouldShowPrintWatermark,
} from '@/lib/licensing';
import {
  isTrialActive,
  trialDaysRemaining,
} from '@/lib/trial';
import type { LicenseTier } from '@/types/domus';

interface LicensePanelProps {
  account: DomuAccount;
  effectiveTier: LicenseTier;
  familyName?: string | null;
  onStartTrial: () => Promise<void>;
}

export function LicensePanel({
  account,
  effectiveTier,
  familyName,
  onStartTrial,
}: LicensePanelProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trialOn = isTrialActive(account.license);
  const days = trialDaysRemaining(account.license);
  const features = TIER_LIMITS[effectiveTier];
  const maxResidents = getMaxResidents(effectiveTier);

  const start = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await onStartTrial();
      setMessage('Prova Premium attiva per 30 giorni.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prova non disponibile');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <header>
        <h2 className="font-display text-2xl font-black">Licenze</h2>
        <p className="text-sm text-zinc-700">
          Piano per account
          {familyName ? ` · Famiglia «${familyName}»` : ''}
        </p>
      </header>

      <div className="rounded-lg border-2 border-zinc-900 bg-white p-4">
        <p className="inline-flex items-center gap-2 text-lg font-black">
          <BadgeCheck className="size-6 text-[var(--brand-forest)]" aria-hidden />
          Piano attivo: {TIER_LABELS[effectiveTier]}
        </p>
        <ul className="mt-3 space-y-1 text-sm text-zinc-800">
          <li>
            Piano base: <strong>{TIER_LABELS[account.license.baseTier]}</strong>
          </li>
          <li>Abitazioni: fino a {getMaxHouses(effectiveTier)}</li>
          <li>
            Schede ICE:{' '}
            {Number.isFinite(maxResidents) ? `max ${maxResidents}` : 'illimitate'}
          </li>
          <li>
            Watermark stampa:{' '}
            {shouldShowPrintWatermark(effectiveTier) ? 'sì' : 'no'}
          </li>
          <li>
            Cassaforte L3:{' '}
            {features.allowLevel3Vault ? 'inclusa' : 'non inclusa'}
          </li>
          <li>
            Patrimonio personale:{' '}
            {features.allowPersonalPatrimonio ? 'incluso' : 'non incluso'}
          </li>
          <li>
            Tasse IT / successione:{' '}
            {features.allowResidentTax ? 'incluse' : 'non incluse'}
          </li>
          <li>
            Sync cloud E2EE:{' '}
            {features.allowCloudSync ? 'inclusa' : 'non inclusa'}
          </li>
          <li>
            Campi personalizzati:{' '}
            {features.allowCustomFields ? 'inclusi' : 'solo campi standard'}
          </li>
          <li>
            Registro scan / SOS / marchio host:{' '}
            {features.auditLog ? 'inclusi' : 'non inclusi'}
          </li>
        </ul>

        {trialOn ? (
          <p className="mt-3 rounded-md border-2 border-emerald-800 bg-emerald-50 px-3 py-2 font-semibold text-emerald-950">
            Prova Premium attiva · {days} giorn{days === 1 ? 'o' : 'i'} rimanenti
          </p>
        ) : account.license.trialUsed ? (
          <p className="mt-3 text-sm text-zinc-600">
            Prova Premium già utilizzata su questo account.
          </p>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void start()}
            className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-[var(--brand-ink)] bg-[var(--brand-gold)] px-4 font-black text-[var(--brand-ink)] disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-5" aria-hidden />
            )}
            Avvia prova Premium 30 giorni
          </button>
        )}

        {message ? (
          <p className="mt-3 font-semibold text-emerald-900" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 font-semibold text-red-800" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border-2 border-zinc-900 bg-white">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="border-b-2 border-zinc-900 bg-zinc-100">
            <tr>
              <th className="px-3 py-2">Piano</th>
              <th className="px-3 py-2">Livelli</th>
              <th className="px-3 py-2">Residenti</th>
              <th className="px-3 py-2">Extra</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-zinc-200">
              <td className="px-3 py-2 font-bold">Free</td>
              <td className="px-3 py-2">1 + 2</td>
              <td className="px-3 py-2">1</td>
              <td className="px-3 py-2">Campi standard · watermark</td>
            </tr>
            <tr className="border-b border-zinc-200">
              <td className="px-3 py-2 font-bold">Basic</td>
              <td className="px-3 py-2">1 + 2</td>
              <td className="px-3 py-2">Illimitati</td>
              <td className="px-3 py-2">Campi standard · watermark</td>
            </tr>
            <tr className="border-b border-zinc-200">
              <td className="px-3 py-2 font-bold">Advanced</td>
              <td className="px-3 py-2">+ L3 Famiglia</td>
              <td className="px-3 py-2">Illimitati</td>
              <td className="px-3 py-2">No watermark · no sync/tasse/custom</td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-bold">Premium</td>
              <td className="px-3 py-2">Tutto</td>
              <td className="px-3 py-2">Illimitati</td>
              <td className="px-3 py-2">
                Sync · tasse · successione · custom · audit · SOS · white-label
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-600">
        La prova Premium vale una sola volta per account. Dopo la scadenza torni
        al piano base indicato sopra.
      </p>
    </section>
  );
}
