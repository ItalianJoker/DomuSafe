'use client';

/**
 * Gestione piano per account/Famiglia + avvio prova Premium 30 giorni.
 * Copy allineata a license-tiers.md (italiano chiaro).
 */

import { useState } from 'react';
import { BadgeCheck, Loader2, Sparkles } from 'lucide-react';
import type { DomuAccount } from '@/types/account';
import { TIER_LABELS } from '@/lib/licensing';
import {
  TIER_COPY,
  TIER_SUMMARY,
  PREMIUM_TRIAL_COPY,
} from '@/lib/tier-copy';
import { isTrialActive, trialDaysRemaining } from '@/lib/trial';
import type { LicenseTier } from '@/types/domus';

const PLAN_ORDER: LicenseTier[] = ['FREE', 'BASIC', 'ADVANCED', 'PREMIUM'];

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
  const active = TIER_COPY[effectiveTier];

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
        <h2 className="font-display text-2xl font-black">Il tuo piano</h2>
        <p className="text-sm text-zinc-700">
          Cosa include DomuSafe per il tuo account
          {familyName ? ` · Famiglia «${familyName}»` : ''}
        </p>
      </header>

      <div className="rounded-lg border-2 border-zinc-900 bg-white p-4">
        <p className="inline-flex items-center gap-2 text-lg font-black">
          <BadgeCheck
            className="size-6 text-[var(--brand-forest)]"
            aria-hidden
          />
          Piano attivo: {TIER_LABELS[effectiveTier]}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-800">
          {active.audience}
        </p>
        <p className="mt-2 text-sm text-zinc-700">
          Piano base permanente:{' '}
          <strong>{TIER_LABELS[account.license.baseTier]}</strong>
          {trialOn ? ' · in questo momento stai usando la prova Premium' : ''}
        </p>

        <h3 className="mt-4 text-sm font-bold uppercase tracking-wide text-zinc-600">
          Cosa puoi fare ora
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-800">
          {active.includes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {active.limits.length > 0 ? (
          <>
            <h3 className="mt-4 text-sm font-bold uppercase tracking-wide text-zinc-600">
              Non incluso in questo piano
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-800">
              {active.limits.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        ) : null}

        {trialOn ? (
          <p className="mt-3 rounded-md border-2 border-emerald-800 bg-emerald-50 px-3 py-2 font-semibold text-emerald-950">
            {PREMIUM_TRIAL_COPY.active(days)}
          </p>
        ) : account.license.trialUsed ? (
          <p className="mt-3 text-sm text-zinc-600">
            {PREMIUM_TRIAL_COPY.used}
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
            {PREMIUM_TRIAL_COPY.button}
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

      <div className="space-y-3">
        <h3 className="font-display text-xl font-bold">Confronta i piani</h3>
        <p className="text-sm text-zinc-700">
          Quattro piani, dal più semplice al completo. I nomi restano Free,
          Basic, Advanced e Premium.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {PLAN_ORDER.map((tier) => {
            const copy = TIER_COPY[tier];
            const isActive = tier === effectiveTier;
            return (
              <article
                key={tier}
                className={`rounded-lg border-2 p-4 ${
                  isActive
                    ? 'border-[var(--brand-ink)] bg-[var(--brand-cream)]'
                    : 'border-zinc-900 bg-white'
                }`}
              >
                <h4 className="font-display text-lg font-black">
                  {copy.name}
                  {isActive ? (
                    <span className="ml-2 text-sm font-bold text-[var(--brand-forest)]">
                      · attivo
                    </span>
                  ) : null}
                </h4>
                <p className="mt-1 text-sm leading-relaxed text-zinc-800">
                  {copy.audience}
                </p>
                <p className="mt-2 text-xs font-semibold leading-snug text-zinc-600">
                  {TIER_SUMMARY[tier]}
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-800">
                  {copy.includes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {copy.limits.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600">
                    {copy.limits.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-zinc-600">{PREMIUM_TRIAL_COPY.footnote}</p>
    </section>
  );
}
