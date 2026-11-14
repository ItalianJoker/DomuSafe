import { describe, expect, it } from 'vitest';
import { formatCsvAmount, formatCsvDate, recordsToCsv } from '../../src/features/account/export-csv.js';

describe('export csv', () => {
  it('formats Italian dates and amounts', () => {
    expect(formatCsvDate('2026-12-01')).toBe('01/12/2026');
    expect(formatCsvAmount(12345, 'EUR')).toBe('123,45 EUR');
  });

  it('builds a BOM CSV with semicolon separators and sealed flags', () => {
    const csv = recordsToCsv('residents', [
      {
        module: 'residents',
        table: 'residents',
        id: '01900000-0000-7000-8000-000000000001',
        version: 1,
        data: {
          displayName: 'Luca; prova',
          birthYear: 1990,
          sealed: { scopeId: 'x', keyVersion: 1, dek: 'aa', payload: 'bb' },
        },
      },
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('tabella;id;versione;displayName;birthYear;busta_cifrata');
    expect(csv).toContain('"Luca; prova"');
    expect(csv).toContain(';sì');
    expect(csv).not.toContain('payload');
  });
});
