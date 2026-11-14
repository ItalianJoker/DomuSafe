import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DeadlineBoard, RescueSheet, Shutoff } from '@domusafe/contracts';
import {
  KIOSK_DEADLINE_LIMIT,
  kioskContacts,
  kioskCutoffs,
  kioskDeadlines,
  kioskMedicines,
  kioskPeople,
} from '../../src/features/kiosk/model.js';
import { kioskPath } from '../../src/features/kiosk/path.js';

const FAMILY = '019a0000-0000-7000-8000-000000000001';
const HOUSE = '019a0000-0000-7000-8000-000000000002';

function shutoff(kind: Shutoff['kind'], location: string, id: string): Shutoff {
  return {
    id,
    familyId: FAMILY,
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

function sheet(): RescueSheet {
  return {
    houseId: HOUSE,
    residents: [
      {
        id: '019a0000-0000-7000-8000-000000000041',
        displayName: 'Ada',
        birthYear: 1980,
        usualBedroom: 'Camera nord',
        photo: null,
        bloodGroup: 'a_positive',
        mobility: 'assisted',
        allergies: [],
        conditions: [],
        devices: [],
        medicines: [
          {
            id: '019a0000-0000-7000-8000-000000000052',
            name: 'Insulina',
            location: 'Frigorifero',
            sortOrder: 1,
          },
          {
            id: '019a0000-0000-7000-8000-000000000051',
            name: 'Aspirina',
            location: 'Cassetto',
            sortOrder: 0,
          },
        ],
        contacts: [
          {
            id: '019a0000-0000-7000-8000-000000000061',
            displayName: 'Marta',
            phone: '+393330000001',
            relationship: 'Madre',
            hasKeys: false,
            sortOrder: 0,
          },
        ],
      },
    ],
    pets: [],
  };
}

describe('kiosk model', () => {
  it('projects cutoffs, contacts, medicines and the next deadlines', () => {
    const groups = kioskCutoffs([
      shutoff('water', 'Cortile', '019a0000-0000-7000-8000-000000000011'),
      shutoff('boiler', 'Cantina', '019a0000-0000-7000-8000-000000000014'),
    ]);
    expect(groups.map((group) => group.kind)).toEqual(['water', 'gas', 'electricity']);
    expect(groups[0]?.places[0]?.location).toBe('Cortile');

    const people = kioskPeople(sheet());
    expect(kioskMedicines(people).map((item) => item.name)).toEqual(['Aspirina', 'Insulina']);
    expect(kioskContacts(people)[0]?.displayName).toBe('Marta');
    expect(kioskContacts(people)[0]?.personName).toBe('Ada');

    const board: DeadlineBoard = {
      timezone: 'Europe/Rome',
      today: '2026-11-14',
      overdue: [
        {
          kind: 'maintenance',
          sourceId: '019a0000-0000-7000-8000-000000000011',
          dueDate: '2026-11-01',
          title: 'Filtro',
          detail: null,
          taxItemKey: null,
          successionKind: null,
          version: 1,
          houseId: HOUSE,
        },
      ],
      week: Array.from({ length: 6 }, (_, index) => ({
        kind: 'maintenance' as const,
        sourceId: `019a0000-0000-7000-8000-00000000002${String(index)}`,
        dueDate: '2026-11-15',
        title: `Compito ${String(index)}`,
        detail: null,
        taxItemKey: null,
        successionKind: null,
        version: 1,
        houseId: HOUSE,
      })),
      month: [],
    };
    const next = kioskDeadlines(board);
    expect(next).toHaveLength(KIOSK_DEADLINE_LIMIT);
    expect(next[0]?.label).toBe('Filtro');
    expect(next[0]?.group).toBe('overdue');
  });

  it('keeps the tablet route out of the shell menu and out of the shell chunk', () => {
    expect(kioskPath(FAMILY, HOUSE)).toBe(`/f/${FAMILY}/c/${HOUSE}/kiosk`);
    const root = resolve(import.meta.dirname, '../..');
    const family = readFileSync(resolve(root, 'src/features/family/family-pages.tsx'), 'utf8');
    const shell = readFileSync(resolve(root, 'src/components/shell/app-shell.tsx'), 'utf8');
    const router = readFileSync(resolve(root, 'src/router.tsx'), 'utf8');
    expect(family).toContain('kioskPath');
    expect(family).not.toContain('kiosk-screen');
    expect(shell).not.toContain('kiosk-screen');
    expect(router).toContain("path: '/kiosk'");
    expect(router).toContain("tail === 'soccorso' || tail === 'kiosk'");
  });
});
