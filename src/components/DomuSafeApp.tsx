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
  PlugZap,
  Printer,
  Receipt,
  Save,
  ShieldAlert,
  ShieldCheck,
  BadgeCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import type { DomusRunbookDocument } from '@/types/domus';
import type { SuccessionChecklist } from '@/types/checklists';
import type { FamilyBranding } from '@/types/premium';
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
import { TIER_LABELS } from '@/lib/licensing';
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
import { AuditLogPanel } from '@/components/AuditLogPanel';
import { SosAlertsPanel } from '@/components/SosAlertsPanel';
import { BrandingPanel } from '@/components/BrandingPanel';
import { InheritanceKitPanel } from '@/components/InheritanceKitPanel';
import { HomeDashboard } from '@/components/HomeDashboard';
import { QuickCompileWizard } from '@/components/QuickCompileWizard';
import { EmergencyPublishPanel } from '@/components/EmergencyPublishPanel';
import { EmergencyPrintSheet } from '@/components/EmergencyPrintSheet';
import { IceRescueMode } from '@/components/IceRescueMode';
import { JsonBackupPanel } from '@/components/JsonBackupPanel';
import { FamilyServicesPanel } from '@/components/FamilyServicesPanel';
import { ThemeSelector } from '@/components/ThemeSelector';

type Tab =
  | 'home'
  | 'casa'
  | 'utenze'
  | 'ice'
  | 'cassaforte'
  | 'sync'
  | 'stampa'
  | 'premium'
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
    familyKey,
    effectiveTier,
    logout,
    completeTutorial,
    startTrial,
    applySaasLicense,
    createInvite,
    refreshAccount,
  } = useSession();
  /** Workspace: family-key condivisa (fallback account data-key solo in migrazione). */
  const storageCtx: StorageContext | null = useMemo(() => {
    if (!family || !familyKey) return null;
    return {
      familyId: family.familyId,
      dataKey: familyKey,
      tier: effectiveTier,
    };
  }, [family, familyKey, effectiveTier]);

  const [collection, setCollection] = useState<DomusHouseCollection | null>(
    null
  );
  const [succession, setSuccession] = useState<SuccessionChecklist | null>(
    null
  );
  const [tab, setTab] = useState<Tab>('home');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showRescue, setShowRescue] = useState(false);
  const [qr118Svg, setQr118Svg] = useState<string | null>(null);
  /** Override locale dopo salvataggio branding; altrimenti da Famiglia. */
  const [brandingOverride, setBrandingOverride] = useState<
    FamilyBranding | null | undefined
  >(undefined);
  const branding =
    brandingOverride !== undefined
      ? brandingOverride
      : (family?.branding ?? null);
  const qrPayload = useClientUrl();

  useEffect(() => {
    if (!storageCtx || !dataKey) return;
    let active = true;

    const loadWithOptionalLegacyMigrate = async () => {
      try {
        return await Promise.all([
          loadHouseCollection(storageCtx),
          loadSuccessionChecklist(storageCtx.familyId, storageCtx.dataKey),
        ]);
      } catch {
        // Legacy pre-0.7: blob cifrati con account data-key → migra a family-key.
        const legacyCtx: StorageContext = {
          ...storageCtx,
          dataKey,
        };
        const [col, succ] = await Promise.all([
          loadHouseCollection(legacyCtx),
          loadSuccessionChecklist(legacyCtx.familyId, legacyCtx.dataKey),
        ]);
        await replaceHouseCollection(col, storageCtx);
        await saveSuccessionChecklist(succ, storageCtx.dataKey);
        return [col, succ] as const;
      }
    };

    loadWithOptionalLegacyMigrate()
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
  }, [storageCtx, account, dataKey]);

  const handleQrReady = useCallback((svg: string) => {
    setQrSvg(svg);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void import('@/lib/qr')
      .then(({ generateQrSvg }) => generateQrSvg('tel:118', 120))
      .then((svg) => {
        if (!cancelled) setQr118Svg(svg);
      })
      .catch(() => {
        if (!cancelled) setQr118Svg(null);
      });
    return () => {
      cancelled = true;
    };
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
      <h3 className="text-lg font-bold">Cassaforte (Livello 3)</h3>
      <p className="mt-2 text-zinc-700">
        Con <strong>Advanced</strong> proteggi i documenti di Famiglia dietro un
        PIN. Con <strong>Premium</strong> (o durante la prova) aggiungi anche
        patrimonio personale, successione e campi personalizzati. Piano attuale:{' '}
        <strong>{TIER_LABELS[effectiveTier]}</strong>.
      </p>
      <p className="mt-2 text-sm text-zinc-600">
        Apri <strong>Piano</strong> per confrontare i piani o avviare la prova
        Premium di 30 giorni.
      </p>
    </aside>
  );

  const syncFallback = (
    <aside className="rounded-lg border-2 border-zinc-900 bg-zinc-100 p-4">
      <h3 className="text-lg font-bold">Altri telefoni</h3>
      <p className="mt-2 text-zinc-700">
        Collegare un altro dispositivo in modo cifrato è incluso in{' '}
        <strong>Premium</strong> (o nella prova). Con Free, Basic e Advanced i
        dati restano salvati sull’account, senza questo passaggio tra
        dispositivi. Piano attuale: <strong>{TIER_LABELS[effectiveTier]}</strong>
        .
      </p>
    </aside>
  );

  const successionFallback = (
    <aside className="rounded-lg border-2 border-zinc-900 bg-zinc-100 p-4">
      <h3 className="text-lg font-bold">Checklist successione</h3>
      <p className="mt-2 text-zinc-700">
        Elenco attività per l’intera Famiglia (documenti, banche, polizze,
        eredità digitale). Inclusa in <strong>Premium</strong> o durante la
        prova. Piano attuale: <strong>{TIER_LABELS[effectiveTier]}</strong>.
      </p>
    </aside>
  );

  const premiumFallback = (
    <aside className="rounded-lg border-2 border-zinc-900 bg-zinc-100 p-4">
      <h3 className="text-lg font-bold">Funzioni Premium</h3>
      <p className="mt-2 text-zinc-700">
        Registro accessi (scan), avvisi di soccorso e marchio host
        personalizzato richiedono <strong>Premium</strong> (o la prova di 30
        giorni). Piano attuale: <strong>{TIER_LABELS[effectiveTier]}</strong>.
      </p>
      <p className="mt-2 text-sm text-zinc-600">
        Apri <strong>Piano</strong> per i dettagli o per avviare la prova.
      </p>
    </aside>
  );

  const printRunbook = () => {
    const body = window.document.body;
    body.classList.add('print-runbook-only');
    body.classList.remove('print-inheritance-only');
    body.classList.remove('print-emergency-only');
    window.print();
    window.setTimeout(() => {
      body.classList.remove('print-runbook-only');
    }, 500);
  };

  const printEmergencyOnly = () => {
    const body = window.document.body;
    body.classList.add('print-emergency-only');
    body.classList.remove('print-runbook-only');
    body.classList.remove('print-inheritance-only');
    window.print();
    window.setTimeout(() => {
      body.classList.remove('print-emergency-only');
    }, 500);
  };

  return (
    <div className="min-h-screen bg-[var(--shell-gradient)] text-[var(--md-on-surface)]">
      {showTutorial ? (
        <OnboardingTutorial
          onComplete={() => {
            setShowTutorial(false);
            void completeTutorial();
          }}
        />
      ) : null}

      {showWizard ? (
        <QuickCompileWizard
          document={liveDoc}
          tier={effectiveTier}
          onChange={(next) => {
            setDocument(next);
            void persist(next);
          }}
          onClose={() => {
            setShowWizard(false);
            setTab('home');
          }}
        />
      ) : null}

      {showRescue ? (
        <IceRescueMode
          document={liveDoc}
          familyName={family.name}
          onClose={() => setShowRescue(false)}
        />
      ) : null}

      <header className="no-print border-b-4 border-[var(--md-outline)] bg-[var(--header-bg)] text-[var(--header-fg)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <DomuSafeLogo size={44} className="shrink-0 sm:hidden" />
            <DomuSafeLogo size={48} className="hidden shrink-0 sm:block" />
            <div className="min-w-0">
              <p className="font-display text-xl font-black tracking-tight sm:text-3xl">
                DomuSafe
              </p>
              <p className="truncate text-xs opacity-90 sm:text-sm">
                Dashboard Famiglia · {family.name} · {account.displayName}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeSelector compact />
            <button
              type="button"
              className="inline-flex min-h-12 min-w-12 items-center gap-2 rounded-[var(--md-radius-sm)] border-2 border-white bg-[var(--brand-forest)] px-3 font-bold text-white hover:brightness-110 sm:px-4"
              disabled={saving}
              onClick={() => persist(liveDoc)}
            >
              {saving ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <Save className="size-5" aria-hidden />
              )}
              <span className="hidden xs:inline sm:inline">Salva</span>
            </button>
            <button
              type="button"
              className="inline-flex min-h-12 min-w-12 items-center gap-2 rounded-[var(--md-radius-sm)] border-2 border-white/70 bg-transparent px-3 font-bold text-white hover:bg-white/10 sm:px-4"
              onClick={() => void logout()}
              aria-label="Esci"
            >
              <LogOut className="size-5" aria-hidden />
              <span className="hidden sm:inline">Esci</span>
            </button>
          </div>
        </div>
      </header>

      {/* Desktop/tablet: barra superiore. Telefono: barra fissa in basso. */}
      <nav
        className="no-print sticky top-0 z-10 hidden border-b-2 border-[var(--md-outline)] bg-[var(--md-surface-container)]/95 backdrop-blur md:block"
        aria-label="Sezioni DomuSafe"
      >
        <div className="device-nav-scroll mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-3">
          <AppTabs tab={tab} setTab={setTab} layout="row" />
        </div>
      </nav>

      <main className="app-shell-main mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-4 sm:py-6">
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

        {tab === 'home' ? (
          <HomeDashboard
            familyId={family.familyId}
            familyName={family.name}
            document={liveDoc}
            tier={effectiveTier}
            onGo={(target) => setTab(target)}
            onStartWizard={() => setShowWizard(true)}
            onOpenRescue={() => setShowRescue(true)}
            onStatus={setStatus}
          />
        ) : null}

        {tab === 'casa' ? (
          <Level1PublicPanel
            tier={effectiveTier}
            data={liveDoc.level1_public}
            onChange={(level1_public) =>
              setDocument({ ...liveDoc, level1_public })
            }
            onStartWizard={() => setShowWizard(true)}
            onOpenUtenze={() => setTab('utenze')}
          />
        ) : null}

        {tab === 'utenze' ? (
          <div className="space-y-4">
            <header>
              <p className="text-sm font-bold uppercase tracking-widest text-[var(--brand-forest)]">
                Famiglia · Contratti
              </p>
              <h2 className="mt-1 font-display text-2xl font-black text-[var(--brand-ink)]">
                Utenze, abbonamenti e scadenze
              </h2>
              <p className="mt-2 max-w-2xl text-base text-zinc-700">
                Luce, Gas, Internet, Acqua, tassa sui rifiuti, abbonamenti
                condivisi e scadenze (es. controllo caldaia). Restano protetti
                con i dati della casa. I conti bancari Famiglia stanno in{' '}
                <button
                  type="button"
                  className="font-bold text-[var(--brand-forest)] underline"
                  onClick={() => setTab('cassaforte')}
                >
                  Cassaforte
                </button>{' '}
                (PIN, da Advanced).
              </p>
            </header>
            <FamilyServicesPanel
              tier={effectiveTier}
              value={liveDoc.level1_public.familyServices}
              onChange={(familyServices) =>
                setDocument({
                  ...liveDoc,
                  level1_public: {
                    ...liveDoc.level1_public,
                    familyServices,
                  },
                })
              }
            />
          </div>
        ) : null}

        {tab === 'ice' ? (
          <div className="space-y-4">
            {effectiveTier !== 'PREMIUM' ? (
              <p className="no-print flex flex-wrap items-center gap-2 text-sm font-semibold text-amber-950">
                <Receipt className="size-4" aria-hidden />
                Checklist tasse italiane e conti personali: su ogni scheda
                residente con Premium (o prova).
                <button
                  type="button"
                  className="underline"
                  onClick={() => setTab('licenze')}
                >
                  Apri Piano
                </button>
              </p>
            ) : (
              <p className="no-print text-sm font-semibold text-emerald-950">
                Su ogni scheda residente: mobile, abbonamenti (bollo/auto),
                conti personali e checklist tasse IT.
              </p>
            )}
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
              onOpenRescue={() => setShowRescue(true)}
              onStartWizard={() => setShowWizard(true)}
            />
          </div>
        ) : null}

        {tab === 'cassaforte' ? (
          <div className="space-y-6">
            <FeatureGate
              tier={effectiveTier}
              feature="allowLevel3Vault"
              fallback={vaultFallback}
            >
              <Level3VaultPanel
                key={`${liveDoc.documentId}:${liveDoc.level3_vault?.ciphertextBase64 ?? 'empty'}`}
                tier={effectiveTier}
                vault={liveDoc.level3_vault}
                onVaultChange={(level3_vault) => {
                  const next = { ...liveDoc, level3_vault };
                  setDocument(next);
                  void persist(next);
                }}
              />
            </FeatureGate>
            <FeatureGate
              tier={effectiveTier}
              feature="allowSuccessionChecklist"
              fallback={successionFallback}
            >
              {succession ? (
                <>
                  <SuccessionChecklistPanel
                    tier={effectiveTier}
                    checklist={succession}
                    familyName={family.name}
                    onChange={(next) => void persistSuccession(next)}
                  />
                  <InheritanceKitPanel
                    checklist={succession}
                    familyName={family.name}
                    branding={branding}
                  />
                </>
              ) : null}
            </FeatureGate>
          </div>
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
            <EmergencyPublishPanel
              familyId={family.familyId}
              familyName={family.name}
              document={liveDoc}
              onStatus={setStatus}
            />
            <QrPanel payload={qrPayload} onSvgReady={handleQrReady} />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-zinc-950 px-5 font-bold text-white hover:bg-zinc-800"
                onClick={printRunbook}
              >
                <Printer className="size-5" aria-hidden />
                Stampa scheda A4
              </button>
              <button
                type="button"
                className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-red-900 bg-red-50 px-5 font-bold text-red-950 hover:bg-red-100"
                onClick={printEmergencyOnly}
              >
                <ShieldAlert className="size-5" aria-hidden />
                Stampa solo emergenza (A5)
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
              A4: manuale completo. A5: solo chiusure + schede di emergenza + QR
              118 (linguetta tasca). I dati sanitari restano sotto la linguetta
              da piegare.
              {effectiveTier === 'FREE' || effectiveTier === 'BASIC'
                ? ' Piano Free/Basic: watermark DomuSafe.'
                : ' Piano Advanced/Premium: senza watermark.'}
              {branding?.hostDisplayName
                ? ` Marchio host: ${branding.hostDisplayName}.`
                : ''}
            </p>
            <JsonBackupPanel
              collection={collection}
              onImport={async (imported) => {
                const saved = await replaceHouseCollection(
                  imported,
                  storageCtx
                );
                setCollection(saved);
              }}
              onStatus={setStatus}
            />
          </div>
        ) : null}

        {tab === 'premium' ? (
          <div className="no-print space-y-6">
            <FeatureGate
              tier={effectiveTier}
              feature="auditLog"
              fallback={premiumFallback}
            >
              <AuditLogPanel
                familyId={family.familyId}
                houseName={liveDoc.level1_public.houseName}
                onStatus={setStatus}
              />
            </FeatureGate>
            <FeatureGate tier={effectiveTier} feature="allowSmsAlerts">
              <SosAlertsPanel
                familyId={family.familyId}
                houseName={liveDoc.level1_public.houseName}
                residents={liveDoc.level2_ice.residents}
                onStatus={setStatus}
              />
            </FeatureGate>
            <FeatureGate tier={effectiveTier} feature="customBranding">
              <BrandingPanel
                familyId={family.familyId}
                initial={branding}
                onSaved={(next) => {
                  setBrandingOverride(next);
                  void refreshAccount();
                }}
                onStatus={setStatus}
              />
            </FeatureGate>
          </div>
        ) : null}

        {tab === 'famiglia' ? (
          <div className="space-y-4">
            <FamilyInvitePanel
              family={family}
              house={liveDoc.level1_public}
              onCreateInvite={createInvite}
            />
            <aside className="rounded-lg border-2 border-zinc-900 bg-white p-4">
              <h3 className="text-lg font-black text-zinc-950">
                Conti e documenti Famiglia
              </h3>
              <p className="mt-1 text-sm text-zinc-700">
                I conti bancari Famiglia e i documenti riservati stanno nella{' '}
                <strong>Cassaforte</strong> (PIN, da Advanced). Utenze e
                scadenze quotidiane sono nella sezione <strong>Utenze</strong>.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex min-h-12 items-center rounded-md border-2 border-zinc-900 bg-zinc-950 px-4 font-bold text-white"
                  onClick={() => setTab('cassaforte')}
                >
                  Apri Cassaforte
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-12 items-center rounded-md border-2 border-[var(--brand-forest)] bg-white px-4 font-bold text-[var(--brand-ink)]"
                  onClick={() => setTab('utenze')}
                >
                  Apri Utenze
                </button>
              </div>
            </aside>
          </div>
        ) : null}
        {tab === 'licenze' ? (
          <LicensePanel
            account={account}
            effectiveTier={effectiveTier}
            familyName={family.name}
            onStartTrial={startTrial}
            onApplySaasLicense={applySaasLicense}
          />
        ) : null}

        {tab === 'manuale' ? <ManualeUtente /> : null}

        <PrintSheet
          document={liveDoc}
          qrSvg={qrSvg}
          qr118Svg={qr118Svg}
          branding={branding}
        />
        <EmergencyPrintSheet
          document={liveDoc}
          qr118Svg={qr118Svg}
          branding={branding}
        />
      </main>

      <footer className="no-print mb-[calc(4.75rem+var(--safe-bottom))] border-t-2 border-zinc-900 bg-white px-4 py-6 text-center text-sm text-zinc-600 md:mb-0">
        DomuSafe · I tuoi dati restano cifrati · Uso familiare
      </footer>

      <nav
        className="no-print fixed inset-x-0 bottom-0 z-20 border-t-2 border-zinc-900 bg-white/95 pb-[var(--safe-bottom)] backdrop-blur md:hidden"
        aria-label="Sezioni DomuSafe (telefono)"
      >
        <div className="device-nav-scroll flex gap-1 overflow-x-auto px-2 py-2">
          <AppTabs tab={tab} setTab={setTab} layout="phone" />
        </div>
      </nav>
    </div>
  );
}

const TAB_ITEMS: Array<{
  id: Tab;
  label: string;
  short: string;
  icon: ReactNode;
}> = [
  {
    id: 'home',
    label: 'Panoramica',
    short: 'Home',
    icon: <Sparkles className="size-5" aria-hidden />,
  },
  { id: 'casa', label: 'Casa', short: 'Casa', icon: <Home className="size-5" aria-hidden /> },
  {
    id: 'utenze',
    label: 'Utenze',
    short: 'Utenze',
    icon: <PlugZap className="size-5" aria-hidden />,
  },
  {
    id: 'ice',
    label: 'Emergenza',
    short: 'Soccorso',
    icon: <ShieldAlert className="size-5" aria-hidden />,
  },
  {
    id: 'famiglia',
    label: 'Famiglia',
    short: 'Famiglia',
    icon: <Users className="size-5" aria-hidden />,
  },
  {
    id: 'stampa',
    label: 'Stampa / QR',
    short: 'Stampa',
    icon: <Printer className="size-5" aria-hidden />,
  },
  {
    id: 'cassaforte',
    label: 'Cassaforte',
    short: 'Cassa',
    icon: <ShieldCheck className="size-5" aria-hidden />,
  },
  {
    id: 'sync',
    label: 'Altri telefoni',
    short: 'Sync',
    icon: <Cloud className="size-5" aria-hidden />,
  },
  {
    id: 'premium',
    label: 'Extra',
    short: 'Extra',
    icon: <Receipt className="size-5" aria-hidden />,
  },
  {
    id: 'licenze',
    label: 'Piano',
    short: 'Piano',
    icon: <BadgeCheck className="size-5" aria-hidden />,
  },
  {
    id: 'manuale',
    label: 'Guida',
    short: 'Guida',
    icon: <BookOpen className="size-5" aria-hidden />,
  },
];

function AppTabs({
  tab,
  setTab,
  layout,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  layout: 'row' | 'phone';
}) {
  return (
    <>
      {TAB_ITEMS.map((item) => (
        <TabButton
          key={item.id}
          active={tab === item.id}
          onClick={() => setTab(item.id)}
          icon={item.icon}
          label={layout === 'phone' ? item.short : item.label}
          layout={layout}
        />
      ))}
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  layout,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  layout: 'row' | 'phone';
}) {
  if (layout === 'phone') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`inline-flex min-h-14 min-w-[4.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border-2 px-2 text-[11px] font-bold leading-tight ${
          active
            ? 'border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white'
            : 'border-zinc-300 bg-white text-zinc-950'
        }`}
      >
        {icon}
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex min-h-12 min-w-12 shrink-0 items-center gap-2 rounded-md border-2 px-4 font-bold ${
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
