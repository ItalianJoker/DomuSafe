'use client';

/**
 * Selettore multi-casa — Livello 1 aggregato.
 * BASIC: 1 abitazione (pulsante aggiungi disabilitato).
 * ADVANCED: fino a 3; PREMIUM: illimitate.
 */

import { Home, Plus, Trash2 } from 'lucide-react';
import type { DomusRunbookDocument, LicenseTier } from '@/types/domus';
import { canAddHouse, getMaxHouses } from '@/lib/licensing';

interface HouseSwitcherProps {
  tier: LicenseTier;
  houses: DomusRunbookDocument[];
  activeDocumentId: string;
  onSwitch: (documentId: string) => void;
  onAdd: () => void;
  onRemove: (documentId: string) => void;
}

export function HouseSwitcher({
  tier,
  houses,
  activeDocumentId,
  onSwitch,
  onAdd,
  onRemove,
}: HouseSwitcherProps) {
  const maxHouses = getMaxHouses(tier);
  const canAdd = canAddHouse(tier, houses.length);
  const maxLabel = Number.isFinite(maxHouses) ? String(maxHouses) : 'illimitate';

  return (
    <section
      aria-labelledby="houses-title"
      className="no-print rounded-lg border-2 border-zinc-900 bg-white/90 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="houses-title"
            className="flex items-center gap-2 text-lg font-black text-zinc-950"
          >
            <Home className="size-5" aria-hidden />
            Abitazioni
          </h2>
          <p className="mt-1 text-sm text-zinc-700">
            Piano {tier}: massimo {maxLabel} (
            {houses.length} attive).
          </p>
        </div>
        <button
          type="button"
          disabled={!canAdd}
          className="inline-flex min-h-12 min-w-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold enabled:hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onAdd}
        >
          <Plus className="size-5" aria-hidden />
          Aggiungi casa
        </button>
      </div>

      <ul className="mt-4 flex flex-wrap gap-2">
        {houses.map((house, index) => {
          const active = house.documentId === activeDocumentId;
          const label =
            house.level1_public.houseName.trim() || `Casa ${index + 1}`;
          return (
            <li key={house.documentId} className="flex items-center gap-1">
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                className={`inline-flex min-h-12 items-center rounded-md border-2 px-4 font-bold ${
                  active
                    ? 'border-emerald-900 bg-emerald-700 text-white'
                    : 'border-zinc-900 bg-white text-zinc-950 hover:bg-zinc-100'
                }`}
                onClick={() => onSwitch(house.documentId)}
              >
                {label}
              </button>
              {houses.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Rimuovi ${label}`}
                  className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-red-800 bg-white text-red-900 hover:bg-red-50"
                  onClick={() => onRemove(house.documentId)}
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {!canAdd && (tier === 'FREE' || tier === 'BASIC') ? (
        <p className="mt-3 text-sm font-semibold text-zinc-700">
          Con Free e Basic puoi gestire una sola abitazione. Advanced ne
          consente fino a tre; Premium non ha questo limite.
        </p>
      ) : null}
    </section>
  );
}
