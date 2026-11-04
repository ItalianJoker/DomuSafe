import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TAX_ITEM_KEYS } from '@domusafe/contracts';
import { personaleTabs, taxLabel } from '../../src/features/personale/model.js';

describe('personale tabs', () => {
  it('keeps the rescue card for members and hides it from a guest', () => {
    expect(personaleTabs('admin')).toEqual(['card', 'services', 'pets', 'taxes', 'accounts']);
    expect(personaleTabs('child')).toEqual(['card', 'services', 'pets', 'taxes', 'accounts']);
    expect(personaleTabs('guest')).toEqual([]);
  });
});

describe('tax labels', () => {
  it('writes every Italian tax item in full words', () => {
    const text = readFileSync(resolve(import.meta.dirname, '../../messages/it.json'), 'utf8');
    const messages = JSON.parse(text) as Record<string, string>;
    expect(messages.taxIsee).toBe('Indicatore della situazione economica equivalente');
    for (const key of TAX_ITEM_KEYS) {
      expect(taxLabel(key).length).toBeGreaterThan(8);
    }
    const banned = /\b(?:ISEE|IMU|TARI|IRPEF|CU)\b/u;
    for (const key of [
      'taxDeclaration',
      'taxPrecompiled',
      'taxIsee',
      'taxProperty',
      'taxWaste',
      'taxIncomeFirst',
      'taxIncomeSecond',
    ]) {
      expect(messages[key], key).not.toMatch(banned);
    }
  });
});
