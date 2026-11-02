'use client';

/**
 * Gestione licenza per account/Famiglia + avvio prova Premium 30 giorni.
 */

import { useState } from 'react';
import { BadgeCheck, Loader2, Sparkles } from 'lucide-react';
import type { DomuAccount } from '@/types/account';
import {
  TIER_LABELS,
  TIER_LIMITS,
  getMaxHouses,
  getMaxResidents,
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
          <li>
            Abitazioni: fino a {getMaxHouses(effectiveTier)}
          </li>
          <li>
            Schede ICE:{' '}
            {Number.isFinite(maxResidents) ? `max ${maxResidents}` : 'illimitate'}
          </li>
          <li>
            Cassaforte L3:{' '}
            {features.allowLevel3Vault ? 'inclusa' : 'non inclusa'}
          </li>
          <li>
            Sync cloud:{' '}
            {features.allowCloudSync ? 'inclusa' : 'non inclusa'}
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

      <p className="text-xs text-zinc-600">
        Self-host: puoi fissare il piano base con{' '}
        <code className="rounded bg-zinc-200 px-1">
          NEXT_PUBLIC_DOMUSAFE_TIER
        </code>
        . La prova Premium vale comunque una sola volta per account.
      </p>
    </section>
  );
}
