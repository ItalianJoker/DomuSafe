'use client';

/**
 * Panoramica Famiglia — tre colonne Casa | Residenti | Emergenza + reminder.
 * Un tap porta alle sezioni; publish QR emergenza quando casa+ICE sono ok.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Home,
  Phone,
  PlugZap,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Users,
} from 'lucide-react';
import type { DomusRunbookDocument, LicenseTier } from '@/types/domus';
import { EngagementNudge } from '@/components/EngagementNudge';
import type { EngagementTarget } from '@/lib/engagement';
import {
  dashboardColumns,
  isReadyToPublishEmergency,
  type DashboardColumnId,
} from '@/lib/dashboard-completeness';
import {
  deadlinesByWindow,
  listUpcomingDeadlines,
} from '@/lib/deadlines';
import { buildEmergencyPack } from '@/lib/emergency-pack';
import {
  buildEmergencyUrl,
  createEmergencyKeyRaw,
  sealEmergencyPack,
} from '@/lib/crypto-emergency';
import { EmptyStateCta } from '@/components/EmptyStateCta';

export type DashboardTarget =
  | 'casa'
  | 'utenze'
  | 'ice'
  | 'famiglia'
  | 'stampa'
  | 'cassaforte'
  | 'premium'
  | 'home';

interface HomeDashboardProps {
  familyId: string;
  familyName: string;
  document: DomusRunbookDocument;
  tier: LicenseTier;
  onGo: (tab: DashboardTarget) => void;
  onStartWizard: () => void;
  onOpenRescue: () => void;
  onStatus?: (msg: string) => void;
}

export function HomeDashboard({
  familyId,
  familyName,
  document,
  tier,
  onGo,
  onStartWizard,
  onOpenRescue,
  onStatus,
}: HomeDashboardProps) {
  const columns = useMemo(() => dashboardColumns(document), [document]);
  const deadlines = useMemo(
    () => deadlinesByWindow(listUpcomingDeadlines(document)),
    [document]
  );
  const readyPublish = isReadyToPublishEmergency(document);
  const isBlank =
    !document.level1_public.houseName.trim() &&
    document.level2_ice.residents.length === 0;

  const [publishBusy, setPublishBusy] = useState(false);
  const [lastBreakGlass, setLastBreakGlass] = useState<{
    at: string;
    actorLabel: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/family/${familyId}/emergency`);
        const data = (await res.json()) as {
          lastBreakGlass?: { at: string; actorLabel: string } | null;
        };
        if (!cancelled && data.lastBreakGlass) {
          setLastBreakGlass(data.lastBreakGlass);
        }
      } catch {
        /* ignore — Panoramica resta usabile offline di sessione */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  const publishOneTap = useCallback(async () => {
    if (
      !window.confirm(
        'Pubblicare il QR emergenza con i dati Casa + ICE attuali? Chi lo inquadra apre le schede senza login.'
      )
    ) {
      return;
    }
    setPublishBusy(true);
    try {
      const keyRaw = createEmergencyKeyRaw();
      const pack = buildEmergencyPack({ familyName, document });
      const sealed = await sealEmergencyPack(pack, keyRaw);
      const res = await fetch(`/api/family/${familyId}/emergency`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rotateToken: false,
          blob: {
            ivBase64: sealed.ivBase64,
            ciphertextBase64: sealed.ciphertextBase64,
          },
        }),
      });
      const data = (await res.json()) as { error?: string; token?: string };
      if (!res.ok || !data.token) {
        throw new Error(data.error || 'Pubblicazione non riuscita');
      }
      const nextUrl = buildEmergencyUrl(
        window.location.origin,
        data.token,
        keyRaw
      );
      sessionStorage.setItem(`domusafe-emg-url:${familyId}`, nextUrl);
      onStatus?.('QR emergenza pubblicato. Apri Stampa / QR per copiarlo.');
      onGo('stampa');
    } catch (err) {
      onStatus?.(
        err instanceof Error ? err.message : 'Errore pubblicazione QR'
      );
    } finally {
      setPublishBusy(false);
    }
  }, [document, familyId, familyName, onGo, onStatus]);

  const goColumn = (id: DashboardColumnId) => {
    if (id === 'casa') onGo('casa');
    else onGo('ice');
  };

  const go = (target: EngagementTarget | DashboardTarget) => {
    onGo(target as DashboardTarget);
  };

  if (isBlank) {
    return (
      <section aria-labelledby="dash-title" className="space-y-5">
        <DashHeader familyName={familyName} />
        <EmptyStateCta
          title="Inizia dalla casa"
          body="Compila in pochi minuti nome casa, chiusure e la prima scheda residente. Un solo passo alla volta."
          cta="Avvia compilazione rapida"
          onAction={onStartWizard}
        />
      </section>
    );
  }

  const hasDeadlineBlock =
    deadlines.overdue.length +
      deadlines.week.length +
      deadlines.month.length >
    0;

  return (
    <section aria-labelledby="dash-title" className="space-y-5">
      <DashHeader familyName={familyName} />

      <EngagementNudge
        document={document}
        tier={tier}
        onGo={go}
        onStartWizard={onStartWizard}
      />

      <div className="grid gap-3 md:grid-cols-3">
        {columns.map((col) => (
          <button
            key={col.id}
            type="button"
            onClick={() => goColumn(col.id)}
            className={`flex min-h-[9rem] flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition hover:brightness-95 ${
              col.id === 'emergenza'
                ? 'border-red-900 bg-rose-50'
                : 'border-zinc-900 bg-white'
            }`}
          >
            <span className="text-[var(--brand-ink)]">
              {col.id === 'casa' ? (
                <Home className="size-7" aria-hidden />
              ) : col.id === 'residenti' ? (
                <Users className="size-7" aria-hidden />
              ) : (
                <ShieldAlert className="size-7" aria-hidden />
              )}
            </span>
            <span className="text-lg font-black text-zinc-950">{col.title}</span>
            <span className="text-3xl font-black tabular-nums text-[var(--brand-forest)]">
              {col.percent}%
            </span>
            <span className="text-sm text-zinc-700">{col.blurb}</span>
            <span
              className="mt-auto h-2 w-full overflow-hidden rounded-full bg-zinc-200"
              aria-hidden
            >
              <span
                className={`block h-full ${
                  col.id === 'emergenza' ? 'bg-red-700' : 'bg-[var(--brand-forest)]'
                }`}
                style={{ width: `${col.percent}%` }}
              />
            </span>
          </button>
        ))}
      </div>

      {hasDeadlineBlock ? (
        <aside className="rounded-lg border-2 border-amber-900 bg-amber-50 p-4">
          <h3 className="flex items-center gap-2 text-lg font-black text-amber-950">
            <CalendarClock className="size-5" aria-hidden />
            Scadenze
          </h3>
          <DeadlineGroup
            title="Scadute"
            items={deadlines.overdue}
            onOpen={(src) => onGo(src === 'famiglia' ? 'utenze' : 'ice')}
          />
          <DeadlineGroup
            title="Questa settimana"
            items={deadlines.week}
            onOpen={(src) => onGo(src === 'famiglia' ? 'utenze' : 'ice')}
          />
          <DeadlineGroup
            title="Questo mese"
            items={deadlines.month}
            onOpen={(src) => onGo(src === 'famiglia' ? 'utenze' : 'ice')}
          />
        </aside>
      ) : null}

      {lastBreakGlass ? (
        <p className="rounded-md border-2 border-zinc-900 bg-white px-4 py-3 text-sm font-semibold text-zinc-800">
          Ultimo accesso break-glass:{' '}
          {new Date(lastBreakGlass.at).toLocaleString('it-IT')}
          {lastBreakGlass.actorLabel
            ? ` · ${lastBreakGlass.actorLabel}`
            : ''}
        </p>
      ) : (
        <p className="text-sm text-zinc-600">
          Nessun accesso break-glass registrato finora.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {readyPublish ? (
          <button
            type="button"
            disabled={publishBusy}
            className="inline-flex min-h-14 items-center gap-2 rounded-md border-2 border-red-900 bg-red-700 px-5 text-base font-bold text-white disabled:opacity-50"
            onClick={() => void publishOneTap()}
          >
            <Siren className="size-5" aria-hidden />
            {publishBusy ? 'Pubblicazione…' : 'Pubblica QR emergenza'}
          </button>
        ) : null}
        <button
          type="button"
          className="inline-flex min-h-14 items-center gap-2 rounded-md border-2 border-red-900 bg-white px-5 text-base font-bold text-red-950"
          onClick={onOpenRescue}
        >
          <ShieldAlert className="size-5" aria-hidden />
          Modalità soccorso
        </button>
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
          icon={<PlugZap className="size-7" aria-hidden />}
          title="Utenze e scadenze"
          body="Luce, Gas, Internet, Acqua, abbonamenti Famiglia e controllo caldaia."
          cta="Gestisci utenze"
          onClick={() => onGo('utenze')}
        />
        <DashCard
          icon={<Users className="size-7" aria-hidden />}
          title="Famiglia"
          body="Inviti, QR membri e anteprima «cosa vede ospite/sitter»."
          cta="Gestisci Famiglia"
          onClick={() => onGo('famiglia')}
        />
        <DashCard
          icon={<Printer className="size-7" aria-hidden />}
          title="Stampa e QR"
          body="A4 completo, A5 solo emergenza, QR break-glass."
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

function DashHeader({ familyName }: { familyName: string }) {
  return (
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
        Dashboard della casa: residenti, emergenze e scadenze — un passo alla
        volta.
      </p>
    </header>
  );
}

function DeadlineGroup({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: ReturnType<typeof listUpcomingDeadlines>;
  onOpen: (source: 'famiglia' | 'residente') => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
        {title}
      </p>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="w-full rounded-md border border-amber-800/40 bg-white px-3 py-2 text-left text-sm font-semibold hover:bg-amber-100"
              onClick={() => onOpen(item.source)}
            >
              {item.label}
              {item.residentName ? ` · ${item.residentName}` : ''} —{' '}
              {new Date(item.renewalDate + 'T12:00:00').toLocaleDateString(
                'it-IT'
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DashCard({
  icon,
  title,
  body,
  cta,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[7rem] flex-col items-start gap-2 rounded-lg border-2 border-zinc-900 bg-white p-4 text-left transition hover:brightness-95"
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
