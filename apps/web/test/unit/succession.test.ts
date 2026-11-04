import type { SuccessionItem } from '@domusafe/contracts';
import { describe, expect, it } from 'vitest';
import {
  hasLongDigitRun,
  inheritanceKitLines,
  standardsMissing,
  successionTitle,
} from '../../src/features/succession/model.js';

function item(patch: Partial<SuccessionItem> & Pick<SuccessionItem, 'kind'>): SuccessionItem {
  return {
    id: '01900000-0000-7000-8000-0000000000aa',
    familyId: '01900000-0000-7000-8000-0000000000bb',
    title: null,
    notes: null,
    deadlineNote: null,
    done: false,
    completedAt: null,
    sortOrder: 0,
    version: 1,
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...patch,
  };
}

describe('inheritance kit', () => {
  it('prints only the checklist text', () => {
    const lines = inheritanceKitLines([
      item({
        kind: 'declaration',
        notes: 'Il notaio ha la copia',
        deadlineNote: 'Entro dodici mesi',
        done: true,
      }),
      item({
        id: '01900000-0000-7000-8000-0000000000cc',
        kind: 'custom',
        title: 'Avvisare la banca',
        sortOrder: 6,
      }),
    ]);
    expect(lines).toEqual([
      {
        title: 'Dichiarazione di successione entro dodici mesi',
        notes: 'Il notaio ha la copia',
        deadlineNote: 'Entro dodici mesi',
        done: true,
      },
      {
        title: 'Avvisare la banca',
        notes: null,
        deadlineNote: null,
        done: false,
      },
    ]);
    expect(lines.every((line) => Object.keys(line).sort().join() === 'deadlineNote,done,notes,title')).toBe(
      true,
    );
  });

  it('uses a saved title and notices a missing standard activity', () => {
    const will = item({ kind: 'will', title: 'Testamento olografo nel cassetto' });
    expect(successionTitle(will)).toBe('Testamento olografo nel cassetto');
    expect(standardsMissing([will])).toBe(true);
    expect(
      standardsMissing([
        item({ kind: 'documents' }),
        will,
        item({ kind: 'notary', sortOrder: 2 }),
        item({ kind: 'titles', sortOrder: 3 }),
        item({ kind: 'declaration', sortOrder: 4 }),
        item({ kind: 'utility_transfers', sortOrder: 5 }),
      ]),
    ).toBe(false);
  });

  it('rejects a run of eight digits so an account number cannot be saved', () => {
    expect(hasLongDigitRun('Conto 12345678')).toBe(true);
    expect(hasLongDigitRun('ultime quattro 1234')).toBe(false);
  });
});
