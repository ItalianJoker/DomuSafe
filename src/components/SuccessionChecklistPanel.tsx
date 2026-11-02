'use client';

/**
 * Checklist successione — family-scoped, contesto patrimonio / L3.
 * Gate Premium (+ trial) nel parent via allowSuccessionChecklist.
 * Campi personalizzati: allowCustomFields (Premium).
 */

import { ScrollText } from 'lucide-react';
import type { LicenseTier } from '@/types/domus';
import type { SuccessionChecklist } from '@/types/checklists';
import { FieldLabel, TouchInput } from '@/components/TouchField';
import { CustomFieldsEditor } from '@/components/CustomFieldsEditor';
import { FeatureGate } from '@/components/FeatureGate';

const CATEGORY_LABELS: Record<
  SuccessionChecklist['items'][number]['category'],
  string
> = {
  DOCS: 'Documenti',
  CONTACTS: 'Contatti',
  WILL: 'Testamento',
  BANK: 'Banche',
  INSURANCE: 'Assicurazioni',
  DIGITAL: 'Digitale',
  DEADLINE: 'Scadenze',
};

interface SuccessionChecklistPanelProps {
  tier: LicenseTier;
  checklist: SuccessionChecklist;
  onChange: (next: SuccessionChecklist) => void;
  familyName?: string;
}

export function SuccessionChecklistPanel({
  tier,
  checklist,
  onChange,
  familyName,
}: SuccessionChecklistPanelProps) {
  const toggle = (id: string, done: boolean) => {
    onChange({
      ...checklist,
      items: checklist.items.map((item) =>
        item.id === id ? { ...item, done } : item
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  const setNote = (id: string, note: string) => {
    onChange({
      ...checklist,
      items: checklist.items.map((item) =>
        item.id === id ? { ...item, note } : item
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <section
      aria-labelledby="succession-title"
      className="rounded-lg border-2 border-zinc-900 bg-[#f7f3ea] p-4"
    >
      <h3
        id="succession-title"
        className="flex items-center gap-2 font-display text-lg font-black text-[var(--brand-ink)]"
      >
        <ScrollText className="size-6" aria-hidden />
        Checklist successione
        {familyName ? ` · ${familyName}` : ''}
      </h3>
      <p className="mt-1 text-sm text-zinc-700">
        Attività per l’intera Famiglia (non per singolo residente), accanto alla
        cassaforte patrimoniale. Dati cifrati a riposo.
      </p>

      <ul className="mt-4 space-y-3">
        {checklist.items.map((item) => (
          <li
            key={item.id}
            className="rounded-md border-2 border-zinc-800 bg-white p-3"
          >
            <label className="flex min-h-12 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-6 accent-[var(--brand-ink)]"
                checked={item.done}
                onChange={(e) => toggle(item.id, e.target.checked)}
              />
              <span>
                <span className="block text-xs font-bold uppercase tracking-wide text-[var(--brand-forest)]">
                  {CATEGORY_LABELS[item.category]}
                </span>
                <span className="block font-bold text-zinc-950">
                  {item.label}
                </span>
                {item.deadlineHint ? (
                  <span className="block text-xs text-zinc-600">
                    {item.deadlineHint}
                  </span>
                ) : null}
              </span>
            </label>
            <div className="mt-2">
              <FieldLabel>Nota</FieldLabel>
              <TouchInput
                value={item.note ?? ''}
                placeholder="Riferimenti, dove sono i documenti…"
                onChange={(e) => setNote(item.id, e.target.value)}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <FeatureGate tier={tier} feature="allowCustomFields">
          <CustomFieldsEditor
            title="Campi personalizzati (successione)"
            fields={checklist.customFields}
            onChange={(customFields) =>
              onChange({
                ...checklist,
                customFields,
                updatedAt: new Date().toISOString(),
              })
            }
          />
        </FeatureGate>
      </div>
    </section>
  );
}
