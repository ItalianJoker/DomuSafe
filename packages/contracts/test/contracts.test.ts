import { describe, expect, it } from 'vitest';
import {
  KIOSK_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_MATRIX,
  PROBLEM_CODES,
  PROBLEM_TITLES,
  TWO_FACTOR_PERMISSIONS,
  base64UrlSchema,
  can,
  createFamilyRequestSchema,
  decide,
  decodeCursor,
  encodeCursor,
  formatEtag,
  parseIfMatch,
  problemType,
  timeZoneSchema,
  updateHouseRequestSchema,
} from '../src/index.js';

const admin = { role: 'admin', isOwner: false, vaultFamilyConcession: false } as const;
const owner = { ...admin, isOwner: true } as const;
const parent = { role: 'parent', isOwner: false, vaultFamilyConcession: false } as const;
const child = { role: 'child', isOwner: false, vaultFamilyConcession: false } as const;
const caregiver = { role: 'caregiver', isOwner: false, vaultFamilyConcession: false } as const;
const guest = { role: 'guest', isOwner: false, vaultFamilyConcession: false } as const;

describe('permission matrix', () => {
  it('reserves ownership actions to the owner', () => {
    expect(can(admin, 'ownership.transfer')).toBe(false);
    expect(can(owner, 'ownership.transfer')).toBe(true);
    expect(can(owner, 'billing.manage')).toBe(true);
    expect(can(admin, 'billing.read')).toBe(true);
  });

  it('opens the family vault to parents only with a concession', () => {
    expect(can(parent, 'vault.family.read')).toBe(false);
    expect(can({ ...parent, vaultFamilyConcession: true }, 'vault.family.read')).toBe(true);
    expect(can(child, 'vault.family.read')).toBe(false);
  });

  it('keeps children away from utilities and finance writes but lets them read budgets', () => {
    expect(can(child, 'utilities.read')).toBe(false);
    expect(can(child, 'finance.write')).toBe(false);
    expect(decide(child, 'finance.read')).toEqual({ allowed: true, scope: 'own' });
  });

  it('limits caregivers and guests to their scope', () => {
    expect(decide(caregiver, 'health.read')).toEqual({ allowed: true, scope: 'scoped' });
    expect(can(caregiver, 'members.manage')).toBe(false);
    expect(decide(guest, 'house.guest_view.read')).toEqual({ allowed: true, scope: 'scoped' });
    expect(can(guest, 'house.technical.read')).toBe(false);
    expect(can(guest, 'emergency.use')).toBe(true);
    expect(can(guest, 'emergency.sos')).toBe(false);
  });

  it('lets parents invite guests only', () => {
    expect(can(parent, 'invitations.create_guest')).toBe(true);
    expect(can(parent, 'invitations.create')).toBe(false);
  });

  it('marks administration permissions as requiring two-factor authentication', () => {
    expect(TWO_FACTOR_PERMISSIONS.has('houses.manage')).toBe(true);
    expect(TWO_FACTOR_PERMISSIONS.has('members.manage')).toBe(true);
    expect(TWO_FACTOR_PERMISSIONS.has('ownership.transfer')).toBe(true);
    expect(TWO_FACTOR_PERMISSIONS.has('house.write')).toBe(false);
    expect(TWO_FACTOR_PERMISSIONS.has('vault.family.read')).toBe(false);
  });

  it('gives every role an explicit entry for every permission', () => {
    for (const permission of PERMISSIONS) {
      expect(Object.keys(PERMISSION_MATRIX[permission]).sort()).toEqual(
        ['admin', 'caregiver', 'child', 'guest', 'parent'],
      );
    }
    for (const permission of KIOSK_PERMISSIONS.elderly) {
      expect(PERMISSIONS).toContain(permission);
    }
  });
});

describe('conventions', () => {
  it('round-trips cursors and rejects tampered ones', () => {
    const cursor = encodeCursor([3, '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b']);
    expect(decodeCursor(cursor)).toEqual([3, '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b']);
    expect(decodeCursor('not-a-cursor')).toBeNull();
    expect(decodeCursor(encodeCursor([3, 'x']))).toBeNull();
  });

  it('formats and parses strong ETags', () => {
    expect(formatEtag(7)).toBe('"7"');
    expect(parseIfMatch('"7"')).toBe(7);
    expect(parseIfMatch('W/"7"')).toBeNull();
    expect(parseIfMatch('"0"')).toBeNull();
    expect(parseIfMatch(undefined)).toBeNull();
  });

  it('describes every problem code in Italian and English', () => {
    for (const code of PROBLEM_CODES) {
      expect(PROBLEM_TITLES[code].it.length).toBeGreaterThan(0);
      expect(PROBLEM_TITLES[code].en.length).toBeGreaterThan(0);
    }
    expect(problemType('version_conflict')).toBe('urn:domusafe:problem:version_conflict');
  });

  it('validates base64url and time zones', () => {
    expect(base64UrlSchema.safeParse('AQID').success).toBe(true);
    expect(base64UrlSchema.safeParse('AQ==').success).toBe(false);
    expect(timeZoneSchema.safeParse('Europe/Rome').success).toBe(true);
    expect(timeZoneSchema.safeParse('Mars/Olympus').success).toBe(false);
  });

  it('applies defaults and strictness to request bodies', () => {
    const parsed = createFamilyRequestSchema.parse({ name: 'Rossi', firstHouse: { name: 'Casa al mare' } });
    expect(parsed).toMatchObject({ timezone: 'Europe/Rome', baseCurrency: 'EUR', locale: 'it' });
    expect(createFamilyRequestSchema.safeParse({ name: 'Rossi', firstHouse: { name: 'x' }, extra: 1 }).success).toBe(
      false,
    );
    expect(updateHouseRequestSchema.safeParse({}).success).toBe(false);
  });
});
