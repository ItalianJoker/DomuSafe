'use client';

/**
 * Panoramica Famiglia — hub di navigazione facile (casa, residenti, emergenza).
 * Un tap porta alle sezioni operative; linguaggio non tecnico.
 */

import {
  Home,
  ShieldAlert,
  Users,
  Printer,
  ShieldCheck,
  Sparkles,
  Phone,
} from 'lucide-react';
import type { DomusRunbookDocument, LicenseTier } from '@/types/domus';
import { EngagementNudge } from '@/components/EngagementNudge';
import type { EngagementTarget } from '@/lib/engagement';

export type DashboardTarget =
  | 'casa'
  | 'ice'
  | 'famiglia'
  | 'stampa'
  | 'cassaforte'
  | 'premium'
  | 'home';

interface HomeDashboardProps {
  familyName: string;
  document: DomusRunbookDocument;
  tier: LicenseTier;
  onGo: (tab: DashboardTarget) => void;
  onStartWizard: () => void;
}

export function HomeDashboard({
  familyName,
  document,
  tier,
  onGo,
  onStartWizard,
}: HomeDashboardProps) {
  const house = document.level1_public.houseName || 'Casa senza nome';
  const residents = document.level2_ice.residents.length;
  const pets = document.level2_ice.pets.length;
  const hasWifi = Boolean(document.level1_public.wifi.ssid.trim());
  const hasCutoff = Boolean(
    document.level1_public.utilities.waterCutoff.location ||
      document.level1_public.utilities.gasCutoff.location
  );

  const go = (target: EngagementTarget | DashboardTarget) => {
    onGo(target as DashboardTarget);
  };

  return (
    <section aria-labelledby="dash-title" className="space-y-5">
      <header>
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--brand-forest)]">
          Panoramica Famiglia
        </p>
        <h2
          id="dash-title"
          className="mt-1 font-display text-2xl font-black text-[var(--brand-ink)] sm:text-3xl"
        >
          {familyName}
        </h2>
        <p className="mt-2 max-w-2xl text-base text-zinc-700">
          Dashboard della casa: residenti, emergenze e documenti — un passo alla
          volta, senza fretta.
        </p>
      </header>

      <EngagementNudge
        document={document}
        tier={tier}
        onGo={go}
        onStartWizard={onStartWizard}
      />

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="inline-flex min-h-14 items-center gap-2 rounded-md border-2 border-[var(--brand-ink)] bg-[var(--brand-ink)] px-5 text-base font-bold text-white"
          onClick={onStartWizard}
        >
          <Sparkles className="size-5" aria-hidden />
          Compilazione rapida
        </button>
        <a
          href="tel:118"
          className="inline-flex min-h-14 items-center gap-2 rounded-md border-2 border-red-900 bg-red-700 px-5 text-base font-bold text-white"
        >
          <Phone className="size-5" aria-hidden />
          Chiama 118
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DashCard
          icon={<Home className="size-7" aria-hidden />}
          title="Casa"
          body={`${house}. Wi‑Fi ${hasWifi ? 'ok' : 'da compilare'} · chiusure ${hasCutoff ? 'ok' : 'da compilare'}.`}
          cta="Apri Casa"
          onClick={() => onGo('casa')}
        />
        <DashCard
          icon={<ShieldAlert className="size-7" aria-hidden />}
          title="Emergenza / residenti"
          body={`${residents} resident${residents === 1 ? 'e' : 'i'}${pets ? ` · ${pets} animal${pets === 1 ? 'e' : 'i'}` : ''}. Schede ICE e servizi personali.`}
          cta="Apri Emergenza"
          tone="danger"
          onClick={() => onGo('ice')}
        />
        <DashCard
          icon={<Users className="size-7" aria-hidden />}
          title="Famiglia"
          body="Inviti, QR per i membri e spazio condiviso."
          cta="Gestisci Famiglia"
          onClick={() => onGo('famiglia')}
        />
        <DashCard
          icon={<Printer className="size-7" aria-hidden />}
          title="Stampa e QR emergenza"
          body="Foglio A4, QR casa e QR break-glass senza login per il soccorso."
          cta="Apri Stampa / QR"
          onClick={() => onGo('stampa')}
        />
        <DashCard
          icon={<ShieldCheck className="size-7" aria-hidden />}
          title="Cassaforte"
          body="Documenti Famiglia e conti dietro PIN (da Advanced)."
          cta="Apri Cassaforte"
          onClick={() => onGo('cassaforte')}
        />
      </div>
    </section>
  );
}

function DashCard({
  icon,
  title,
  body,
  cta,
  onClick,
  tone = 'default',
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[9rem] flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition hover:brightness-95 ${
        tone === 'danger'
          ? 'border-red-900 bg-rose-50'
          : 'border-zinc-900 bg-white'
      }`}
    >
      <span className="text-[var(--brand-ink)]">{icon}</span>
      <span className="text-lg font-black text-zinc-950">{title}</span>
      <span className="flex-1 text-sm text-zinc-700">{body}</span>
      <span className="text-sm font-bold text-[var(--brand-forest)] underline">
        {cta}
      </span>
    </button>
  );
}
