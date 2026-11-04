import type { DeadlineItem } from '@domusafe/contracts';
import { describe, expect, it } from 'vitest';
import { deadlineKey, deadlineLabel } from '../../src/features/home/model.js';

function item(patch: Partial<DeadlineItem> & Pick<DeadlineItem, 'kind'>): DeadlineItem {
  return {
    sourceId: '01900000-0000-7000-8000-0000000000aa',
    dueDate: '2026-11-04',
    title: null,
    detail: null,
    taxItemKey: null,
    successionKind: null,
    version: null,
    houseId: null,
    ...patch,
  };
}

describe('deadline labels', () => {
  it('keeps a stored title and names the other dates in full', () => {
    expect(deadlineLabel(item({ kind: 'maintenance', title: 'Controllo caldaia' }))).toBe(
      'Controllo caldaia',
    );
    expect(deadlineLabel(item({ kind: 'vehicle_insurance', detail: 'AB 123 CD' }))).toBe(
      'Assicurazione · AB 123 CD',
    );
    expect(deadlineLabel(item({ kind: 'vehicle_road_tax', detail: 'AB 123 CD' }))).toBe(
      'Tassa di circolazione · AB 123 CD',
    );
    expect(deadlineLabel(item({ kind: 'tax', taxItemKey: 'isee', detail: '2026' }))).toBe(
      'Indicatore della situazione economica equivalente · 2026',
    );
    expect(deadlineLabel(item({ kind: 'succession', successionKind: 'declaration', title: null }))).toBe(
      'Dichiarazione di successione entro dodici mesi',
    );
    expect(deadlineKey(item({ kind: 'vehicle_insurance' }))).not.toBe(
      deadlineKey(item({ kind: 'vehicle_road_tax' })),
    );
  });
});
