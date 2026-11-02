'use client';

/**
 * Tutorial primo accesso: Famiglia, livelli 1–2–3, QR, stampa, licenze.
 */

import { useState } from 'react';
import {
  BookOpen,
  KeyRound,
  Printer,
  ShieldAlert,
  Users,
  BadgeCheck,
} from 'lucide-react';

const STEPS = [
  {
    title: 'Famiglia',
    body: 'La Famiglia è il vostro spazio condiviso. Invita chi vive con te con link o QR: vedrete le stesse case.',
    icon: Users,
  },
  {
    title: 'Casa',
    body: 'Utenze, Wi‑Fi, rifiuti e artigiani: utili anche agli ospiti, senza dati sanitari.',
    icon: BookOpen,
  },
  {
    title: 'Emergenza (ICE)',
    body: 'Schede sanitarie per il soccorso 118/112. In stampa restano sotto la linguetta privacy.',
    icon: ShieldAlert,
  },
  {
    title: 'Cassaforte',
    body: 'Documenti riservati protetti da un PIN. Disponibile con Advanced, Premium o durante la prova.',
    icon: KeyRound,
  },
  {
    title: 'QR e stampa A4',
    body: 'Genera il QR da appendere e stampa il foglio A4. Free e Basic mostrano il marchio DomuSafe.',
    icon: Printer,
  },
  {
    title: 'Piano',
    body: 'Free e Basic: Casa ed Emergenza. Advanced: anche Cassaforte Famiglia. Premium: tasse, successione, sync e altro. Puoi provare Premium 30 giorni, una sola volta.',
    icon: BadgeCheck,
  },
] as const;

interface OnboardingTutorialProps {
  onComplete: () => void;
}

export function OnboardingTutorial({ onComplete }: OnboardingTutorialProps) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index]!;
  const Icon = step.icon;
  const last = index === STEPS.length - 1;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
    >
      <div className="w-full max-w-md rounded-2xl border-2 border-[var(--brand-gold)] bg-[var(--brand-cream)] p-5 text-[var(--brand-ink)] shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--brand-forest)]">
          Guida rapida · {index + 1}/{STEPS.length}
        </p>
        <div className="mt-3 flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-[var(--brand-ink)] text-[var(--brand-gold)]">
            <Icon className="size-6" aria-hidden />
          </span>
          <div>
            <h2 id="tutorial-title" className="font-display text-xl font-black">
              {step.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-800">
              {step.body}
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          {index > 0 ? (
            <button
              type="button"
              className="min-h-12 flex-1 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold"
              onClick={() => setIndex((i) => i - 1)}
            >
              Indietro
            </button>
          ) : (
            <button
              type="button"
              className="min-h-12 flex-1 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold"
              onClick={onComplete}
            >
              Salta
            </button>
          )}
          <button
            type="button"
            className="min-h-12 flex-1 rounded-md border-2 border-[var(--brand-ink)] bg-[var(--brand-ink)] px-4 font-bold text-white"
            onClick={() => {
              if (last) onComplete();
              else setIndex((i) => i + 1);
            }}
          >
            {last ? 'Inizia' : 'Avanti'}
          </button>
        </div>
      </div>
    </div>
  );
}
