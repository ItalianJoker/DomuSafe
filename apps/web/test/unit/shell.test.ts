import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buttonVariants } from '../../src/components/ui/button.js';
import { pickFamilyId, pickHouseId } from '../../src/lib/entry.js';
import { validateFamily, validateHouse, validateSignUp } from '../../src/lib/fields.js';
import { NAV_LINKS, SECTIONS, sectionFromPath, shellPath } from '../../src/lib/navigation.js';
import { resolvedColorScheme } from '../../src/lib/theme.js';
import type { Me } from '@domusafe/contracts';

const FAMILY = '019a0000-0000-7000-8000-000000000001';
const HOUSE = '019a0000-0000-7000-8000-000000000002';
const OTHER = '019a0000-0000-7000-8000-000000000003';

function me(patch: Partial<Me> = {}): Me {
  return {
    accountId: '019a0000-0000-7000-8000-000000000010',
    email: 'ada@example.test',
    emailVerified: false,
    displayName: 'Ada',
    locale: 'it',
    theme: 'system',
    twoFactorEnabled: false,
    primaryFamilyId: null,
    lastFamilyId: null,
    lastHouseId: null,
    families: [{ id: FAMILY, name: 'Rossi', role: 'admin', plan: 'free', vaultFamily: true }],
    ...patch,
  };
}

describe('navigation', () => {
  it('keeps the eight sections in the product order', () => {
    expect(SECTIONS.map((section) => section.id)).toEqual([
      'cassaforte',
      'famiglia',
      'casa',
      'personale',
      'stampa',
      'extra',
      'guida',
      'account',
    ]);
    expect(NAV_LINKS.map((link) => link.id)).toEqual(['home', ...SECTIONS.map((section) => section.id)]);
  });

  it('keeps the section when the house changes', () => {
    expect(sectionFromPath(`/f/${FAMILY}/c/${HOUSE}/casa`)).toBe('casa');
    expect(shellPath(FAMILY, OTHER, 'casa')).toBe(`/f/${FAMILY}/c/${OTHER}/casa`);
    expect(sectionFromPath(`/f/${FAMILY}/c/${HOUSE}`)).toBe('home');
    expect(sectionFromPath(`/f/${FAMILY}/c/${HOUSE}/famiglia/successione`)).toBe('famiglia');
  });
});

describe('entry', () => {
  it('opens the last family and house when they are still visible', () => {
    const account = me({ lastFamilyId: FAMILY, lastHouseId: HOUSE });
    expect(pickFamilyId(account)).toBe(FAMILY);
    expect(pickHouseId(account, FAMILY, [{ id: OTHER }, { id: HOUSE }])).toBe(HOUSE);
  });

  it('ignores a last house that belongs to another family', () => {
    const account = me({ lastFamilyId: OTHER, lastHouseId: HOUSE });
    expect(pickHouseId(account, FAMILY, [{ id: OTHER }])).toBe(OTHER);
    expect(pickFamilyId(me({ families: [], lastFamilyId: FAMILY }))).toBeNull();
  });
});

describe('forms', () => {
  it('requires a long password and a real time zone', () => {
    expect(
      validateSignUp({ name: 'Ada', email: 'ada@example.test', password: 'corta', confirm: 'corta' })
        ?.password,
    ).toBe('password-short');
    expect(
      validateFamily(
        { name: 'Rossi', timezone: 'Mars/Base', currency: 'EUR', locale: 'it', houseName: 'Casa' },
        'create',
      )?.timezone,
    ).toBe('timezone');
    expect(validateHouse({ ...blankHouse(), country: 'Italia' })?.country).toBe('country');
    expect(validateHouse({ ...blankHouse(), name: 'Casa al mare', country: 'it' })).toBeNull();
  });
});

describe('theme and safety size', () => {
  it('resolves automatic from the device and keeps emergency controls at 48px', () => {
    expect(resolvedColorScheme('system', true)).toBe('dark');
    expect(resolvedColorScheme('light', true)).toBe('light');
    expect(buttonVariants({ size: 'emergency' })).toContain('min-h-12');
    expect(buttonVariants({ size: 'default' })).not.toContain('min-h-12');
  });
});

describe('italian copy', () => {
  it('does not use acronyms in the interface', () => {
    const text = readFileSync(resolve(import.meta.dirname, '../../messages/it.json'), 'utf8');
    const values = Object.values(JSON.parse(text) as Record<string, string>);
    const banned = /\b(?:QR|PIN|PDF|PWA|API|URL|SOS|SMS|IBAN|SIM|TOTP|CSRF|UUID|HTTP|RBAC|OIDC)\b/u;
    for (const value of values) {
      expect(value, value).not.toMatch(banned);
    }
  });
});

function blankHouse() {
  return { name: '', addressLine: '', postalCode: '', city: '', province: '', country: 'IT' };
}
