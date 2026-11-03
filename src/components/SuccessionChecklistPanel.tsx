'use client';

/**
 * Checklist successione — family-scoped, contesto patrimonio / L3.
 * Gate Premium (+ trial) nel parent via allowSuccessionChecklist.
 * Campi personalizzati: allowCustomFields (Premium).
 * Ogni voce è modificabile a mano (etichetta, categoria, scadenza, fatto, nota);
 * si possono aggiungere e rimuovere voci senza wizard.
 */

import { Plus, ScrollText, Trash2 } from 'lucide-react';
import type { LicenseTier } from '@/types/domus';
import type {
  SuccessionCategory,
  SuccessionChecklist,
} from '@/types/checklists';
import { createId } from '@/lib/defaults';
import { FieldLabel, TouchInput, TouchSelect } from '@/components/TouchField';
import { CustomFieldsEditor } from '@/components/CustomFieldsEditor';
import { FeatureGate } from '@/components/FeatureGate';

const CATEGORY_LABELS: Record<SuccessionCategory, string> = {
  DOCS: 'Documenti',
  CONTACTS: 'Contatti',
  WILL: 'Testamento',
  BANK: 'Banche',
  INSURANCE: 'Assicurazioni',
  DIGITAL: 'Digitale',
  DEADLINE: 'Scadenze',
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as SuccessionCategory[];

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
  const stamp = (items: SuccessionChecklist['items']) => ({
    ...checklist,
    items,
    updatedAt: new Date().toISOString(),
  });

  const patchItem = (
    id: string,
    patch: Partial<SuccessionChecklist['items'][number]>
  ) => {
    onChange(
      stamp(
        checklist.items.map((item) =>
          item.id === id ? { ...item, ...patch } : item
        )
      )
    );
  };

  const addItem = () => {
    onChange(
      stamp([
        ...checklist.items,
        {
          id: createId(),
          category: 'DOCS',
          label: '',
          done: false,
          deadlineHint: '',
        },
      ])
    );
  };

  const removeItem = (id: string) => {
    onChange(stamp(checklist.items.filter((item) => item.id !== id)));
  };

  return (
    <section
      aria-labelledby="succession-title"
      className="rounded-lg border-2 border-zinc-900 bg-[#f7f3ea] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="succession-title"
            className="flex items-center gap-2 font-display text-lg font-black text-[var(--brand-ink)]"
          >
            <ScrollText className="size-6" aria-hidden />
            Checklist successione
            {familyName ? ` · ${familyName}` : ''}
          </h3>
          <p className="mt-1 text-sm text-zinc-700">
            Attività per l’intera Famiglia (non per singolo residente), accanto
            alla cassaforte patrimoniale. Ogni voce si modifica a mano; la guida
            rapida non è richiesta.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold hover:bg-zinc-100"
          onClick={addItem}
        >
          <Plus className="size-5" aria-hidden />
          Aggiungi voce
        </button>
      </div>

      <ul className="mt-4 space-y-3">
        {checklist.items.length === 0 ? (
          <li className="rounded-md border-2 border-dashed border-zinc-400 bg-white/70 p-4 text-sm font-semibold text-zinc-700">
            Nessuna voce. Aggiungi la prima attività della successione Famiglia.
          </li>
        ) : (
          checklist.items.map((item) => (
            <li
              key={item.id}
              className="space-y-3 rounded-md border-2 border-zinc-800 bg-white p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <label className="flex min-h-12 cursor-pointer items-center gap-3 font-bold text-zinc-950">
                  <input
                    type="checkbox"
                    className="size-6 accent-[var(--brand-ink)]"
                    checked={item.done}
                    onChange={(e) =>
                      patchItem(item.id, { done: e.target.checked })
                    }
                  />
                  Segna come fatto
                </label>
                <button
                  type="button"
                  aria-label={`Rimuovi voce ${item.label || 'senza titolo'}`}
                  className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-red-800 bg-white text-red-900"
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>Categoria</FieldLabel>
                  <TouchSelect
                    value={item.category}
                    onChange={(e) =>
                      patchItem(item.id, {
                        category: e.target.value as SuccessionCategory,
                      })
                    }
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </TouchSelect>
                </div>
                <div>
                  <FieldLabel>Scadenza o promemoria (opzionale)</FieldLabel>
                  <TouchInput
                    value={item.deadlineHint ?? ''}
                    placeholder="Es. entro 12 mesi dal decesso"
                    onChange={(e) =>
                      patchItem(item.id, { deadlineHint: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Attività</FieldLabel>
                  <TouchInput
                    value={item.label}
                    placeholder="Cosa va fatto…"
                    onChange={(e) =>
                      patchItem(item.id, { label: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Nota</FieldLabel>
                  <TouchInput
                    value={item.note ?? ''}
                    placeholder="Riferimenti, dove sono i documenti…"
                    onChange={(e) =>
                      patchItem(item.id, { note: e.target.value })
                    }
                  />
                </div>
              </div>
            </li>
          ))
        )}
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
