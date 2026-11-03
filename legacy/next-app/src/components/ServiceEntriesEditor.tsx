'use client';

/**
 * Editor elenco servizi (utenze / abbonamenti / scadenze) da catalogo standard.
 * Premium: può aggiungere voci personalizzate (catalogId custom-*).
 */

import { Plus, Trash2 } from 'lucide-react';
import type { ServiceEntry } from '@/types/domus';
import {
  addCustomServiceEntry,
  catalogLabel,
  type ServiceCatalogItem,
} from '@/lib/service-catalog';
import { FieldLabel, TouchInput } from '@/components/TouchField';

interface ServiceEntriesEditorProps {
  title: string;
  description?: string;
  catalog: readonly ServiceCatalogItem[];
  entries: ServiceEntry[];
  onChange: (next: ServiceEntry[]) => void;
  allowCustom: boolean;
  /** Mostra campo telefono gestore. */
  showPhone?: boolean;
}

export function ServiceEntriesEditor({
  title,
  description,
  catalog,
  entries,
  onChange,
  allowCustom,
  showPhone = true,
}: ServiceEntriesEditorProps) {
  const patch = (index: number, patchFields: Partial<ServiceEntry>) => {
    const next = [...entries];
    const current = next[index];
    if (!current) return;
    next[index] = { ...current, ...patchFields };
    onChange(next);
  };

  const removeCustom = (index: number) => {
    const entry = entries[index];
    if (!entry?.catalogId.startsWith('custom-')) return;
    onChange(entries.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-base font-bold text-zinc-950">{title}</h4>
          {description ? (
            <p className="text-xs text-zinc-600">{description}</p>
          ) : null}
        </div>
        {allowCustom ? (
          <button
            type="button"
            className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold hover:bg-zinc-100"
            onClick={() =>
              onChange(addCustomServiceEntry(entries, 'Servizio personalizzato'))
            }
          >
            <Plus className="size-5" aria-hidden />
            Aggiungi personalizzato
          </button>
        ) : null}
      </div>

      <ul className="space-y-3">
        {entries.map((entry, index) => {
          const isCustom = entry.catalogId.startsWith('custom-');
          const label = isCustom
            ? entry.provider || 'Servizio personalizzato'
            : catalogLabel(catalog, entry.catalogId);
          const hint = catalog.find((c) => c.id === entry.catalogId)?.hint;

          return (
            <li
              key={entry.catalogId}
              className="space-y-3 rounded-md border-2 border-zinc-800 bg-white p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-zinc-950">{label}</p>
                  {hint && !isCustom ? (
                    <p className="text-xs text-zinc-600">{hint}</p>
                  ) : null}
                </div>
                {isCustom && allowCustom ? (
                  <button
                    type="button"
                    aria-label={`Rimuovi ${label}`}
                    className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-red-800 bg-white text-red-900"
                    onClick={() => removeCustom(index)}
                  >
                    <Trash2 className="size-5" aria-hidden />
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {isCustom ? (
                  <div className="sm:col-span-2">
                    <FieldLabel>Nome servizio</FieldLabel>
                    <TouchInput
                      value={entry.provider ?? ''}
                      placeholder="Es. Abbonamento palestra famiglia"
                      onChange={(e) =>
                        patch(index, { provider: e.target.value })
                      }
                    />
                  </div>
                ) : (
                  <div>
                    <FieldLabel>Gestore / compagnia</FieldLabel>
                    <TouchInput
                      value={entry.provider ?? ''}
                      placeholder="Es. Enel, TIM…"
                      onChange={(e) =>
                        patch(index, { provider: e.target.value })
                      }
                    />
                  </div>
                )}
                <div>
                  <FieldLabel>Codice / riferimento</FieldLabel>
                  <TouchInput
                    value={entry.customerCode ?? ''}
                    placeholder={
                      hint ?? 'Codice cliente, codice fornitura, targa…'
                    }
                    onChange={(e) =>
                      patch(index, { customerCode: e.target.value })
                    }
                  />
                </div>
                {showPhone ? (
                  <div>
                    <FieldLabel>Telefono assistenza</FieldLabel>
                    <TouchInput
                      value={entry.phone ?? ''}
                      inputMode="tel"
                      placeholder="Numero utile"
                      onChange={(e) => patch(index, { phone: e.target.value })}
                    />
                  </div>
                ) : null}
                <div>
                  <FieldLabel>Scadenza / rinnovo</FieldLabel>
                  <TouchInput
                    type="date"
                    value={entry.renewalDate ?? ''}
                    onChange={(e) =>
                      patch(index, { renewalDate: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Note</FieldLabel>
                  <TouchInput
                    value={entry.notes ?? ''}
                    placeholder="Dove sono i contratti, importo orientativo…"
                    onChange={(e) => patch(index, { notes: e.target.value })}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
