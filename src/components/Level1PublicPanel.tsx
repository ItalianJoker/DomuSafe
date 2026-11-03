'use client';

/**
 * Livello 1 — Runbook pubblico della casa (utenze, Wi‑Fi, rifiuti, artigiani).
 * Accessibile a ospiti/host senza PIN: nessun dato sanitario.
 * Campi personalizzati: solo Premium (+ trial) via allowCustomFields.
 */

import type { ReactNode } from 'react';
import { Plus, Trash2, Wifi, Droplets, Flame, Zap, Thermometer, Recycle, Wrench } from 'lucide-react';
import type { LicenseTier, PublicHouseData } from '@/types/domus';
import { canAccessFeature } from '@/lib/licensing';
import { WEEKDAYS } from '@/lib/labels';
import { FieldLabel, TouchInput, TouchSelect, TouchTextarea } from '@/components/TouchField';
import { CustomFieldsEditor } from '@/components/CustomFieldsEditor';
import { FamilyServicesPanel } from '@/components/FamilyServicesPanel';
import { FeatureGate } from '@/components/FeatureGate';
import { enforcePublicHouseForTier } from '@/lib/vault-policy';

interface Level1PublicPanelProps {
  tier: LicenseTier;
  data: PublicHouseData;
  onChange: (next: PublicHouseData) => void;
}

export function Level1PublicPanel({
  tier,
  data,
  onChange,
}: Level1PublicPanelProps) {
  const allowCustom = canAccessFeature(tier, 'allowCustomFields');

  const update = (patch: Partial<PublicHouseData>) => {
    // Free/Basic/Advanced: strip custom fields / servizi personalizzati.
    const merged = { ...data, ...patch };
    onChange(
      enforcePublicHouseForTier(merged, { allowCustomFields: allowCustom })
    );
  };

  return (
    <section aria-labelledby="level1-title" className="space-y-8">
      <header>
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-800">
          Livello 1 · Pubblico
        </p>
        <h2 id="level1-title" className="mt-1 text-2xl font-black text-zinc-950">
          Manuale casa
        </h2>
        <p className="mt-2 max-w-2xl text-base text-zinc-700">
          Informazioni sicure per ospiti e vicini: utenze, Wi‑Fi, rifiuti e
          contatti degli artigiani.
        </p>
      </header>

      <div>
        <FieldLabel htmlFor="house-name">Nome abitazione</FieldLabel>
        <TouchInput
          id="house-name"
          value={data.houseName}
          onChange={(e) => update({ houseName: e.target.value })}
          placeholder="Es. Appartamento Via Roma 12"
          autoComplete="off"
        />
      </div>

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-950">
          <Droplets className="size-6 shrink-0" aria-hidden />
          Utenze
        </h3>

        <UtilityBlock
          icon={<Droplets className="size-5" aria-hidden />}
          title="Chiusura acqua"
          location={data.utilities.waterCutoff.location}
          instructions={data.utilities.waterCutoff.instructions}
          onLocation={(location) =>
            update({
              utilities: {
                ...data.utilities,
                waterCutoff: { ...data.utilities.waterCutoff, location },
              },
            })
          }
          onInstructions={(instructions) =>
            update({
              utilities: {
                ...data.utilities,
                waterCutoff: { ...data.utilities.waterCutoff, instructions },
              },
            })
          }
        />

        <UtilityBlock
          icon={<Flame className="size-5" aria-hidden />}
          title="Chiusura gas"
          location={data.utilities.gasCutoff.location}
          instructions={data.utilities.gasCutoff.instructions}
          onLocation={(location) =>
            update({
              utilities: {
                ...data.utilities,
                gasCutoff: { ...data.utilities.gasCutoff, location },
              },
            })
          }
          onInstructions={(instructions) =>
            update({
              utilities: {
                ...data.utilities,
                gasCutoff: { ...data.utilities.gasCutoff, instructions },
              },
            })
          }
        />

        <div className="rounded-lg border-2 border-zinc-900 bg-amber-50 p-4">
          <div className="mb-3 flex items-center gap-2 font-bold text-zinc-950">
            <Zap className="size-5" aria-hidden />
            Quadro elettrico
          </div>
          <FieldLabel>Posizione interruttori</FieldLabel>
          <TouchInput
            value={data.utilities.electricPanel.breakerLocation}
            onChange={(e) =>
              update({
                utilities: {
                  ...data.utilities,
                  electricPanel: {
                    ...data.utilities.electricPanel,
                    breakerLocation: e.target.value,
                  },
                },
              })
            }
            placeholder="Es. Ripostiglio ingresso, alto a sinistra"
          />
          <div className="mt-3">
            <FieldLabel>Contatore esterno</FieldLabel>
            <TouchInput
              value={data.utilities.electricPanel.externalMeterLocation}
              onChange={(e) =>
                update({
                  utilities: {
                    ...data.utilities,
                    electricPanel: {
                      ...data.utilities.electricPanel,
                      externalMeterLocation: e.target.value,
                    },
                  },
                })
              }
              placeholder="Es. Nicchia vano scale piano terra"
            />
          </div>
        </div>

        <div className="rounded-lg border-2 border-zinc-900 bg-amber-50 p-4">
          <div className="mb-3 flex items-center gap-2 font-bold text-zinc-950">
            <Thermometer className="size-5" aria-hidden />
            Caldaia / riscaldamento
          </div>
          <FieldLabel>Posizione</FieldLabel>
          <TouchInput
            value={data.utilities.heatingBoiler.location}
            onChange={(e) =>
              update({
                utilities: {
                  ...data.utilities,
                  heatingBoiler: {
                    ...data.utilities.heatingBoiler,
                    location: e.target.value,
                  },
                },
              })
            }
            placeholder="Es. Balcone servizio"
          />
          <div className="mt-3">
            <FieldLabel>Note</FieldLabel>
            <TouchTextarea
              value={data.utilities.heatingBoiler.notes ?? ''}
              onChange={(e) =>
                update({
                  utilities: {
                    ...data.utilities,
                    heatingBoiler: {
                      ...data.utilities.heatingBoiler,
                      notes: e.target.value,
                    },
                  },
                })
              }
              placeholder="Es. Reset: tenere premuto il pulsante rosso 5 secondi"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border-2 border-zinc-900 bg-sky-50 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-zinc-950">
          <Wifi className="size-6" aria-hidden />
          Wi‑Fi
        </h3>
        <FieldLabel htmlFor="wifi-ssid">Nome rete (SSID)</FieldLabel>
        <TouchInput
          id="wifi-ssid"
          value={data.wifi.ssid}
          onChange={(e) =>
            update({ wifi: { ...data.wifi, ssid: e.target.value } })
          }
          autoComplete="off"
        />
        <div className="mt-3">
          <FieldLabel htmlFor="wifi-password">Password</FieldLabel>
          <TouchInput
            id="wifi-password"
            value={data.wifi.password}
            onChange={(e) =>
              update({ wifi: { ...data.wifi, password: e.target.value } })
            }
            autoComplete="off"
          />
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-950">
            <Recycle className="size-6" aria-hidden />
            Raccolta rifiuti
          </h3>
          <button
            type="button"
            className="inline-flex min-h-12 min-w-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold text-zinc-950 hover:bg-zinc-100"
            onClick={() =>
              update({
                wasteSchedule: [
                  ...data.wasteSchedule,
                  { day: 'Lunedì', fractions: [] },
                ],
              })
            }
          >
            <Plus className="size-5" aria-hidden />
            Aggiungi giorno
          </button>
        </div>
        <ul className="space-y-3">
          {data.wasteSchedule.map((entry, index) => (
            <li
              key={`waste-${index}`}
              className="flex flex-col gap-3 rounded-lg border-2 border-zinc-900 bg-lime-50 p-4 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <FieldLabel>Giorno</FieldLabel>
                <TouchSelect
                  value={entry.day}
                  onChange={(e) => {
                    const wasteSchedule = data.wasteSchedule.map((row, i) =>
                      i === index ? { ...row, day: e.target.value } : row
                    );
                    update({ wasteSchedule });
                  }}
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </TouchSelect>
              </div>
              <div className="flex-[2]">
                <FieldLabel>Frazioni (separate da virgola)</FieldLabel>
                <TouchInput
                  value={entry.fractions.join(', ')}
                  onChange={(e) => {
                    const fractions = e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const wasteSchedule = data.wasteSchedule.map((row, i) =>
                      i === index ? { ...row, fractions } : row
                    );
                    update({ wasteSchedule });
                  }}
                  placeholder="Es. Umido, Plastica"
                />
              </div>
              <button
                type="button"
                aria-label="Rimuovi giorno rifiuti"
                className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-red-800 bg-red-50 text-red-900"
                onClick={() =>
                  update({
                    wasteSchedule: data.wasteSchedule.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 className="size-5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-950">
            <Wrench className="size-6" aria-hidden />
            Artigiani di fiducia
          </h3>
          <button
            type="button"
            className="inline-flex min-h-12 min-w-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold text-zinc-950 hover:bg-zinc-100"
            onClick={() =>
              update({
                artisanContacts: [
                  ...data.artisanContacts,
                  { trade: '', name: '', phone: '' },
                ],
              })
            }
          >
            <Plus className="size-5" aria-hidden />
            Aggiungi contatto
          </button>
        </div>
        <ul className="space-y-3">
          {data.artisanContacts.map((contact, index) => (
            <li
              key={`artisan-${index}`}
              className="grid gap-3 rounded-lg border-2 border-zinc-900 bg-orange-50 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <div>
                <FieldLabel>Mestiere</FieldLabel>
                <TouchInput
                  value={contact.trade}
                  onChange={(e) => {
                    const artisanContacts = data.artisanContacts.map((row, i) =>
                      i === index ? { ...row, trade: e.target.value } : row
                    );
                    update({ artisanContacts });
                  }}
                  placeholder="Idraulico"
                />
              </div>
              <div>
                <FieldLabel>Nome</FieldLabel>
                <TouchInput
                  value={contact.name}
                  onChange={(e) => {
                    const artisanContacts = data.artisanContacts.map((row, i) =>
                      i === index ? { ...row, name: e.target.value } : row
                    );
                    update({ artisanContacts });
                  }}
                />
              </div>
              <div>
                <FieldLabel>Telefono</FieldLabel>
                <TouchInput
                  type="tel"
                  value={contact.phone}
                  onChange={(e) => {
                    const artisanContacts = data.artisanContacts.map((row, i) =>
                      i === index ? { ...row, phone: e.target.value } : row
                    );
                    update({ artisanContacts });
                  }}
                />
              </div>
              <button
                type="button"
                aria-label="Rimuovi artigiano"
                className="inline-flex min-h-12 min-w-12 items-center justify-center self-end rounded-md border-2 border-red-800 bg-red-50 text-red-900"
                onClick={() =>
                  update({
                    artisanContacts: data.artisanContacts.filter(
                      (_, i) => i !== index
                    ),
                  })
                }
              >
                <Trash2 className="size-5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <FamilyServicesPanel
        tier={tier}
        value={data.familyServices}
        onChange={(familyServices) => update({ familyServices })}
      />

      <FeatureGate tier={tier} feature="allowCustomFields">
        <CustomFieldsEditor
          title="Campi personalizzati (casa)"
          fields={data.customFields}
          onChange={(customFields) => update({ customFields })}
        />
      </FeatureGate>
    </section>
  );
}

function UtilityBlock({
  icon,
  title,
  location,
  instructions,
  onLocation,
  onInstructions,
}: {
  icon: ReactNode;
  title: string;
  location: string;
  instructions: string;
  onLocation: (value: string) => void;
  onInstructions: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border-2 border-zinc-900 bg-amber-50 p-4">
      <div className="mb-3 flex items-center gap-2 font-bold text-zinc-950">
        {icon}
        {title}
      </div>
      <FieldLabel>Posizione</FieldLabel>
      <TouchInput value={location} onChange={(e) => onLocation(e.target.value)} />
      <div className="mt-3">
        <FieldLabel>Istruzioni</FieldLabel>
        <TouchTextarea
          value={instructions}
          onChange={(e) => onInstructions(e.target.value)}
        />
      </div>
    </div>
  );
}
