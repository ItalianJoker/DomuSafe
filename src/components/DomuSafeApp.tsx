'use client';

/**
 * Shell principale DomuSafe — MVP offline BASIC.
 * Persiste su IndexedDB; Livello 3 (cassaforte) resta gated dal Feature Gate.
 */

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  Home,
  Loader2,
  Printer,
  Save,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { DomusRunbookDocument } from '@/types/domus';
import { canAccessFeature } from '@/lib/licensing';
import { loadRunbook, saveRunbook } from '@/lib/storage';
import { Level1PublicPanel } from '@/components/Level1PublicPanel';
import { Level2IcePanel } from '@/components/Level2IcePanel';
import { PrintSheet } from '@/components/PrintSheet';
import { QrPanel } from '@/components/QrPanel';

type Tab = 'casa' | 'ice' | 'stampa';

/** URL client-only senza hydration mismatch (snapshot server stabile). */
function useClientUrl(): string {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.href,
    () => 'http://localhost:3000'
  );
}

export function DomuSafeApp() {
  const [document, setDocument] = useState<DomusRunbookDocument | null>(null);
  const [tab, setTab] = useState<Tab>('casa');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const qrPayload = useClientUrl();

  useEffect(() => {
    let active = true;
    loadRunbook()
      .then((doc) => {
        if (active) setDocument(doc);
      })
      .catch(() => {
        if (active) {
          setStatus('Errore nel caricamento dei dati locali.');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleQrReady = useCallback((svg: string) => {
    setQrSvg(svg);
  }, []);

  const persist = async (next: DomusRunbookDocument) => {
    setSaving(true);
    setStatus(null);
    try {
      const saved = await saveRunbook(next);
      setDocument(saved);
      setStatus('Salvato sul dispositivo.');
    } catch {
      setStatus('Salvataggio non riuscito. Riprova.');
    } finally {
      setSaving(false);
    }
  };

  if (!document) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-950">
        <p className="inline-flex items-center gap-2 text-lg font-semibold">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          Caricamento DomuSafe…
        </p>
      </div>
    );
  }

  const vaultAllowed = canAccessFeature(document.tier, 'allowLevel3Vault');

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f7f2_0%,#e8eef5_45%,#f7f3ea_100%)] text-zinc-950">
      <header className="no-print border-b-4 border-zinc-950 bg-[#0f1a14] text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-9 shrink-0 text-emerald-300" aria-hidden />
            <div>
              <p className="text-2xl font-black tracking-tight sm:text-3xl">
                DomuSafe
              </p>
              <p className="text-sm text-emerald-100">
                Manuale casa & hub emergenza · Piano {document.tier}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex min-h-12 min-w-12 items-center gap-2 rounded-md border-2 border-white bg-emerald-600 px-4 font-bold text-white hover:bg-emerald-500"
            disabled={saving}
            onClick={() => persist(document)}
          >
            {saving ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Save className="size-5" aria-hidden />
            )}
            Salva
          </button>
        </div>
      </header>

      <nav
        className="no-print sticky top-0 z-10 border-b-2 border-zinc-900 bg-white/95 backdrop-blur"
        aria-label="Sezioni DomuSafe"
      >
        <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-3">
          <TabButton
            active={tab === 'casa'}
            onClick={() => setTab('casa')}
            icon={<Home className="size-5" aria-hidden />}
            label="Casa"
          />
          <TabButton
            active={tab === 'ice'}
            onClick={() => setTab('ice')}
            icon={<ShieldAlert className="size-5" aria-hidden />}
            label="ICE"
          />
          <TabButton
            active={tab === 'stampa'}
            onClick={() => setTab('stampa')}
            icon={<Printer className="size-5" aria-hidden />}
            label="Stampa / QR"
          />
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {status ? (
          <p
            className="no-print mb-4 rounded-md border-2 border-emerald-800 bg-emerald-50 px-4 py-3 font-semibold text-emerald-950"
            role="status"
          >
            {status}
          </p>
        ) : null}

        {tab === 'casa' ? (
          <Level1PublicPanel
            data={document.level1_public}
            onChange={(level1_public) =>
              setDocument({ ...document, level1_public })
            }
          />
        ) : null}

        {tab === 'ice' ? (
          <div className="space-y-8">
            <Level2IcePanel
              tier={document.tier}
              residents={document.level2_ice.residents}
              pets={document.level2_ice.pets}
              onResidentsChange={(residents) =>
                setDocument({
                  ...document,
                  level2_ice: { ...document.level2_ice, residents },
                })
              }
              onPetsChange={(pets) =>
                setDocument({
                  ...document,
                  level2_ice: { ...document.level2_ice, pets },
                })
              }
            />
            {!vaultAllowed ? (
              <aside className="rounded-lg border-2 border-zinc-900 bg-zinc-100 p-4">
                <h3 className="text-lg font-bold">Livello 3 — Cassaforte</h3>
                <p className="mt-2 text-zinc-700">
                  La cassaforte patrimoniale cifrata (AES-256-GCM) è disponibile
                  dai piani ADVANCED e PREMIUM. Il motore crittografico è già
                  incluso nell&apos;app per aggiornamenti futuri.
                </p>
              </aside>
            ) : null}
          </div>
        ) : null}

        {tab === 'stampa' ? (
          <div className="no-print space-y-6">
            <QrPanel payload={qrPayload} onSvgReady={handleQrReady} />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-zinc-950 px-5 font-bold text-white hover:bg-zinc-800"
                onClick={() => window.print()}
              >
                <Printer className="size-5" aria-hidden />
                Stampa scheda A4
              </button>
              <button
                type="button"
                className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-5 font-bold hover:bg-zinc-100"
                onClick={() => persist(document)}
              >
                <Save className="size-5" aria-hidden />
                Salva prima di stampare
              </button>
            </div>
            <p className="text-sm text-zinc-700">
              In stampa, i dati ICE restano sotto la linguetta da piegare o
              sigillare. Aprire solo per soccorso sanitario 118 / 112.
            </p>
          </div>
        ) : null}

        <PrintSheet document={document} qrSvg={qrSvg} />
      </main>

      <footer className="no-print border-t-2 border-zinc-900 bg-white px-4 py-6 text-center text-sm text-zinc-600">
        DomuSafe · dati solo su questo dispositivo · BSL 1.1
      </footer>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex min-h-12 min-w-12 items-center gap-2 rounded-md border-2 px-4 font-bold ${
        active
          ? 'border-zinc-950 bg-zinc-950 text-white'
          : 'border-zinc-900 bg-white text-zinc-950 hover:bg-zinc-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
