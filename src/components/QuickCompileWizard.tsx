'use client';

/**
 * Wizard compilazione rapida: Casa + serie multi-residente ≤90s ciascuno.
 * Barra tempo soft (non bloccante) sul passo medico.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Sparkles, Timer, X } from 'lucide-react';
import type {
  DomusRunbookDocument,
  PublicHouseData,
  ResidentHealthRecord,
} from '@/types/domus';
import { createEmptyResident } from '@/lib/defaults';
import { FieldLabel, TouchInput, TouchTextarea } from '@/components/TouchField';

interface QuickCompileWizardProps {
  document: DomusRunbookDocument;
  onChange: (next: DomusRunbookDocument) => void;
  onClose: () => void;
}

type StepId =
  | 'casa-base'
  | 'casa-utenze'
  | 'casa-wifi'
  | 'medico'
  | 'fine';

const STEPS: Array<{ id: StepId; title: string; hint: string }> = [
  {
    id: 'casa-base',
    title: 'Nome casa',
    hint: 'Circa 5 minuti per la casa · passo 1/3',
  },
  {
    id: 'casa-utenze',
    title: 'Chiusure acqua / gas / luce',
    hint: 'Passo 2/3 · dove chiudere in emergenza',
  },
  {
    id: 'casa-wifi',
    title: 'Wi‑Fi e accessi',
    hint: 'Passo 3/3 · utili a ospiti e sitter',
  },
  {
    id: 'medico',
    title: 'Scheda medica rapida',
    hint: 'Obiettivo ≤ 90 secondi a persona (barra soft)',
  },
  {
    id: 'fine',
    title: 'Fatto',
    hint: 'Puoi raffinare tutto dalle sezioni Casa ed Emergenza',
  },
];

const MEDICO_SOFT_SECONDS = 90;

export function QuickCompileWizard({
  document,
  onChange,
  onClose,
}: QuickCompileWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [draftResident, setDraftResident] = useState<ResidentHealthRecord>(() =>
    createEmptyResident()
  );
  /** Residenti aggiunti in questa sessione wizard (evita stale closure). */
  const [sessionResidents, setSessionResidents] = useState<
    ResidentHealthRecord[]
  >([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [medicoPass, setMedicoPass] = useState(0);
  const step = STEPS[stepIndex]!;

  const level1 = document.level1_public;
  const residentsAdded = sessionResidents.length;

  // Soft timer ≤90s: aggiorna solo via interval (non bloccante).
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

  const progress = useMemo(
    () => Math.round(((stepIndex + 1) / STEPS.length) * 100),
    [stepIndex]
  );

  const flushResidents = (extra: ResidentHealthRecord[]) => {
    const merged = [
      ...document.level2_ice.residents,
      ...sessionResidents,
      ...extra,
    ];
    // Dedup by id in case of re-flush
    const seen = new Set<string>();
    const residents = merged.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    onChange({
      ...document,
      level2_ice: { ...document.level2_ice, residents },
      updatedAt: new Date().toISOString(),
    });
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
    // Resta sul passo medico — serie ≤90s
  };

  const softPct = Math.min(
    100,
    Math.round((elapsedSec / MEDICO_SOFT_SECONDS) * 100)
  );
  const softOver = elapsedSec > MEDICO_SOFT_SECONDS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg border-2 border-zinc-900 bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--brand-forest)]">
              Compilazione rapida
            </p>
            <h2
              id="wizard-title"
              className="flex items-center gap-2 text-xl font-black"
            >
              <Sparkles className="size-5" aria-hidden />
              {step.title}
            </h2>
            <p className="text-sm text-zinc-600">{step.hint}</p>
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
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-zinc-900"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div
          className="mb-4 h-2 overflow-hidden rounded-full bg-zinc-200"
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

        {step.id === 'casa-utenze' ? (
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

        {step.id === 'medico' ? (
          <div className="space-y-3">
            <div
              className="rounded-md border-2 border-zinc-300 bg-zinc-50 p-3"
              aria-live="polite"
            >
              <p className="flex items-center gap-2 text-sm font-bold text-zinc-800">
                <Timer className="size-4" aria-hidden />
                Tempo soft: {elapsedSec}s / {MEDICO_SOFT_SECONDS}s
                {softOver ? ' · oltre l’obiettivo (ok, non bloccante)' : ''}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200">
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
              <FieldLabel>Contatto ICE — nome</FieldLabel>
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
              <FieldLabel>Contatto ICE — telefono</FieldLabel>
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
          </div>
        ) : null}

        {step.id === 'fine' ? (
          <p className="rounded-md border-2 border-emerald-800 bg-emerald-50 p-3 font-semibold text-emerald-950">
            Base pronta
            {residentsAdded
              ? ` · ${residentsAdded} resident${residentsAdded === 1 ? 'e' : 'i'}`
              : ''}
            . Continua da Casa / Emergenza per foto, scadenze e dettagli.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          {step.id === 'medico' ? (
            <>
              <button
                type="button"
                className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold"
                onClick={addAnotherResident}
              >
                <Check className="size-5" aria-hidden />
                Salva e altro residente
              </button>
              <button
                type="button"
                className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-[var(--brand-ink)] px-5 font-bold text-white"
                onClick={next}
              >
                Salva e termina
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </>
          ) : step.id !== 'fine' ? (
            <button
              type="button"
              className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-[var(--brand-ink)] px-5 font-bold text-white"
              onClick={next}
            >
              Avanti
              <ChevronRight className="size-5" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-emerald-900 bg-emerald-700 px-5 font-bold text-white"
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
