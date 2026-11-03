'use client';

/**
 * Livello 2 — Triage ICE (In Case of Emergency) per soccorso 118/112.
 * Free: 1 residente; Basic+: illimitati. Tasse e custom fields: Premium (+ trial).
 */

import { useState } from 'react';
import {
  AlertTriangle,
  Cat,
  ChevronDown,
  ChevronUp,
  Phone,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react';
import type {
  BloodGroup,
  EvacuationMobility,
  PetRecord,
  ResidentHealthRecord,
} from '@/types/domus';
import { canAddResident, getMaxResidents } from '@/lib/licensing';
import { createEmptyPet, createEmptyResident } from '@/lib/defaults';
import { BLOOD_GROUP_LABELS, MOBILITY_LABELS } from '@/lib/labels';
import { FieldLabel, TouchInput, TouchSelect, TouchTextarea } from '@/components/TouchField';
import { ResidentTaxChecklist } from '@/components/ResidentTaxChecklist';
import { ResidentServicesPanel } from '@/components/ResidentServicesPanel';
import { CustomFieldsEditor } from '@/components/CustomFieldsEditor';
import { FeatureGate } from '@/components/FeatureGate';
import { enforceResidentForTier } from '@/lib/vault-policy';
import { canAccessFeature } from '@/lib/licensing';
import type { LicenseTier } from '@/types/domus';
import {
  ALLERGY_PRESETS,
  CONDITION_PRESETS,
  DEVICE_PRESETS,
  togglePreset,
} from '@/lib/medical-presets';
import { PhotoCaptureField } from '@/components/PhotoCaptureField';
import { EmptyStateCta } from '@/components/EmptyStateCta';

interface Level2IcePanelProps {
  tier: LicenseTier;
  residents: ResidentHealthRecord[];
  pets: PetRecord[];
  onResidentsChange: (residents: ResidentHealthRecord[]) => void;
  onPetsChange: (pets: PetRecord[]) => void;
  onOpenRescue?: () => void;
  onStartWizard?: () => void;
}

export function Level2IcePanel({
  tier,
  residents,
  pets,
  onResidentsChange,
  onPetsChange,
  onOpenRescue,
  onStartWizard,
}: Level2IcePanelProps) {
  const maxResidents = getMaxResidents(tier);
  const canAdd = canAddResident(tier, residents.length);
  const maxLabel = Number.isFinite(maxResidents)
    ? String(maxResidents)
    : 'illimitati';
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  return (
    <section aria-labelledby="level2-title" className="space-y-8">
      <header>
        <p className="text-sm font-bold uppercase tracking-widest text-red-800">
          Livello 2 · Emergenza e soccorso
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href="tel:118"
            className="inline-flex min-h-14 items-center gap-2 rounded-md border-2 border-red-900 bg-red-700 px-5 font-black text-white"
          >
            <Phone className="size-5" aria-hidden />
            Chiama 118
          </a>
          {onOpenRescue && residents.length > 0 ? (
            <button
              type="button"
              className="inline-flex min-h-14 items-center gap-2 rounded-md border-2 border-red-900 bg-white px-5 font-black text-red-950"
              onClick={onOpenRescue}
            >
              <AlertTriangle className="size-5" aria-hidden />
              Modalità soccorso
            </button>
          ) : null}
        </div>
        <h2 id="level2-title" className="mt-1 text-2xl font-black text-zinc-950">
          Schede sanitarie
        </h2>
        <p className="mt-2 max-w-2xl text-base text-zinc-700">
          Dati per il triage del soccorso. In stampa restano sotto la linguetta
          privacy pieghevole.
        </p>
        <p className="mt-3 inline-flex items-start gap-2 rounded-md border-2 border-red-800 bg-red-50 px-3 py-2 text-sm font-semibold text-red-950">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          Piano {tier}: massimo {maxLabel} residenti ({residents.length}{' '}
          inseriti).
        </p>
      </header>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-950">
            <UserRound className="size-6" aria-hidden />
            Residenti
          </h3>
          {residents.length > 0 ? (
            <button
              type="button"
              disabled={!canAdd}
              className="inline-flex min-h-12 min-w-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold text-zinc-950 enabled:hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() =>
                onResidentsChange([...residents, createEmptyResident()])
              }
            >
              <Plus className="size-5" aria-hidden />
              Aggiungi residente
            </button>
          ) : null}
        </div>

        {residents.length === 0 ? (
          <div className="space-y-3 rounded-lg border-2 border-red-900 bg-rose-50 p-4">
            <EmptyStateCta
              title="Nessun residente"
              body={
                Number.isFinite(maxResidents)
                  ? `Aggiungi fino a ${maxResidents} schede di emergenza (nome, allergie, contatti). Compila i campi a mano, oppure usa la guida rapida se preferisci.`
                  : 'Aggiungi la prima scheda di emergenza: nome, allergie e un contatto. Ogni campo è modificabile senza guida.'
              }
              cta="Aggiungi residente"
              tone="danger"
              onAction={() =>
                onResidentsChange([...residents, createEmptyResident()])
              }
            />
            {onStartWizard ? (
              <button
                type="button"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border-2 border-red-900 bg-white px-4 font-bold text-red-950"
                onClick={onStartWizard}
              >
                Guida rapida (opzionale)
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-6">
            {residents.map((resident, index) => {
              const open = openIds[resident.id] ?? index === 0;
              return (
              <li
                key={resident.id}
                className="space-y-3 rounded-lg border-2 border-red-900 bg-rose-50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    className="flex min-h-12 flex-1 items-center gap-2 text-left font-black text-zinc-950"
                    aria-expanded={open}
                    onClick={() =>
                      setOpenIds((prev) => ({
                        ...prev,
                        [resident.id]: !open,
                      }))
                    }
                  >
                    {open ? (
                      <ChevronUp className="size-5" aria-hidden />
                    ) : (
                      <ChevronDown className="size-5" aria-hidden />
                    )}
                    {resident.fullName || `Residente ${index + 1}`}
                    <span className="text-xs font-semibold text-zinc-600">
                      {BLOOD_GROUP_LABELS[resident.bloodGroup]}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Rimuovi residente ${index + 1}`}
                    className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-red-800 bg-white text-red-900"
                    onClick={() =>
                      onResidentsChange(
                        residents.filter((r) => r.id !== resident.id)
                      )
                    }
                  >
                    <Trash2 className="size-5" aria-hidden />
                  </button>
                </div>

                {!open ? (
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        {
                          anchor: 'services' as const,
                          label: 'Mobile · Abbonamenti',
                        },
                        {
                          anchor: 'services' as const,
                          label: 'Conti personali ★',
                        },
                        {
                          anchor: 'tax' as const,
                          label: 'Tasse e adempimenti ★',
                        },
                      ]
                    ).map((chip) => (
                      <button
                        key={`${resident.id}-${chip.label}`}
                        type="button"
                        className="inline-flex min-h-10 items-center rounded-md border border-red-900/40 bg-white px-3 text-xs font-bold text-red-950"
                        onClick={() => {
                          setOpenIds((prev) => ({
                            ...prev,
                            [resident.id]: true,
                          }));
                          window.setTimeout(() => {
                            const el = window.document.getElementById(
                              chip.anchor === 'tax'
                                ? `resident-tax-${resident.id}`
                                : `resident-services-${resident.id}`
                            );
                            el?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            });
                          }, 50);
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                {open ? (
                <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Nome completo</FieldLabel>
                    <TouchInput
                      value={resident.fullName}
                      onChange={(e) =>
                        patchResident(residents, resident.id, {
                          fullName: e.target.value,
                        }, onResidentsChange, tier)
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel>Anno di nascita</FieldLabel>
                    <TouchInput
                      type="number"
                      inputMode="numeric"
                      value={resident.birthYear}
                      onChange={(e) =>
                        patchResident(residents, resident.id, {
                          birthYear: Number(e.target.value) || 0,
                        }, onResidentsChange, tier)
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel>Gruppo sanguigno</FieldLabel>
                    <TouchSelect
                      value={resident.bloodGroup}
                      onChange={(e) =>
                        patchResident(residents, resident.id, {
                          bloodGroup: e.target.value as BloodGroup,
                        }, onResidentsChange, tier)
                      }
                    >
                      {(Object.keys(BLOOD_GROUP_LABELS) as BloodGroup[]).map(
                        (key) => (
                          <option key={key} value={key}>
                            {BLOOD_GROUP_LABELS[key]}
                          </option>
                        )
                      )}
                    </TouchSelect>
                  </div>
                  <div>
                    <FieldLabel>Mobilità evacuazione</FieldLabel>
                    <TouchSelect
                      value={resident.mobilityStatus}
                      onChange={(e) =>
                        patchResident(residents, resident.id, {
                          mobilityStatus: e.target.value as EvacuationMobility,
                        }, onResidentsChange, tier)
                      }
                    >
                      {(
                        Object.keys(MOBILITY_LABELS) as EvacuationMobility[]
                      ).map((key) => (
                        <option key={key} value={key}>
                          {MOBILITY_LABELS[key]}
                        </option>
                      ))}
                    </TouchSelect>
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel>Camera da letto</FieldLabel>
                    <TouchInput
                      value={resident.sleepingRoom}
                      onChange={(e) =>
                        patchResident(residents, resident.id, {
                          sleepingRoom: e.target.value,
                        }, onResidentsChange, tier)
                      }
                      placeholder="Es. Camera matrimoniale, primo piano"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <PhotoCaptureField
                      label="Foto riconoscitiva (opzionale)"
                      value={resident.photoDataUrl}
                      onChange={(photoDataUrl) =>
                        patchResident(
                          residents,
                          resident.id,
                          { photoDataUrl },
                          onResidentsChange,
                          tier
                        )
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel>Documento ID (dove si trova)</FieldLabel>
                    <TouchInput
                      value={resident.idDocumentHint ?? ''}
                      placeholder="Es. CI nel cassetto ingresso"
                      onChange={(e) =>
                        patchResident(
                          residents,
                          resident.id,
                          { idDocumentHint: e.target.value },
                          onResidentsChange,
                          tier
                        )
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel>Allergie (virgola)</FieldLabel>
                    <TouchInput
                      value={resident.allergies.join(', ')}
                      onChange={(e) =>
                        patchResident(residents, resident.id, {
                          allergies: splitList(e.target.value),
                        }, onResidentsChange, tier)
                      }
                    />
                    <PresetRow
                      presets={ALLERGY_PRESETS}
                      selected={resident.allergies}
                      onToggle={(preset) =>
                        patchResident(
                          residents,
                          resident.id,
                          { allergies: togglePreset(resident.allergies, preset) },
                          onResidentsChange,
                          tier
                        )
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel>Patologie croniche (virgola)</FieldLabel>
                    <TouchInput
                      value={resident.chronicConditions.join(', ')}
                      onChange={(e) =>
                        patchResident(residents, resident.id, {
                          chronicConditions: splitList(e.target.value),
                        }, onResidentsChange, tier)
                      }
                    />
                    <PresetRow
                      presets={CONDITION_PRESETS}
                      selected={resident.chronicConditions}
                      onToggle={(preset) =>
                        patchResident(
                          residents,
                          resident.id,
                          {
                            chronicConditions: togglePreset(
                              resident.chronicConditions,
                              preset
                            ),
                          },
                          onResidentsChange,
                          tier
                        )
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel>Dispositivi medici (virgola)</FieldLabel>
                    <TouchInput
                      value={resident.medicalDevices.join(', ')}
                      onChange={(e) =>
                        patchResident(residents, resident.id, {
                          medicalDevices: splitList(e.target.value),
                        }, onResidentsChange, tier)
                      }
                      placeholder="Es. Pacemaker, insulina pen"
                    />
                    <PresetRow
                      presets={DEVICE_PRESETS}
                      selected={resident.medicalDevices}
                      onToggle={(preset) =>
                        patchResident(
                          residents,
                          resident.id,
                          {
                            medicalDevices: togglePreset(
                              resident.medicalDevices,
                              preset
                            ),
                          },
                          onResidentsChange,
                          tier
                        )
                      }
                    />
                  </div>
                </div>

                <MedicineEditor
                  medicines={resident.lifesavingMedicines}
                  onChange={(lifesavingMedicines) =>
                    patchResident(
                      residents,
                      resident.id,
                      { lifesavingMedicines },
                      onResidentsChange,
                      tier
                    )
                  }
                />

                <IceContactsEditor
                  contacts={resident.iceContacts}
                  onChange={(iceContacts) =>
                    patchResident(
                      residents,
                      resident.id,
                      { iceContacts },
                      onResidentsChange,
                      tier
                    )
                  }
                />

                <div id={`resident-services-${resident.id}`}>
                  <ResidentServicesPanel
                    tier={tier}
                    mobilePlan={resident.mobilePlan}
                    personalSubscriptions={resident.personalSubscriptions}
                    personalBankAccounts={resident.personalBankAccounts}
                    onMobilePlanChange={(mobilePlan) =>
                      patchResident(
                        residents,
                        resident.id,
                        { mobilePlan },
                        onResidentsChange,
                        tier
                      )
                    }
                    onSubscriptionsChange={(personalSubscriptions) =>
                      patchResident(
                        residents,
                        resident.id,
                        { personalSubscriptions },
                        onResidentsChange,
                        tier
                      )
                    }
                    onBankAccountsChange={(personalBankAccounts) =>
                      patchResident(
                        residents,
                        resident.id,
                        { personalBankAccounts },
                        onResidentsChange,
                        tier
                      )
                    }
                  />
                </div>

                <div id={`resident-tax-${resident.id}`}>
                  <FeatureGate
                    tier={tier}
                    feature="allowResidentTax"
                    fallback={
                      <p className="rounded-md border-2 border-amber-800 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                        Checklist tasse e adempimenti italiani: inclusa in
                        Premium (o durante la prova). Apri Piano per attivarla.
                        I campi restano comunque sulla scheda residente.
                      </p>
                    }
                  >
                    <ResidentTaxChecklist
                      taxChecklist={resident.taxChecklist}
                      onChange={(taxChecklist) =>
                        patchResident(
                          residents,
                          resident.id,
                          { taxChecklist },
                          onResidentsChange,
                          tier
                        )
                      }
                    />
                  </FeatureGate>
                </div>

                <FeatureGate tier={tier} feature="allowCustomFields">
                  <CustomFieldsEditor
                    title="Campi personalizzati (residente)"
                    fields={resident.customFields}
                    onChange={(customFields) =>
                      patchResident(
                        residents,
                        resident.id,
                        { customFields },
                        onResidentsChange,
                        tier
                      )
                    }
                  />
                </FeatureGate>
                </>
                ) : (
                  <p className="text-sm text-zinc-700">
                    Scheda chiusa — tocca il nome per aprire (allergie, farmaci,
                    contatti di emergenza).
                  </p>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-950">
            <Cat className="size-6" aria-hidden />
            Animali domestici
          </h3>
          <button
            type="button"
            className="inline-flex min-h-12 min-w-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold text-zinc-950 hover:bg-zinc-100"
            onClick={() => onPetsChange([...pets, createEmptyPet()])}
          >
            <Plus className="size-5" aria-hidden />
            Aggiungi animale
          </button>
        </div>

        {pets.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-zinc-400 p-4 text-zinc-700">
            Nessun animale registrato.
          </p>
        ) : (
          <ul className="space-y-4">
            {pets.map((pet, index) => (
              <li
                key={`pet-${index}`}
                className="grid gap-3 rounded-lg border-2 border-zinc-900 bg-violet-50 p-4 sm:grid-cols-2"
              >
                <div className="sm:col-span-2 flex justify-between">
                  <h4 className="font-black text-zinc-950">Animale {index + 1}</h4>
                  <button
                    type="button"
                    aria-label={`Rimuovi animale ${index + 1}`}
                    className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-red-800 bg-white text-red-900"
                    onClick={() =>
                      onPetsChange(pets.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="size-5" aria-hidden />
                  </button>
                </div>
                <div>
                  <FieldLabel>Nome</FieldLabel>
                  <TouchInput
                    value={pet.name}
                    onChange={(e) =>
                      patchPet(pets, index, { name: e.target.value }, onPetsChange)
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Specie</FieldLabel>
                  <TouchSelect
                    value={pet.species}
                    onChange={(e) =>
                      patchPet(
                        pets,
                        index,
                        {
                          species: e.target.value as PetRecord['species'],
                        },
                        onPetsChange
                      )
                    }
                  >
                    <option value="Cane">Cane</option>
                    <option value="Gatto">Gatto</option>
                    <option value="Altro">Altro</option>
                  </TouchSelect>
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Nascondigli in caso di panico</FieldLabel>
                  <TouchTextarea
                    value={pet.panicHideouts}
                    onChange={(e) =>
                      patchPet(
                        pets,
                        index,
                        { panicHideouts: e.target.value },
                        onPetsChange
                      )
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Clinica H24</FieldLabel>
                  <TouchInput
                    value={pet.vetEmergencyH24.clinicName}
                    onChange={(e) =>
                      patchPet(
                        pets,
                        index,
                        {
                          vetEmergencyH24: {
                            ...pet.vetEmergencyH24,
                            clinicName: e.target.value,
                          },
                        },
                        onPetsChange
                      )
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Telefono vet</FieldLabel>
                  <TouchInput
                    type="tel"
                    value={pet.vetEmergencyH24.phone}
                    onChange={(e) =>
                      patchPet(
                        pets,
                        index,
                        {
                          vetEmergencyH24: {
                            ...pet.vetEmergencyH24,
                            phone: e.target.value,
                          },
                        },
                        onPetsChange
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Indirizzo clinica</FieldLabel>
                  <TouchInput
                    value={pet.vetEmergencyH24.address}
                    onChange={(e) =>
                      patchPet(
                        pets,
                        index,
                        {
                          vetEmergencyH24: {
                            ...pet.vetEmergencyH24,
                            address: e.target.value,
                          },
                        },
                        onPetsChange
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <FeatureGate tier={tier} feature="allowCustomFields">
                    <CustomFieldsEditor
                      title="Campi personalizzati (animale)"
                      fields={pet.customFields}
                      onChange={(customFields) =>
                        patchPet(pets, index, { customFields }, onPetsChange)
                      }
                    />
                  </FeatureGate>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function splitList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function patchResident(
  residents: ResidentHealthRecord[],
  id: string,
  patch: Partial<ResidentHealthRecord>,
  onChange: (next: ResidentHealthRecord[]) => void,
  tier: LicenseTier
) {
  onChange(
    residents.map((r) =>
      r.id === id
        ? enforceResidentForTier(
            { ...r, ...patch },
            {
              allowCustomFields: canAccessFeature(tier, 'allowCustomFields'),
              allowPersonalPatrimonio: canAccessFeature(
                tier,
                'allowPersonalPatrimonio'
              ),
            }
          )
        : r
    )
  );
}

function patchPet(
  pets: PetRecord[],
  index: number,
  patch: Partial<PetRecord>,
  onChange: (next: PetRecord[]) => void
) {
  onChange(pets.map((p, i) => (i === index ? { ...p, ...patch } : p)));
}

function MedicineEditor({
  medicines,
  onChange,
}: {
  medicines: ResidentHealthRecord['lifesavingMedicines'];
  onChange: (next: ResidentHealthRecord['lifesavingMedicines']) => void;
}) {
  return (
    <div className="space-y-2 border-t-2 border-red-200 pt-3">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>Farmaci salvavita</FieldLabel>
        <button
          type="button"
          className="inline-flex min-h-12 items-center gap-1 rounded-md border-2 border-zinc-900 bg-white px-3 font-bold"
          onClick={() =>
            onChange([
              ...medicines,
              { name: '', dosageSchedule: '', physicalLocationInHouse: '' },
            ])
          }
        >
          <Plus className="size-4" aria-hidden />
          Farmaco
        </button>
      </div>
      {medicines.map((med, index) => (
        <div
          key={`med-${index}`}
          className="grid gap-2 rounded-md border border-red-300 bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <TouchInput
            placeholder="Nome"
            value={med.name}
            onChange={(e) => {
              const next = medicines.map((m, i) =>
                i === index ? { ...m, name: e.target.value } : m
              );
              onChange(next);
            }}
          />
          <TouchInput
            placeholder="Dosaggio"
            value={med.dosageSchedule}
            onChange={(e) => {
              const next = medicines.map((m, i) =>
                i === index ? { ...m, dosageSchedule: e.target.value } : m
              );
              onChange(next);
            }}
          />
          <TouchInput
            placeholder="Dove si trova in casa"
            value={med.physicalLocationInHouse}
            onChange={(e) => {
              const next = medicines.map((m, i) =>
                i === index
                  ? { ...m, physicalLocationInHouse: e.target.value }
                  : m
              );
              onChange(next);
            }}
          />
          <button
            type="button"
            aria-label="Rimuovi farmaco"
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-red-800 text-red-900"
            onClick={() => onChange(medicines.filter((_, i) => i !== index))}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

function IceContactsEditor({
  contacts,
  onChange,
}: {
  contacts: ResidentHealthRecord['iceContacts'];
  onChange: (next: ResidentHealthRecord['iceContacts']) => void;
}) {
  return (
    <div className="space-y-2 border-t-2 border-red-200 pt-3">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>Contatti di emergenza</FieldLabel>
        <button
          type="button"
          className="inline-flex min-h-12 items-center gap-1 rounded-md border-2 border-zinc-900 bg-white px-3 font-bold"
          onClick={() =>
            onChange([
              ...contacts,
              {
                priority: Math.min(3, contacts.length + 1) as 1 | 2 | 3,
                name: '',
                relationship: '',
                phoneNumber: '',
                hasHouseKeys: false,
              },
            ])
          }
        >
          <Plus className="size-4" aria-hidden />
          Contatto
        </button>
      </div>
      {contacts.map((contact, index) => (
        <div
          key={`ice-${index}`}
          className="grid gap-2 rounded-md border border-red-300 bg-white p-3 sm:grid-cols-2"
        >
          <TouchInput
            placeholder="Nome"
            value={contact.name}
            onChange={(e) => {
              const next = contacts.map((c, i) =>
                i === index ? { ...c, name: e.target.value } : c
              );
              onChange(next);
            }}
          />
          <TouchInput
            placeholder="Relazione"
            value={contact.relationship}
            onChange={(e) => {
              const next = contacts.map((c, i) =>
                i === index ? { ...c, relationship: e.target.value } : c
              );
              onChange(next);
            }}
          />
          <TouchInput
            type="tel"
            placeholder="Telefono"
            value={contact.phoneNumber}
            onChange={(e) => {
              const next = contacts.map((c, i) =>
                i === index ? { ...c, phoneNumber: e.target.value } : c
              );
              onChange(next);
            }}
          />
          <label className="flex min-h-12 items-center gap-3 font-semibold text-zinc-900">
            <input
              type="checkbox"
              className="size-6 accent-red-800"
              checked={contact.hasHouseKeys}
              onChange={(e) => {
                const next = contacts.map((c, i) =>
                  i === index ? { ...c, hasHouseKeys: e.target.checked } : c
                );
                onChange(next);
              }}
            />
            Ha le chiavi di casa
          </label>
          <button
            type="button"
            className="inline-flex min-h-12 items-center justify-center rounded-md border-2 border-red-800 text-red-900 sm:col-span-2"
            onClick={() => onChange(contacts.filter((_, i) => i !== index))}
          >
            Rimuovi contatto
          </button>
        </div>
      ))}
    </div>
  );
}

function PresetRow({
  presets,
  selected,
  onToggle,
}: {
  presets: readonly string[];
  selected: string[];
  onToggle: (preset: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {presets.map((preset) => {
        const active = selected.some(
          (s) => s.trim().toLowerCase() === preset.toLowerCase()
        );
        return (
          <button
            key={preset}
            type="button"
            className={`min-h-10 rounded-md border-2 px-3 text-xs font-bold ${
              active
                ? 'border-red-900 bg-red-800 text-white'
                : 'border-zinc-400 bg-white text-zinc-900'
            }`}
            onClick={() => onToggle(preset)}
          >
            {preset}
          </button>
        );
      })}
    </div>
  );
}
