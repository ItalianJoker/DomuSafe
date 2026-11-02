'use client';

/**
 * Shell DomuSafe — registration-first, Famiglia, cifratura a riposo, Feature Gate.
 * Gate: sessione → Famiglia → data-key → runbook L1–L3 / checklist.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  BookOpen,
  Cloud,
  Home,
  Loader2,
  LogOut,
  Printer,
  Receipt,
  Save,
  ShieldAlert,
  ShieldCheck,
  BadgeCheck,
  Users,
} from 'lucide-react';
import type { DomusRunbookDocument } from '@/types/domus';
import type { SuccessionChecklist } from '@/types/checklists';
import {
  addHouse,
  getActiveHouse,
  loadHouseCollection,
  removeHouse,
  replaceHouseCollection,
  saveRunbook,
  switchActiveHouse,
  type DomusHouseCollection,
  type StorageContext,
} from '@/lib/storage';
import {
  loadSuccessionChecklist,
  saveSuccessionChecklist,
} from '@/lib/succession-storage';
import { SessionProvider, useSession } from '@/lib/session-context';
import { AuthScreen } from '@/components/AuthScreen';
import { FamilySetup } from '@/components/FamilySetup';
import { FeatureGate } from '@/components/FeatureGate';
import { CloudSyncPanel } from '@/components/CloudSyncPanel';
import { HouseSwitcher } from '@/components/HouseSwitcher';
import { Level1PublicPanel } from '@/components/Level1PublicPanel';
import { Level2IcePanel } from '@/components/Level2IcePanel';
import { Level3VaultPanel } from '@/components/Level3VaultPanel';
import { SuccessionChecklistPanel } from '@/components/SuccessionChecklistPanel';
import { PrintSheet } from '@/components/PrintSheet';
import { QrPanel } from '@/components/QrPanel';
import { DomuSafeLogo } from '@/components/DomuSafeLogo';
import { OnboardingTutorial } from '@/components/OnboardingTutorial';
import { ManualeUtente } from '@/components/ManualeUtente';
import { LicensePanel } from '@/components/LicensePanel';
import { FamilyInvitePanel } from '@/components/FamilyInvitePanel';

type Tab =
  | 'casa'
  | 'ice'
  | 'cassaforte'
  | 'sync'
  | 'stampa'
  | 'famiglia'
  | 'licenze'
  | 'manuale';

function useClientUrl(): string {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.href,
    () => 'http://localhost:3000'
  );
}

export function DomuSafeApp() {
  return (
    <SessionProvider>
      <DomuSafeShell />
    </SessionProvider>
  );
}

function DomuSafeShell() {
  const session = useSession();

  if (session.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--brand-ink)] text-[var(--brand-cream)]">
        <p className="inline-flex items-center gap-2 text-lg font-semibold">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          Caricamento DomuSafe…
        </p>
      </div>
    );
  }

  if (
    session.status === 'unauthenticated' ||
    session.status === 'needs_unlock'
  ) {
    return <AuthScreen />;
  }

  if (session.status === 'needs_family') {
    return <FamilySetup />;
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const {
    account,
    family,
    dataKey,
    effectiveTier,
    logout,
    completeTutorial,
    startTrial,
    createInvite,
  } = useSession();

  const storageCtx: StorageContext | null = useMemo(() => {
    if (!family || !dataKey) return null;
    return {
      familyId: family.familyId,
      dataKey,
      tier: effectiveTier,
    };
  }, [family, dataKey, effectiveTier]);

  const [collection, setCollection] = useState<DomusHouseCollection | null>(
    null
  );
  const [succession, setSuccession] = useState<SuccessionChecklist | null>(
    null
  );
  const [tab, setTab] = useState<Tab>('casa');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const qrPayload = useClientUrl();

  useEffect(() => {
    if (!storageCtx) return;
    let active = true;
    Promise.all([
      loadHouseCollection(storageCtx),
      loadSuccessionChecklist(storageCtx.familyId, storageCtx.dataKey),
    ])
      .then(([col, succ]) => {
        if (!active) return;
        setCollection(col);
        setSuccession(succ);
        if (account && !account.tutorialCompleted) {
          setShowTutorial(true);
        }
      })
      .catch(() => {
        if (active) setStatus('Errore nel caricamento dei dati cifrati.');
      });
    return () => {
      active = false;
    };
  }, [storageCtx, account]);

  const handleQrReady = useCallback((svg: string) => {
    setQrSvg(svg);
  }, []);

  const setDocument = (next: DomusRunbookDocument) => {
    setCollection((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        activeDocumentId: next.documentId,
        houses: prev.houses.map((h) =>
          h.documentId === next.documentId ? next : h
        ),
      };
    });
  };

  const persist = async (next: DomusRunbookDocument) => {
    if (!storageCtx) return;
    setSaving(true);
    setStatus(null);
    try {
      const saved = await saveRunbook(next, storageCtx);
      setCollection((prev) => {
        if (!prev) return prev;
        const houses = prev.houses.map((h) =>
          h.documentId === saved.documentId ? saved : h
        );
        const has = houses.some((h) => h.documentId === saved.documentId);
        return {
          version: '1.0.0',
          familyId: storageCtx.familyId,
          activeDocumentId: saved.documentId,
          houses: has ? houses : [...houses, saved],
        };
      });
      setStatus('Salvato e cifrato sul dispositivo.');
    } catch {
      setStatus('Salvataggio non riuscito. Riprova.');
    } finally {
      setSaving(false);
    }
  };

  const persistSuccession = async (next: SuccessionChecklist) => {
    if (!storageCtx) return;
    setSuccession(next);
    try {
      const saved = await saveSuccessionChecklist(next, storageCtx.dataKey);
      setSuccession(saved);
      setStatus('Checklist successione salvata.');
    } catch {
      setStatus('Salvataggio successione non riuscito.');
    }
  };

  if (!collection || !storageCtx || !account || !family) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
        <p className="inline-flex items-center gap-2 text-lg font-semibold">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          Sblocco runbook…
        </p>
      </div>
    );
  }

  const document = getActiveHouse(collection);
  // Tier effettivo (trial) sovrascrive il campo documento in UI/gate
  const liveDoc: DomusRunbookDocument = {
    ...document,
    tier: effectiveTier,
  };

  const vaultFallback = (
    <aside className="rounded-lg border-2 border-zinc-900 bg-zinc-100 p-4">
      <h3 className="text-lg font-bold">Livello 3 — Cassaforte</h3>
      <p className="mt-2 text-zinc-700">
        La cassaforte e la checklist successione Famiglia sono nei piani{' '}
        <strong>ADVANCED</strong> / <strong>PREMIUM</strong> (o prova Premium).
        Piano attuale: <strong>{effectiveTier}</strong>.
      </p>
      <p className="mt-2 text-sm text-zinc-600">
        Apri <strong>Licenze</strong> per avviare la prova Premium di 30 giorni.
      </p>
    </aside>
  );

  const syncFallback = (
    <aside className="rounded-lg border-2 border-zinc-900 bg-zinc-100 p-4">
      <h3 className="text-lg font-bold">Sync cloud</h3>
      <p className="mt-2 text-zinc-700">
        Sync E2EE family-scoped nei piani ADVANCED/PREMIUM. Piano attuale:{' '}
        <strong>{effectiveTier}</strong>.
      </p>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#e8f2ec_0%,#eef3f0_40%,#f7f3ea_100%)] text-zinc-950">
      {showTutorial ? (
        <OnboardingTutorial
          onComplete={() => {
            setShowTutorial(false);
            void completeTutorial();
          }}
        />
      ) : null}

      <header className="no-print border-b-4 border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <DomuSafeLogo size={48} />
            <div>
              <p className="font-display text-2xl font-black tracking-tight sm:text-3xl">
                DomuSafe
              </p>
              <p className="text-sm text-emerald-100">
                {family.name} · {account.displayName} · Piano {effectiveTier}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-12 min-w-12 items-center gap-2 rounded-md border-2 border-white bg-[var(--brand-forest)] px-4 font-bold text-white hover:brightness-110"
              disabled={saving}
              onClick={() => persist(liveDoc)}
            >
              {saving ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <Save className="size-5" aria-hidden />
              )}
              Salva
            </button>
            <button
              type="button"
              className="inline-flex min-h-12 min-w-12 items-center gap-2 rounded-md border-2 border-white/70 bg-transparent px-4 font-bold text-white hover:bg-white/10"
              onClick={() => void logout()}
            >
              <LogOut className="size-5" aria-hidden />
              Esci
            </button>
          </div>
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
            active={tab === 'cassaforte'}
            onClick={() => setTab('cassaforte')}
            icon={<ShieldCheck className="size-5" aria-hidden />}
            label="Cassaforte"
          />
          <TabButton
            active={tab === 'sync'}
            onClick={() => setTab('sync')}
            icon={<Cloud className="size-5" aria-hidden />}
            label="Sync"
          />
          <TabButton
            active={tab === 'stampa'}
            onClick={() => setTab('stampa')}
            icon={<Printer className="size-5" aria-hidden />}
            label="Stampa / QR"
          />
          <TabButton
            active={tab === 'famiglia'}
            onClick={() => setTab('famiglia')}
            icon={<Users className="size-5" aria-hidden />}
            label="Famiglia"
          />
          <TabButton
            active={tab === 'licenze'}
            onClick={() => setTab('licenze')}
            icon={<BadgeCheck className="size-5" aria-hidden />}
            label="Licenze"
          />
          <TabButton
            active={tab === 'manuale'}
            onClick={() => setTab('manuale')}
            icon={<BookOpen className="size-5" aria-hidden />}
            label="Manuale"
          />
        </div>
      </nav>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {status ? (
          <p
            className="no-print rounded-md border-2 border-emerald-800 bg-emerald-50 px-4 py-3 font-semibold text-emerald-950"
            role="status"
          >
            {status}
          </p>
        ) : null}

        <HouseSwitcher
          tier={effectiveTier}
          houses={collection.houses}
          activeDocumentId={collection.activeDocumentId}
          onSwitch={async (id) => {
            const next = await switchActiveHouse(id, storageCtx);
            if (next) {
              setCollection(next);
              setStatus(null);
            }
          }}
          onAdd={async () => {
            const next = await addHouse(storageCtx);
            if (next) {
              setCollection(next);
              setStatus('Nuova abitazione creata.');
              setTab('casa');
            } else {
              setStatus(
                `Limite abitazioni raggiunto per il piano ${effectiveTier}.`
              );
            }
          }}
          onRemove={async (id) => {
            const next = await removeHouse(id, storageCtx);
            if (next) {
              setCollection(next);
              setStatus('Abitazione rimossa.');
            } else {
              setStatus('Impossibile rimuovere: serve almeno una casa.');
            }
          }}
        />

        {tab === 'casa' ? (
          <Level1PublicPanel
            data={liveDoc.level1_public}
            onChange={(level1_public) =>
              setDocument({ ...liveDoc, level1_public })
            }
          />
        ) : null}

        {tab === 'ice' ? (
          <div className="space-y-4">
            <p className="no-print inline-flex items-center gap-2 text-sm font-semibold text-amber-950">
              <Receipt className="size-4" aria-hidden />
              Le checklist tasse IT sono su ogni scheda residente.
            </p>
            <Level2IcePanel
              tier={effectiveTier}
              residents={liveDoc.level2_ice.residents}
              pets={liveDoc.level2_ice.pets}
              onResidentsChange={(residents) =>
                setDocument({
                  ...liveDoc,
                  level2_ice: { ...liveDoc.level2_ice, residents },
                })
              }
              onPetsChange={(pets) =>
                setDocument({
                  ...liveDoc,
                  level2_ice: { ...liveDoc.level2_ice, pets },
                })
              }
            />
          </div>
        ) : null}

        {tab === 'cassaforte' ? (
          <FeatureGate
            tier={effectiveTier}
            feature="allowLevel3Vault"
            fallback={vaultFallback}
          >
            <div className="space-y-6">
              <Level3VaultPanel
                key={`${liveDoc.documentId}:${liveDoc.level3_vault?.ciphertextBase64 ?? 'empty'}`}
                vault={liveDoc.level3_vault}
                onVaultChange={(level3_vault) => {
                  const next = { ...liveDoc, level3_vault };
                  setDocument(next);
                  void persist(next);
                }}
              />
              {succession ? (
                <SuccessionChecklistPanel
                  checklist={succession}
                  familyName={family.name}
                  onChange={(next) => void persistSuccession(next)}
                />
              ) : null}
            </div>
          </FeatureGate>
        ) : null}

        {tab === 'sync' ? (
          <FeatureGate
            tier={effectiveTier}
            feature="allowCloudSync"
            fallback={syncFallback}
          >
            <CloudSyncPanel
              collection={collection}
              familyId={storageCtx.familyId}
              dataKey={storageCtx.dataKey}
              onStatus={setStatus}
              onCollectionImported={async (imported) => {
                const saved = await replaceHouseCollection(
                  imported,
                  storageCtx
                );
                setCollection(saved);
              }}
            />
          </FeatureGate>
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
                onClick={() => persist(liveDoc)}
              >
                <Save className="size-5" aria-hidden />
                Salva prima di stampare
              </button>
            </div>
            <p className="text-sm text-zinc-700">
              In stampa, i dati ICE restano sotto la linguetta da piegare.
              {effectiveTier === 'BASIC'
                ? ' Piano BASIC: watermark DomuSafe.'
                : ' Piano ADVANCED/PREMIUM: senza watermark.'}
            </p>
          </div>
        ) : null}

        {tab === 'famiglia' ? (
          <FamilyInvitePanel family={family} onCreateInvite={createInvite} />
        ) : null}

        {tab === 'licenze' ? (
          <LicensePanel
            account={account}
            effectiveTier={effectiveTier}
            familyName={family.name}
            onStartTrial={startTrial}
          />
        ) : null}

        {tab === 'manuale' ? <ManualeUtente /> : null}

        <PrintSheet document={liveDoc} qrSvg={qrSvg} />
      </main>

      <footer className="no-print border-t-2 border-zinc-900 bg-white px-4 py-6 text-center text-sm text-zinc-600">
        DomuSafe · Famiglia cifrata · BSL 1.1
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
          ? 'border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white'
          : 'border-zinc-900 bg-white text-zinc-950 hover:bg-zinc-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
