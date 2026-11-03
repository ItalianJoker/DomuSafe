'use client';

/**
 * Checklist tasse IT annuale — parte della scheda residente (Livello 2).
 * Note sensibili restano nel runbook cifrato a riposo.
 * Compilazione manuale completa; wizard opzionale.
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Receipt } from 'lucide-react';
import type { ResidentTaxBlock } from '@/types/domus';
import {
  TAX_CATALOG,
  ensureResidentTaxYear,
} from '@/lib/checklist-defaults';
import { FieldLabel, TouchInput } from '@/components/TouchField';

interface ResidentTaxChecklistProps {
  taxChecklist: ResidentTaxBlock | undefined;
  onChange: (next: ResidentTaxBlock) => void;
  year?: number;
}

export function ResidentTaxChecklist({
  taxChecklist,
  onChange,
  year: initialYear = new Date().getFullYear(),
}: ResidentTaxChecklistProps) {
  const [year, setYear] = useState(initialYear);
  const block = ensureResidentTaxYear(taxChecklist, year);
  const yearState = block.years.find((y) => y.year === year)!;

  const switchYear = (nextYear: number) => {
    const ensured = ensureResidentTaxYear(block, nextYear);
    setYear(nextYear);
    if (ensured !== block) {
      onChange(ensured);
    }
  };

  const patchItem = (
    catalogId: string,
    patch: Partial<(typeof yearState.items)[number]>
  ) => {
    const items = yearState.items.map((item) =>
      item.catalogId === catalogId ? { ...item, ...patch } : item
    );
    const years = block.years.map((y) =>
      y.year === year ? { ...y, items } : y
    );
    onChange({
      version: '1.0.0',
      years,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="rounded-md border-2 border-amber-900/40 bg-amber-50/80 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h5 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-amber-950">
          <Receipt className="size-5" aria-hidden />
          Tasse e adempimenti {year}
        </h5>
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            aria-label="Anno precedente"
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-amber-900 bg-white"
            onClick={() => switchYear(year - 1)}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Anno successivo"
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-amber-900 bg-white"
            onClick={() => switchYear(year + 1)}
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-amber-950/80">
        Checklist annuale per questo residente (modello 730, indicatore
        economico, imposta sugli immobili…). Segna «fatto» per anno. Le note
        restano cifrate sul dispositivo.
      </p>
      <ul className="space-y-3">
        {TAX_CATALOG.map((catalog) => {
          const item = yearState.items.find((i) => i.catalogId === catalog.id) ?? {
            catalogId: catalog.id,
            done: false,
          };
          return (
            <li
              key={catalog.id}
              className="rounded-md border border-amber-900/30 bg-white/80 p-3"
            >
              <label className="flex min-h-12 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-6 accent-[var(--brand-forest)]"
                  checked={item.done}
                  onChange={(e) =>
                    patchItem(catalog.id, {
                      done: e.target.checked,
                      doneAt: e.target.checked
                        ? new Date().toISOString()
                        : undefined,
                    })
                  }
                />
                <span>
                  <span className="block font-bold text-zinc-950">
                    {catalog.label}
                  </span>
                  <span className="block text-xs text-zinc-600">
                    {catalog.typicalWindow}
                  </span>
                </span>
              </label>
              <div className="mt-2">
                <FieldLabel>Nota (opzionale)</FieldLabel>
                <TouchInput
                  value={item.note ?? ''}
                  placeholder="Es. CAF, protocollo, importo…"
                  onChange={(e) =>
                    patchItem(catalog.id, { note: e.target.value })
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
