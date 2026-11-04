import { describe, expect, it } from 'vitest';
import { logoDataUrlSchema, sheetMarkFor } from '../src/branding.js';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const host = {
  displayName: 'Casa Blu',
  color: '#1f4e79',
  welcome: 'Benvenuti in casa',
  logoDataUrl: TINY_PNG,
} as const;

describe('host mark', () => {
  it('accepts a tiny image and rejects anything else', () => {
    expect(logoDataUrlSchema.safeParse(TINY_PNG).success).toBe(true);
    expect(logoDataUrlSchema.safeParse(`${TINY_PNG}extra`).success).toBe(false);
    expect(
      logoDataUrlSchema.safeParse(`data:image/svg+xml;base64,${TINY_PNG.split(',')[1] ?? ''}`).success,
    ).toBe(false);
    expect(logoDataUrlSchema.safeParse(`data:image/png;base64,${'A'.repeat(24_576)}`).success).toBe(false);
  });

  it('keeps the product mark on Free and Basic and withholds it on Advanced', () => {
    expect(sheetMarkFor('free', host)).toEqual({ kind: 'product' });
    expect(sheetMarkFor('basic', host)).toEqual({ kind: 'product' });
    expect(sheetMarkFor('advanced', host)).toEqual({ kind: 'none' });
    expect(sheetMarkFor('premium', null)).toEqual({ kind: 'none' });
    expect(sheetMarkFor('premium', host)).toEqual({ kind: 'host', ...host });
  });
});
