'use client';

/**
 * Nudge + checklist progressiva sulla Panoramica.
 * Mostra un solo “prossimo passo”; la lista completa resta collassata.
 */

import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Sparkles } from 'lucide-react';
import type { LicenseTier, DomusRunbookDocument } from '@/types/domus';
import {
  buildEngagementSteps,
  engagementProgress,
  type EngagementTarget,
} from '@/lib/engagement';

interface EngagementNudgeProps {
  document: DomusRunbookDocument;
  tier: LicenseTier;
  onGo: (target: EngagementTarget) => void;
  onStartWizard: () => void;
}

export function EngagementNudge({
  document,
  tier,
  onGo,
  onStartWizard,
}: EngagementNudgeProps) {
  const steps = buildEngagementSteps(document, tier);
  const { done, total, percent, next } = engagementProgress(steps);
  const [openList, setOpenList] = useState(false);

  if (done === total && total > 0) {
    return (
      <aside className="rounded-lg border-2 border-emerald-800 bg-emerald-50 p-4">
        <p className="flex items-center gap-2 font-black text-emerald-950">
          <CheckCircle2 className="size-5" aria-hidden />
          Casa e Famiglia ben impostate ({done}/{total})
        </p>
        <p className="mt-1 text-sm text-emerald-950/80">
          Puoi raffinare quando vuoi. In emergenza: Stampa / QR o Chiama 118.
        </p>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Prossimi passi DomuSafe"
      className="space-y-3 rounded-lg border-2 border-[var(--brand-ink)] bg-white p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--brand-forest)]">
            Un passo alla volta
          </p>
          <h3 className="text-lg font-black text-zinc-950">
            Completamento Famiglia · {done}/{total}
          </h3>
        </div>
        <div
          className="h-2 w-28 overflow-hidden rounded-full bg-zinc-200"
          aria-hidden
        >
          <div
            className="h-full bg-[var(--brand-forest)]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {next ? (
        <div className="rounded-md border-2 border-amber-800 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-950">Prossimo passo</p>
          <p className="text-base font-black text-zinc-950">{next.title}</p>
          <p className="text-sm text-zinc-700">{next.blurb}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-[var(--brand-ink)] px-4 font-bold text-white"
              onClick={() => onGo(next.target)}
            >
              {next.cta}
            </button>
            {next.id === 'casa' || next.id === 'residenti' ? (
              <button
                type="button"
                className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold"
                onClick={onStartWizard}
              >
                <Sparkles className="size-5" aria-hidden />
                Wizard rapido
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="inline-flex min-h-12 items-center gap-2 text-sm font-bold text-zinc-800 underline"
        aria-expanded={openList}
        onClick={() => setOpenList((v) => !v)}
      >
        {openList ? (
          <ChevronUp className="size-4" aria-hidden />
        ) : (
          <ChevronDown className="size-4" aria-hidden />
        )}
        {openList ? 'Nascondi checklist' : 'Mostra tutta la checklist'}
      </button>

      {openList ? (
        <ul className="space-y-2">
          {steps.map((step) => (
            <li
              key={step.id}
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                step.done
                  ? 'border-emerald-700 bg-emerald-50'
                  : step.available
                    ? 'border-zinc-300 bg-zinc-50'
                    : 'border-zinc-200 bg-zinc-100 text-zinc-500'
              }`}
            >
              {step.done ? (
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-emerald-800"
                  aria-hidden
                />
              ) : (
                <Circle
                  className="mt-0.5 size-5 shrink-0 text-zinc-500"
                  aria-hidden
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold">{step.title}</p>
                <p className="text-xs text-zinc-600">
                  {step.available ? step.blurb : step.lockedHint}
                </p>
              </div>
              {step.available && !step.done ? (
                <button
                  type="button"
                  className="shrink-0 font-bold text-[var(--brand-forest)] underline"
                  onClick={() => onGo(step.target)}
                >
                  Vai
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
