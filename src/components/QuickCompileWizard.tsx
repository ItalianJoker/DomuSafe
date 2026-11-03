'use client';

/**
 * Wizard compilazione rapida guidata — Casa, utenze/scadenze Famiglia,
 * residenti ICE + servizi personali/tasse, cenni Cassaforte L3.
 * Tutto resta anche compilabile manualmente dalle sezioni dedicate.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  KeyRound,
  Sparkles,
  Timer,
  X,
} from 'lucide-react';
import type {
  DomusRunbookDocument,
  LicenseTier,
  PublicHouseData,
  ResidentHealthRecord,
} from '@/types/domus';
import { createEmptyResident, createEmptyVaultPayload } from '@/lib/defaults';
import { canAccessFeature } from '@/lib/licensing';
import {
  ensureFamilyServices,
  ensurePersonalSubscriptions,
  emptyMobilePlan,
} from '@/lib/service-catalog';
import { ensureResidentTaxYear } from '@/lib/checklist-defaults';
import { encryptVault } from '@/lib/crypto-vault';
import { FieldLabel, TouchInput, TouchTextarea } from '@/components/TouchField';

interface QuickCompileWizardProps {
  document: DomusRunbookDocument;
  tier: LicenseTier;
  onChange: (next: DomusRunbookDocument) => void;
  onClose: () => void;
}

type StepId =
  | 'casa-base'
  | 'casa-chiusure'
  | 'casa-wifi'
  | 'family-utenze'
  | 'medico'
  | 'personale'
  | 'cassaforte'
  | 'fine';

const STEPS: Array<{ id: StepId; title: string; hint: string }> = [
  {
    id: 'casa-base',
    title: 'Nome casa',
    hint: 'Passo casa · poi chiusure, Wi‑Fi e contratti',
  },
  {
    id: 'casa-chiusure',
    title: 'Chiusure di emergenza',
    hint: 'Dove chiudere acqua, gas e luce',
  },
  {
    id: 'casa-wifi',
    title: 'Wi‑Fi e accessi',
    hint: 'Utili a ospiti e sitter',
  },
  {
    id: 'family-utenze',
    title: 'Utenze e scadenze Famiglia',
    hint: 'Luce, Gas, Internet e controllo caldaia',
  },
  {
    id: 'medico',
    title: 'Scheda medica rapida',
    hint: 'Obiettivo ≤ 90 secondi a persona (barra soft)',
  },
  {
    id: 'personale',
    title: 'Servizi personali e tasse',
    hint: 'Mobile, bollo/auto e checklist tasse sul residente',
  },
  {
    id: 'cassaforte',
    title: 'Cassaforte Famiglia',
    hint: 'Conti e documenti dietro PIN (da Advanced)',
  },
  {
    id: 'fine',
    title: 'Fatto',
    hint: 'Puoi raffinare tutto anche manualmente dalle sezioni',
  },
];

const MEDICO_SOFT_SECONDS = 90;

export function QuickCompileWizard({
  document,
  tier,
  onChange,
  onClose,
}: QuickCompileWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [draftResident, setDraftResident] = useState<ResidentHealthRecord>(() =>
    createEmptyResident()
  );
  const [sessionResidents, setSessionResidents] = useState<
    ResidentHealthRecord[]
  >([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [medicoPass, setMedicoPass] = useState(0);
  const [vaultPin, setVaultPin] = useState('');
  const [vaultPin2, setVaultPin2] = useState('');
  const [bankInstitution, setBankInstitution] = useState('');
  const [billsFolder, setBillsFolder] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultMsg, setVaultMsg] = useState<string | null>(null);

  const allowL3 = canAccessFeature(tier, 'allowLevel3Vault');
  const allowTax = canAccessFeature(tier, 'allowResidentTax');
  const allowPersonalBanks = canAccessFeature(tier, 'allowPersonalPatrimonio');

  const step = STEPS[stepIndex]!;
  const level1 = document.level1_public;
  const familyServices = ensureFamilyServices(level1.familyServices);
  const residentsAdded = sessionResidents.length;
  const focusResident =
    sessionResidents[sessionResidents.length - 1] ??
    document.level2_ice.residents[0] ??
    null;

  useEffect(() => {
    if (step.id !== 'medico') return;
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [step.id, medicoPass]);

  const patchHouse = (patch: Partial<PublicHouseData>) => {
    onChange({
      ...document,
      level1_public: { ...level1, ...patch },
      updatedAt: new Date().toISOString(),
    });
  };

  const patchFamilyServices = (
    patch: Partial<ReturnType<typeof ensureFamilyServices>>
  ) => {
    const next = ensureFamilyServices({ ...familyServices, ...patch });
    patchHouse({ familyServices: next });
  };

  const patchUtilityProvider = (catalogId: string, provider: string) => {
    const utilities = familyServices.utilities.map((u) =>
      u.catalogId === catalogId ? { ...u, provider } : u
    );
    patchFamilyServices({ utilities });
  };

  const patchDeadlineDate = (catalogId: string, renewalDate: string) => {
    const deadlines = familyServices.deadlines.map((d) =>
      d.catalogId === catalogId ? { ...d, renewalDate } : d
    );
    patchFamilyServices({ deadlines });
  };

  const progress = useMemo(
    () => Math.round(((stepIndex + 1) / STEPS.length) * 100),
    [stepIndex]
  );

  const replaceResidents = (residents: ResidentHealthRecord[]) => {
    onChange({
      ...document,
      level2_ice: { ...document.level2_ice, residents },
      updatedAt: new Date().toISOString(),
    });
  };

  const flushResidents = (extra: ResidentHealthRecord[]) => {
    const merged = [
      ...document.level2_ice.residents,
      ...sessionResidents,
      ...extra,
    ];
    const seen = new Set<string>();
    const residents = merged.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    replaceResidents(residents);
  };

  const updateFocusResident = (
    patch: Partial<ResidentHealthRecord>
  ): ResidentHealthRecord | null => {
    if (!focusResident) return null;
    const nextRes = { ...focusResident, ...patch };
    const inSession = sessionResidents.some((r) => r.id === focusResident.id);
    if (inSession) {
      const nextSession = sessionResidents.map((r) =>
        r.id === focusResident.id ? nextRes : r
      );
      setSessionResidents(nextSession);
      const base = document.level2_ice.residents.filter(
        (r) => !sessionResidents.some((s) => s.id === r.id)
      );
      replaceResidents([...base, ...nextSession]);
    } else {
      replaceResidents(
        document.level2_ice.residents.map((r) =>
          r.id === focusResident.id ? nextRes : r
        )
      );
    }
    return nextRes;
  };

  const next = () => {
    if (step.id === 'medico') {
      const name = draftResident.fullName.trim();
      const extra = name ? [draftResident] : [];
      if (name) {
        setSessionResidents((prev) => [...prev, draftResident]);
      }
      flushResidents(extra);
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const addAnotherResident = () => {
    const name = draftResident.fullName.trim();
    if (!name) return;
    const nextSession = [...sessionResidents, draftResident];
    setSessionResidents(nextSession);
    flushResidents([draftResident]);
    setDraftResident(createEmptyResident());
    setMedicoPass((p) => p + 1);
  };

  const sealVault = async () => {
    if (!allowL3) {
      next();
      return;
    }
    if (document.level3_vault?.ciphertextBase64) {
      setVaultMsg('Cassaforte già presente: raffinala in sezione Cassaforte.');
      next();
      return;
    }
    if (vaultPin.length < 4 || vaultPin !== vaultPin2) {
      setVaultMsg('PIN di almeno 4 caratteri, ripetuto uguale.');
      return;
    }
    setVaultBusy(true);
    setVaultMsg(null);
    try {
      const payload = createEmptyVaultPayload();
      if (bankInstitution.trim()) {
        payload.bankAccounts = [
          {
            institution: bankInstitution.trim(),
            accountType: 'Corrente Famiglia',
            ownershipDetails: 'Famiglia',
            notes: '',
          },
        ];
      }
      if (billsFolder.trim()) {
        payload.utilitiesLocations = {
          ...payload.utilitiesLocations,
          lastBillsFolderLocation: billsFolder.trim(),
        };
      }
      const sealed = await encryptVault(payload, vaultPin);
      onChange({
        ...document,
        level3_vault: sealed,
        updatedAt: new Date().toISOString(),
      });
      setVaultMsg('Cassaforte creata e cifrata.');
      next();
    } catch {
      setVaultMsg('Creazione cassaforte non riuscita. Riprova.');
    } finally {
      setVaultBusy(false);
    }
  };

  const softPct = Math.min(
    100,
    Math.round((elapsedSec / MEDICO_SOFT_SECONDS) * 100)
  );
  const softOver = elapsedSec > MEDICO_SOFT_SECONDS;

  const mobile = focusResident?.mobilePlan ?? emptyMobilePlan();
  const personalSubs = ensurePersonalSubscriptions(
    focusResident?.personalSubscriptions
  );
  const bollo = personalSubs.find((s) => s.catalogId === 'bollo');
  const auto = personalSubs.find((s) => s.catalogId === 'assicurazione_auto');
  const taxYear = new Date().getFullYear();
  const taxBlock = ensureResidentTaxYear(
    focusResident?.taxChecklist,
    taxYear
  );
  const taxYearState = taxBlock.years.find((y) => y.year === taxYear)!;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[var(--md-radius-md)] border-2 border-[var(--md-outline)] bg-[var(--md-surface-container)] p-4 shadow-[var(--md-elevation-2)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--brand-forest)]">
              Compilazione rapida · guidata
            </p>
            <h2
              id="wizard-title"
              className="flex items-center gap-2 text-xl font-black text-[var(--md-on-surface)]"
            >
              <Sparkles className="size-5" aria-hidden />
              {step.title}
            </h2>
            <p className="text-sm text-[var(--md-on-surface-variant)]">
              {step.hint}
            </p>
            {residentsAdded > 0 && step.id === 'medico' ? (
              <p className="text-xs font-semibold text-emerald-800">
                {residentsAdded} resident
                {residentsAdded === 1 ? 'e già aggiunto' : 'i già aggiunti'} ·
                prossimo in serie
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Chiudi"
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-[var(--md-radius-sm)] border-2 border-[var(--md-outline)]"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div
          className="mb-4 h-2 overflow-hidden rounded-full bg-[var(--md-surface-container-high)]"
          aria-hidden
        >
          <div
            className="h-full bg-[var(--brand-forest)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        {step.id === 'casa-base' ? (
          <div>
            <FieldLabel>Nome abitazione</FieldLabel>
            <TouchInput
              value={level1.houseName}
              placeholder="Es. Appartamento Via Roma 12"
              onChange={(e) => patchHouse({ houseName: e.target.value })}
            />
          </div>
        ) : null}

        {step.id === 'casa-chiusure' ? (
          <div className="space-y-3">
            <div>
              <FieldLabel>Chiusura acqua — posizione</FieldLabel>
              <TouchInput
                value={level1.utilities.waterCutoff.location}
                onChange={(e) =>
                  patchHouse({
                    utilities: {
                      ...level1.utilities,
                      waterCutoff: {
                        ...level1.utilities.waterCutoff,
                        location: e.target.value,
                      },
                    },
                  })
                }
              />
            </div>
            <div>
              <FieldLabel>Chiusura gas — posizione</FieldLabel>
              <TouchInput
                value={level1.utilities.gasCutoff.location}
                onChange={(e) =>
                  patchHouse({
                    utilities: {
                      ...level1.utilities,
                      gasCutoff: {
                        ...level1.utilities.gasCutoff,
                        location: e.target.value,
                      },
                    },
                  })
                }
              />
            </div>
            <div>
              <FieldLabel>Quadro elettrico</FieldLabel>
              <TouchInput
                value={level1.utilities.electricPanel.breakerLocation}
                onChange={(e) =>
                  patchHouse({
                    utilities: {
                      ...level1.utilities,
                      electricPanel: {
                        ...level1.utilities.electricPanel,
                        breakerLocation: e.target.value,
                      },
                    },
                  })
                }
              />
            </div>
          </div>
        ) : null}

        {step.id === 'casa-wifi' ? (
          <div className="space-y-3">
            <div>
              <FieldLabel>Wi‑Fi SSID</FieldLabel>
              <TouchInput
                value={level1.wifi.ssid}
                onChange={(e) =>
                  patchHouse({
                    wifi: { ...level1.wifi, ssid: e.target.value },
                  })
                }
              />
            </div>
            <div>
              <FieldLabel>Password Wi‑Fi</FieldLabel>
              <TouchInput
                value={level1.wifi.password}
                onChange={(e) =>
                  patchHouse({
                    wifi: { ...level1.wifi, password: e.target.value },
                  })
                }
              />
            </div>
            <div>
              <FieldLabel>Citofono</FieldLabel>
              <TouchInput
                value={level1.access?.intercom ?? ''}
                onChange={(e) =>
                  patchHouse({
                    access: {
                      intercom: e.target.value,
                      gate: level1.access?.gate ?? '',
                      parcels: level1.access?.parcels ?? '',
                    },
                  })
                }
              />
            </div>
          </div>
        ) : null}

        {step.id === 'family-utenze' ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--md-on-surface-variant)]">
              Contratti Famiglia (anche modificabili dopo in <strong>Utenze</strong>
              ).
            </p>
            {(['luce', 'gas', 'internet', 'acqua'] as const).map((id) => {
              const entry = familyServices.utilities.find(
                (u) => u.catalogId === id
              );
              const labels = {
                luce: 'Gestore Luce',
                gas: 'Gestore Gas',
                internet: 'Gestore Internet',
                acqua: 'Gestore Acqua',
              } as const;
              return (
                <div key={id}>
                  <FieldLabel>{labels[id]}</FieldLabel>
                  <TouchInput
                    value={entry?.provider ?? ''}
                    placeholder="Es. Enel, Italgas, TIM…"
                    onChange={(e) =>
                      patchUtilityProvider(id, e.target.value)
                    }
                  />
                </div>
              );
            })}
            <div>
              <FieldLabel>Scadenza controllo caldaia</FieldLabel>
              <TouchInput
                type="date"
                value={
                  familyServices.deadlines.find(
                    (d) => d.catalogId === 'controllo_caldaia'
                  )?.renewalDate ?? ''
                }
                onChange={(e) =>
                  patchDeadlineDate('controllo_caldaia', e.target.value)
                }
              />
            </div>
          </div>
        ) : null}

        {step.id === 'medico' ? (
          <div className="space-y-3">
            <div
              className="rounded-[var(--md-radius-sm)] border-2 border-[var(--md-outline-variant)] bg-[var(--md-surface-container-high)] p-3"
              aria-live="polite"
            >
              <p className="flex items-center gap-2 text-sm font-bold">
                <Timer className="size-4" aria-hidden />
                Tempo soft: {elapsedSec}s / {MEDICO_SOFT_SECONDS}s
                {softOver ? ' · oltre l’obiettivo (ok)' : ''}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--md-surface-container)]">
                <div
                  className={`h-full ${softOver ? 'bg-amber-600' : 'bg-emerald-700'}`}
                  style={{ width: `${softPct}%` }}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Nome completo</FieldLabel>
              <TouchInput
                value={draftResident.fullName}
                onChange={(e) =>
                  setDraftResident({
                    ...draftResident,
                    fullName: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <FieldLabel>Allergie (virgola)</FieldLabel>
              <TouchInput
                value={draftResident.allergies.join(', ')}
                placeholder="Es. Penicillina, noci"
                onChange={(e) =>
                  setDraftResident({
                    ...draftResident,
                    allergies: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
            <div>
              <FieldLabel>Farmaco salvavita (nome)</FieldLabel>
              <TouchInput
                value={draftResident.lifesavingMedicines[0]?.name ?? ''}
                onChange={(e) =>
                  setDraftResident({
                    ...draftResident,
                    lifesavingMedicines: [
                      {
                        name: e.target.value,
                        dosageSchedule:
                          draftResident.lifesavingMedicines[0]
                            ?.dosageSchedule ?? '',
                        physicalLocationInHouse:
                          draftResident.lifesavingMedicines[0]
                            ?.physicalLocationInHouse ?? '',
                      },
                    ],
                  })
                }
              />
            </div>
            <div>
              <FieldLabel>Dove si trova il farmaco</FieldLabel>
              <TouchTextarea
                value={
                  draftResident.lifesavingMedicines[0]
                    ?.physicalLocationInHouse ?? ''
                }
                onChange={(e) =>
                  setDraftResident({
                    ...draftResident,
                    lifesavingMedicines: [
                      {
                        name:
                          draftResident.lifesavingMedicines[0]?.name ?? '',
                        dosageSchedule:
                          draftResident.lifesavingMedicines[0]
                            ?.dosageSchedule ?? '',
                        physicalLocationInHouse: e.target.value,
                      },
                    ],
                  })
                }
              />
            </div>
            <div>
              <FieldLabel>Contatto di emergenza — nome</FieldLabel>
              <TouchInput
                value={draftResident.iceContacts[0]?.name ?? ''}
                onChange={(e) =>
                  setDraftResident({
                    ...draftResident,
                    iceContacts: [
                      {
                        priority: 1,
                        name: e.target.value,
                        relationship:
                          draftResident.iceContacts[0]?.relationship ?? '',
                        phoneNumber:
                          draftResident.iceContacts[0]?.phoneNumber ?? '',
                        hasHouseKeys:
                          draftResident.iceContacts[0]?.hasHouseKeys ?? false,
                      },
                    ],
                  })
                }
              />
            </div>
            <div>
              <FieldLabel>Contatto di emergenza — telefono</FieldLabel>
              <TouchInput
                type="tel"
                value={draftResident.iceContacts[0]?.phoneNumber ?? ''}
                onChange={(e) =>
                  setDraftResident({
                    ...draftResident,
                    iceContacts: [
                      {
                        priority: 1,
                        name: draftResident.iceContacts[0]?.name ?? '',
                        relationship:
                          draftResident.iceContacts[0]?.relationship ?? '',
                        phoneNumber: e.target.value,
                        hasHouseKeys:
                          draftResident.iceContacts[0]?.hasHouseKeys ?? false,
                      },
                    ],
                  })
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>Operatore mobile</FieldLabel>
                <TouchInput
                  value={draftResident.mobilePlan?.carrier ?? ''}
                  placeholder="TIM, Vodafone…"
                  onChange={(e) =>
                    setDraftResident({
                      ...draftResident,
                      mobilePlan: {
                        ...(draftResident.mobilePlan ?? emptyMobilePlan()),
                        carrier: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div>
                <FieldLabel>Numero mobile</FieldLabel>
                <TouchInput
                  type="tel"
                  value={draftResident.mobilePlan?.phoneNumber ?? ''}
                  onChange={(e) =>
                    setDraftResident({
                      ...draftResident,
                      mobilePlan: {
                        ...(draftResident.mobilePlan ?? emptyMobilePlan()),
                        phoneNumber: e.target.value,
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>
        ) : null}

        {step.id === 'personale' ? (
          <div className="space-y-3">
            {!focusResident ? (
              <p className="rounded-[var(--md-radius-sm)] border-2 border-amber-800 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
                Nessun residente ancora: torna indietro o salta. Puoi compilare
                mobile/bollo/tasse anche manualmente in Emergenza.
              </p>
            ) : (
              <>
                <p className="text-sm font-semibold">
                  Per: {focusResident.fullName || 'ultimo residente'}
                </p>
                <div>
                  <FieldLabel>Piano mobile (nome offerta)</FieldLabel>
                  <TouchInput
                    value={mobile.planName}
                    onChange={(e) =>
                      updateFocusResident({
                        mobilePlan: { ...mobile, planName: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Bollo auto — scadenza</FieldLabel>
                  <TouchInput
                    type="date"
                    value={bollo?.renewalDate ?? ''}
                    onChange={(e) => {
                      const personalSubscriptions = personalSubs.map((s) =>
                        s.catalogId === 'bollo'
                          ? { ...s, renewalDate: e.target.value }
                          : s
                      );
                      updateFocusResident({ personalSubscriptions });
                    }}
                  />
                </div>
                <div>
                  <FieldLabel>Assicurazione auto — compagnia</FieldLabel>
                  <TouchInput
                    value={auto?.provider ?? ''}
                    placeholder="Es. Unipol, Generali…"
                    onChange={(e) => {
                      const personalSubscriptions = personalSubs.map((s) =>
                        s.catalogId === 'assicurazione_auto'
                          ? { ...s, provider: e.target.value }
                          : s
                      );
                      updateFocusResident({ personalSubscriptions });
                    }}
                  />
                </div>
                {allowPersonalBanks ? (
                  <div>
                    <FieldLabel>Conto personale — istituto</FieldLabel>
                    <TouchInput
                      value={
                        focusResident.personalBankAccounts?.[0]?.institution ??
                        ''
                      }
                      placeholder="Es. Intesa"
                      onChange={(e) => {
                        const existing =
                          focusResident.personalBankAccounts?.[0];
                        updateFocusResident({
                          personalBankAccounts: [
                            {
                              id: existing?.id ?? crypto.randomUUID(),
                              institution: e.target.value,
                              accountType: existing?.accountType ?? 'Corrente',
                              ownershipDetails:
                                existing?.ownershipDetails ||
                                focusResident.fullName,
                              notes: existing?.notes ?? '',
                            },
                          ],
                        });
                      }}
                    />
                  </div>
                ) : (
                  <p className="text-xs font-semibold text-amber-950">
                    Conti personali: Premium (o prova). Modificabili dopo in
                    Emergenza.
                  </p>
                )}
                {allowTax ? (
                  <fieldset className="space-y-2 rounded-[var(--md-radius-sm)] border-2 border-amber-900/40 bg-amber-50/80 p-3">
                    <legend className="px-1 text-sm font-black">
                      Tasse IT {taxYear} (rapido)
                    </legend>
                    {(['tax-cu', 'tax-730', 'tax-imu'] as const).map((id) => {
                      const item = taxYearState.items.find(
                        (i) => i.catalogId === id
                      );
                      const labels: Record<string, string> = {
                        'tax-cu': 'CU ricevuta',
                        'tax-730': '730 inviato',
                        'tax-imu': 'IMU versata',
                      };
                      return (
                        <label
                          key={id}
                          className="flex min-h-12 cursor-pointer items-center gap-3 font-semibold"
                        >
                          <input
                            type="checkbox"
                            className="size-6 accent-[var(--brand-forest)]"
                            checked={Boolean(item?.done)}
                            onChange={(e) => {
                              const years = taxBlock.years.map((y) =>
                                y.year !== taxYear
                                  ? y
                                  : {
                                      ...y,
                                      items: y.items.map((it) =>
                                        it.catalogId === id
                                          ? {
                                              ...it,
                                              done: e.target.checked,
                                              doneAt: e.target.checked
                                                ? new Date().toISOString()
                                                : undefined,
                                            }
                                          : it
                                      ),
                                    }
                              );
                              updateFocusResident({
                                taxChecklist: {
                                  version: '1.0.0',
                                  years,
                                  updatedAt: new Date().toISOString(),
                                },
                              });
                            }}
                          />
                          {labels[id]}
                        </label>
                      );
                    })}
                  </fieldset>
                ) : (
                  <p className="text-xs font-semibold text-amber-950">
                    Checklist tasse IT: Premium (o prova). Disponibile sulla
                    scheda residente.
                  </p>
                )}
              </>
            )}
          </div>
        ) : null}

        {step.id === 'cassaforte' ? (
          <div className="space-y-3">
            {!allowL3 ? (
              <p className="rounded-[var(--md-radius-sm)] border-2 border-zinc-900 bg-[var(--md-surface-container-high)] p-3 text-sm font-semibold">
                <KeyRound className="mr-2 inline size-4" aria-hidden />
                Cassaforte e conti Famiglia: da <strong>Advanced</strong> (o
                prova Premium). Puoi saltare e riprendere dal menu Piano /
                Cassaforte.
              </p>
            ) : document.level3_vault?.ciphertextBase64 ? (
              <p className="rounded-[var(--md-radius-sm)] border-2 border-emerald-800 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">
                Cassaforte già attiva. Continua a modificarla manualmente in
                sezione Cassaforte.
              </p>
            ) : (
              <>
                <p className="text-sm text-[var(--md-on-surface-variant)]">
                  Crea ora un PIN e annota i primi dati Famiglia (poi
                  raffinabili).
                </p>
                <div>
                  <FieldLabel>PIN cassaforte</FieldLabel>
                  <TouchInput
                    type="password"
                    autoComplete="new-password"
                    value={vaultPin}
                    onChange={(e) => setVaultPin(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Ripeti PIN</FieldLabel>
                  <TouchInput
                    type="password"
                    autoComplete="new-password"
                    value={vaultPin2}
                    onChange={(e) => setVaultPin2(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Banca Famiglia (istituto)</FieldLabel>
                  <TouchInput
                    value={bankInstitution}
                    placeholder="Es. Intesa, Fineco…"
                    onChange={(e) => setBankInstitution(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Dove trovi le bollette</FieldLabel>
                  <TouchInput
                    value={billsFolder}
                    placeholder="Es. Cartella «Casa» nello scaffale"
                    onChange={(e) => setBillsFolder(e.target.value)}
                  />
                </div>
              </>
            )}
            {vaultMsg ? (
              <p className="text-sm font-semibold text-[var(--md-on-surface)]">
                {vaultMsg}
              </p>
            ) : null}
          </div>
        ) : null}

        {step.id === 'fine' ? (
          <p className="rounded-[var(--md-radius-sm)] border-2 border-emerald-800 bg-emerald-50 p-3 font-semibold text-emerald-950">
            Base pronta
            {residentsAdded
              ? ` · ${residentsAdded} resident${residentsAdded === 1 ? 'e' : 'i'}`
              : ''}
            . Ogni campo resta modificabile manualmente in Casa, Utenze,
            Emergenza e Cassaforte.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          {step.id === 'medico' ? (
            <>
              <button
                type="button"
                className="inline-flex min-h-12 items-center gap-2 rounded-[var(--md-radius-sm)] border-2 border-[var(--md-outline)] bg-[var(--md-surface-container)] px-4 font-bold"
                onClick={addAnotherResident}
              >
                <Check className="size-5" aria-hidden />
                Salva e altro residente
              </button>
              <button
                type="button"
                className="md-btn md-btn-filled"
                onClick={next}
              >
                Salva e continua
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </>
          ) : step.id === 'cassaforte' ? (
            <>
              <button
                type="button"
                className="inline-flex min-h-12 items-center gap-2 rounded-[var(--md-radius-sm)] border-2 border-[var(--md-outline)] px-4 font-bold"
                onClick={next}
              >
                Salta
              </button>
              <button
                type="button"
                className="md-btn md-btn-filled"
                disabled={vaultBusy}
                onClick={() => void (allowL3 ? sealVault() : next())}
              >
                {allowL3 && !document.level3_vault?.ciphertextBase64
                  ? 'Crea e continua'
                  : 'Avanti'}
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </>
          ) : step.id !== 'fine' ? (
            <button
              type="button"
              className="md-btn md-btn-filled"
              onClick={next}
            >
              Avanti
              <ChevronRight className="size-5" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex min-h-12 items-center gap-2 rounded-[var(--md-radius-sm)] border-2 border-emerald-900 bg-emerald-700 px-5 font-bold text-white"
              onClick={onClose}
            >
              <Check className="size-5" aria-hidden />
              Chiudi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
