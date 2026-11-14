import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { UtilityTemplate } from '@domusafe/contracts';
import { extractBillFields, parseAmountMinor, parseBillDate } from '../../src/features/casa/bill-extract.js';

const template = {
  id: '01900000-0000-7000-8000-00000000e901',
  familyId: null,
  country: 'IT',
  kind: 'electricity',
  providerName: 'Generico luce',
  fieldHints: { customerCode: 'Codice cliente', supplyPointCode: 'Punto di prelievo' },
  recognitionPatterns: {
    customerCode: ['(?i)codice\\s*cliente[:\\s]+([A-Z0-9/-]{4,40})'],
    supplyPointCode: ['(?i)\\b(IT\\d{3}E\\d{8})\\b'],
    amount: [
      '(?i)(?:totale\\s*da\\s*pagare|importo)[:\\s]*€?\\s*([0-9]{1,3}(?:[.\\s][0-9]{3})*[.,][0-9]{2})',
    ],
    dueDate: ['(?i)scadenza[:\\s]*([0-3]?\\d[/.-][01]?\\d[/.-](?:20)?\\d{2})'],
    iban: ['\\b(IT\\d{2}[A-Z]\\d{10,30})\\b'],
  },
  active: true,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} satisfies UtilityTemplate;

describe('bill extract', () => {
  it('parses Italian amounts and dates', () => {
    expect(parseAmountMinor('123,45')).toBe(12345);
    expect(parseAmountMinor('1.234,56')).toBe(123456);
    expect(parseBillDate('15/03/2026')).toBe('2026-03-15');
    expect(parseBillDate('3-7-26')).toBe('2026-07-03');
  });

  it('extracts structured fields from pasted bill text', () => {
    const text = `
      Enel Energia
      Codice cliente: AB12-998877
      POD IT001E12345678
      Totale da pagare: € 87,30
      Scadenza: 28/04/2026
      IBAN IT60X0542811101000000123456
    `;
    const result = extractBillFields(text, [template], 'electricity');
    expect(result.matchedFields).toEqual(
      expect.arrayContaining(['customerCode', 'supplyPointCode', 'amount', 'dueDate', 'iban']),
    );
    expect(result.extracted.customerCode).toBe('AB12-998877');
    expect(result.extracted.supplyPointCode).toBe('IT001E12345678');
    expect(result.extracted.amountMinor).toBe(8730);
    expect(result.extracted.dueDate).toBe('2026-04-28');
    expect(result.extracted.iban).toBe('IT60X0542811101000000123456');
    expect(result.template?.id).toBe(template.id);
  });

  it('keeps bill OCR out of the utilities panel shell import', () => {
    const root = resolve(import.meta.dirname, '../..');
    const panel = readFileSync(resolve(root, 'src/features/casa/utilities-panel.tsx'), 'utf8');
    const casa = readFileSync(resolve(root, 'src/features/casa/casa-page.tsx'), 'utf8');
    expect(panel).toMatch(
      /lazy\(async \(\) => \{\s*const module = await import\('\.\/bill-assist-panel\.js'\)/,
    );
    expect(panel).not.toMatch(/from '\.\/bill-ocr/);
    expect(panel).not.toMatch(/tesseract/);
    expect(casa).not.toMatch(/bill-assist|bill-ocr|tesseract/);
    const assist = readFileSync(resolve(root, 'src/features/casa/bill-assist-panel.tsx'), 'utf8');
    expect(assist).toMatch(/import\('\.\/bill-ocr\.js'\)/);
    expect(assist).not.toMatch(/from 'tesseract\.js'|from \"tesseract\.js\"/);
  });
});
