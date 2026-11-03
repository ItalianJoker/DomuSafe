'use client';

/**
 * Livello 2 — Triage ICE (In Case of Emergency) per soccorso 118/112.
 * Free: 1 residente; Basic+: illimitati. Tasse e custom fields: Premium (+ trial).
 */

import { AlertTriangle, Cat, Plus, Trash2, UserRound } from 'lucide-react';
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

interface Level2IcePanelProps {
  tier: LicenseTier;
  residents: ResidentHealthRecord[];
  pets: PetRecord[];
  onResidentsChange: (residents: ResidentHealthRecord[]) => void;
  onPetsChange: (pets: PetRecord[]) => void;
}

export function Level2IcePanel({
  tier,
  residents,
  pets,
  onResidentsChange,
  onPetsChange,
}: Level2IcePanelProps) {
  const maxResidents = getMaxResidents(tier);
  const canAdd = canAddResident(tier, residents.length);
  const maxLabel = Number.isFinite(maxResidents)
    ? String(maxResidents)
    : 'illimitati';

  return (
    <section aria-labelledby="level2-title" className="space-y-8">
      <header>
        <p className="text-sm font-bold uppercase tracking-widest text-red-800">
          Livello 2 · ICE Emergenza
        </p>
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
        </div>

        {residents.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-zinc-400 p-4 text-zinc-700">
            {Number.isFinite(maxResidents)
              ? `Nessun residente. Aggiungi fino a ${maxResidents} schede ICE.`
              : 'Nessun residente. Puoi aggiungere schede ICE illimitate.'}
          </p>
        ) : (
          <ul className="space-y-6">
            {residents.map((resident, index) => (
              <li
                key={resident.id}
                className="space-y-3 rounded-lg border-2 border-red-900 bg-rose-50 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-base font-black text-zinc-950">
                    Residente {index + 1}
                  </h4>
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

                <FeatureGate tier={tier} feature="allowResidentTax">
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
              </li>
            ))}
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
        <FieldLabel>Contatti ICE</FieldLabel>
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
