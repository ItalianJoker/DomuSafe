'use client';

/**
 * Campi personalizzati Premium — oltre allo schema standard (L1/L2/L3).
 * Free/Basic/Advanced non montano questo editor (FeatureGate allowCustomFields).
 */

import { ListPlus, Plus, Trash2 } from 'lucide-react';
import type { CustomField } from '@/types/domus';
import { createId } from '@/lib/defaults';
import { FieldLabel, TouchInput } from '@/components/TouchField';

interface CustomFieldsEditorProps {
  fields: CustomField[] | undefined;
  onChange: (fields: CustomField[]) => void;
  /** Titolo sezione (es. «Campi personalizzati casa»). */
  title?: string;
}

export function CustomFieldsEditor({
  fields,
  onChange,
  title = 'Campi personalizzati',
}: CustomFieldsEditorProps) {
  const list = fields ?? [];

  return (
    <section
      aria-label={title}
      className="space-y-3 rounded-md border-2 border-dashed border-[var(--brand-gold)] bg-[var(--brand-cream)]/40 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-bold text-[var(--brand-ink)]">
          <ListPlus className="size-5" aria-hidden />
          {title}
        </h3>
        <button
          type="button"
          className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold hover:bg-zinc-100"
          onClick={() =>
            onChange([
              ...list,
              { id: createId(), label: '', value: '' },
            ])
          }
        >
          <Plus className="size-5" aria-hidden />
          Aggiungi campo
        </button>
      </div>
      <p className="text-xs text-zinc-700">
        Solo piano Premium (o prova): etichette libere oltre ai campi standard.
      </p>
      {list.length === 0 ? (
        <p className="text-sm text-zinc-600">Nessun campo personalizzato.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((field, index) => (
            <li
              key={field.id}
              className="grid gap-3 rounded-md border-2 border-zinc-900 bg-white p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <div>
                <FieldLabel htmlFor={`cf-label-${field.id}`}>
                  Etichetta
                </FieldLabel>
                <TouchInput
                  id={`cf-label-${field.id}`}
                  value={field.label}
                  onChange={(e) => {
                    const next = [...list];
                    next[index] = { ...field, label: e.target.value };
                    onChange(next);
                  }}
                  placeholder="Es. Codice allarme"
                />
              </div>
              <div>
                <FieldLabel htmlFor={`cf-value-${field.id}`}>Valore</FieldLabel>
                <TouchInput
                  id={`cf-value-${field.id}`}
                  value={field.value}
                  onChange={(e) => {
                    const next = [...list];
                    next[index] = { ...field, value: e.target.value };
                    onChange(next);
                  }}
                  placeholder="Testo libero"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  aria-label={`Rimuovi campo ${field.label || index + 1}`}
                  className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-red-800 bg-white text-red-900"
                  onClick={() =>
                    onChange(list.filter((f) => f.id !== field.id))
                  }
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
