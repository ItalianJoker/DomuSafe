import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Contact, RescueSheet, Shutoff } from '@domusafe/contracts';
import { describe, expect, it } from 'vitest';
import { readingDeviceLabel } from '../../src/features/print/device-label.js';
import {
  currentPublication,
  essentialPeople,
  printedTrades,
  sheetHasWatermark,
  sheetUrl,
  wallBoxes,
} from '../../src/features/print/model.js';

const HOUSE = '019a0000-0000-7000-8000-000000000002';

function shutoff(kind: Shutoff['kind'], location: string): Shutoff {
  return {
    id: `019a0000-0000-7000-8000-0000000000${kind.length.toString(16)}1`,
    familyId: '019a0000-0000-7000-8000-000000000001',
    houseId: HOUSE,
    kind,
    location,
    instructions: '',
    visibleToGuests: true,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function contact(patch: Partial<Contact>): Contact {
  return {
    id: '019a0000-0000-7000-8000-000000000031',
    familyId: '019a0000-0000-7000-8000-000000000001',
    visibility: 'family',
    houseId: HOUSE,
    kind: 'craftsman',
    trade: 'Idraulico',
    displayName: 'Mario Bianchi',
    company: null,
    phone: '+393331112233',
    email: null,
    website: null,
    address: null,
    notes: 'IBAN-IT60X0542811101000000123456',
    rating: null,
    visibleToGuests: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

const sheet: RescueSheet = {
  houseId: HOUSE,
  residents: [
    {
      id: '019a0000-0000-7000-8000-000000000041',
      displayName: 'Ada',
      birthYear: null,
      usualBedroom: 'Camera',
      photo: null,
      bloodGroup: 'a_positive',
      mobility: 'assisted',
      allergies: ['Penicillina'],
      conditions: [],
      devices: [],
      medicines: [
        {
          id: '019a0000-0000-7000-8000-000000000051',
          name: 'Insulina',
          location: 'Frigorifero',
          sortOrder: 0,
        },
      ],
      contacts: [
        {
          id: '019a0000-0000-7000-8000-000000000061',
          displayName: 'Marta',
          phone: '+393339998877',
          relationship: 'Figlia',
          hasKeys: true,
          sortOrder: 0,
        },
      ],
    },
  ],
  pets: [],
};

describe('print sheets', () => {
  it('keeps the mark on Free and Basic and leaves it off Advanced and Premium', () => {
    expect(sheetHasWatermark('free')).toBe(true);
    expect(sheetHasWatermark('basic')).toBe(true);
    expect(sheetHasWatermark('advanced')).toBe(false);
    expect(sheetHasWatermark('premium')).toBe(false);
  });

  it('prints water, gas and power, and drops notes and the boiler', () => {
    expect(wallBoxes([shutoff('boiler', 'Caldaia'), shutoff('water', 'Cortile')])).toEqual([
      { kind: 'water', lines: [{ location: 'Cortile', instructions: '' }] },
      { kind: 'gas', lines: [] },
      { kind: 'electricity', lines: [] },
    ]);
    const trades = printedTrades(
      [contact({}), contact({ id: '019a0000-0000-7000-8000-000000000032', kind: 'doctor' })],
      HOUSE,
    );
    expect(trades).toEqual([
      {
        id: '019a0000-0000-7000-8000-000000000031',
        displayName: 'Mario Bianchi',
        trade: 'Idraulico',
        phone: '+393331112233',
      },
    ]);
    expect(JSON.stringify(trades)).not.toContain('IBAN');
    expect(essentialPeople(sheet)[0]?.medicines).toEqual([
      { id: '019a0000-0000-7000-8000-000000000051', name: 'Insulina', location: 'Frigorifero' },
    ]);
  });

  it('builds the public addresses and prefers the active code', () => {
    expect(sheetUrl('https://example.test', '/e/aaaaaaaaaaaaaaaaaaaaaa')).toBe(
      'https://example.test/e/aaaaaaaaaaaaaaaaaaaaaa',
    );
    const active = {
      id: '019a0000-0000-7000-8000-000000000071',
      familyId: '019a0000-0000-7000-8000-000000000001',
      houseId: HOUSE,
      kind: 'rescue_sheet' as const,
      token: 'bbbbbbbbbbbbbbbbbbbbbb',
      revokedAt: null,
      lastScannedAt: null,
      scanCount: 0,
      version: 1,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const revoked = {
      ...active,
      id: '019a0000-0000-7000-8000-000000000072',
      token: null,
      revokedAt: active.createdAt,
    };
    expect(currentPublication([revoked, active], 'rescue_sheet')?.token).toBe(active.token);
  });

  it('writes the Italian print copy without abbreviations', () => {
    const text = readFileSync(resolve(import.meta.dirname, '../../messages/it.json'), 'utf8');
    const messages = JSON.parse(text) as Record<string, string>;
    const banned = /\b(?:QR|A4|A5|ICE|IBAN|PIN)\b/u;
    for (const key of Object.keys(messages)) {
      if (key.startsWith('print') || key.startsWith('public') || key.startsWith('readings')) {
        expect(messages[key], key).not.toMatch(banned);
      }
    }
  });
});

describe('device label', () => {
  it('sends a short label and nothing when the browser string is empty', () => {
    expect(readingDeviceLabel({ userAgent: '   ', maxTouchPoints: 0 })).toBeNull();
    expect(
      readingDeviceLabel({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        maxTouchPoints: 5,
      }),
    ).toBe('Telefono');
    expect(
      readingDeviceLabel({
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
        maxTouchPoints: 5,
      }),
    ).toBe('Tablet');
    expect(
      readingDeviceLabel({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        maxTouchPoints: 0,
      }),
    ).toBe('Computer');
    expect(
      readingDeviceLabel({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        maxTouchPoints: 5,
      }),
    ).toBe('Tablet');
    expect(
      readingDeviceLabel({
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel) Mobile',
        maxTouchPoints: 5,
      }),
    ).toBe('Telefono');
    expect(
      readingDeviceLabel({
        userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-T870)',
        maxTouchPoints: 5,
      }),
    ).toBe('Tablet');
  });
});
