import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RescueSheet, Shutoff } from '@domusafe/contracts';
import { describe, expect, it } from 'vitest';
import { essentialCutoffs, rescuePeople } from '../../src/features/rescue/model.js';
import { rescuePath } from '../../src/features/rescue/path.js';

const HOUSE = '019a0000-0000-7000-8000-000000000002';
const SECRET = 'IT60X0542811101000000123456';

function shutoff(kind: Shutoff['kind'], location: string, id: string): Shutoff {
  return {
    id,
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

function sheet(): RescueSheet {
  return {
    houseId: HOUSE,
    residents: [
      {
        id: '019a0000-0000-7000-8000-000000000041',
        displayName: 'Ada',
        birthYear: 1980,
        usualBedroom: 'Camera nord',
        photo: 'data:image/png;base64,SECRETPHOTO',
        bloodGroup: 'a_positive',
        mobility: 'assisted',
        allergies: ['Penicillina'],
        conditions: [SECRET],
        devices: ['cassaforte-segreta'],
        medicines: [
          {
            id: '019a0000-0000-7000-8000-000000000052',
            name: 'Secondo farmaco',
            location: 'Bagno',
            sortOrder: 2,
          },
          {
            id: '019a0000-0000-7000-8000-000000000051',
            name: 'Insulina',
            location: 'Frigorifero',
            sortOrder: 0,
          },
        ],
        contacts: [
          {
            id: '019a0000-0000-7000-8000-000000000062',
            displayName: 'Luca',
            phone: '+393330000002',
            relationship: null,
            hasKeys: true,
            sortOrder: 2,
          },
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
    pets: [
      {
        id: '019a0000-0000-7000-8000-000000000071',
        name: SECRET,
        species: 'cat',
        vetName: null,
        vetPhone: null,
        vetAddress: null,
      },
    ],
  };
}

describe('rescue projection', () => {
  it('keeps water, gas and power in that order and drops the other cutoffs', () => {
    const groups = essentialCutoffs([
      shutoff('electricity', 'Quadro', '019a0000-0000-7000-8000-000000000013'),
      shutoff('boiler', SECRET, '019a0000-0000-7000-8000-000000000014'),
      shutoff('water', 'Cortile', '019a0000-0000-7000-8000-000000000011'),
      shutoff('gas', 'Cucina', '019a0000-0000-7000-8000-000000000012'),
      shutoff('other', SECRET, '019a0000-0000-7000-8000-000000000015'),
    ]);
    expect(groups.map((group) => group.kind)).toEqual(['water', 'gas', 'electricity']);
    expect(groups.map((group) => group.places.map((place) => place.location))).toEqual([
      ['Cortile'],
      ['Cucina'],
      ['Quadro'],
    ]);
    expect(JSON.stringify(groups)).not.toContain(SECRET);
  });

  it('orders medicines and contacts and omits anything that is not on the essential card', () => {
    const [person] = rescuePeople(sheet());
    expect(person?.medicines.map((item) => item.name)).toEqual(['Insulina', 'Secondo farmaco']);
    expect(person?.medicines[0]).toEqual({
      id: '019a0000-0000-7000-8000-000000000051',
      name: 'Insulina',
      location: 'Frigorifero',
    });
    expect(person?.contacts.map((item) => item.displayName)).toEqual(['Marta', 'Luca']);
    expect(person?.contacts[0]).toEqual({
      id: '019a0000-0000-7000-8000-000000000061',
      displayName: 'Marta',
      phone: '+393330000001',
      relationship: 'Madre',
    });
    expect(person).toMatchObject({
      displayName: 'Ada',
      bloodGroup: 'a_positive',
      allergies: ['Penicillina'],
      mobility: 'assisted',
      usualBedroom: 'Camera nord',
    });
    const text = JSON.stringify(person);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('SECRETPHOTO');
    expect(text).not.toContain('cassaforte-segreta');
    expect(text).not.toContain('hasKeys');
    expect(text).not.toContain('birthYear');
  });
});

describe('rescue route', () => {
  it('is a house path and the screen is loaded only when opened', () => {
    expect(rescuePath('famiglia', 'casa')).toBe('/f/famiglia/c/casa/soccorso');
    const root = resolve(import.meta.dirname, '../..');
    const router = readFileSync(resolve(root, 'src/router.tsx'), 'utf8');
    const home = readFileSync(resolve(root, 'src/features/home/home-page.tsx'), 'utf8');
    const card = readFileSync(resolve(root, 'src/features/personale/card-panel.tsx'), 'utf8');
    const page = readFileSync(resolve(root, 'src/features/rescue/rescue-page.tsx'), 'utf8');
    expect(router).toMatch(/lazy\(\(\) =>\s*import\('@\/features\/rescue\/rescue-page\.js'\)/);
    expect(router).not.toMatch(/from '@\/features\/rescue\/rescue-(page|screen)/);
    expect(home).toContain('rescuePath');
    expect(home).not.toContain('rescue-page');
    expect(home).not.toContain('rescue-screen');
    expect(card).toContain('rescuePath');
    expect(card).not.toContain('rescue-page');
    expect(card).not.toContain('rescue-screen');
    expect(page).not.toMatch(/vault|listUtilities|listAccounts|sms/i);
    const css = readFileSync(resolve(root, 'src/styles/app.css'), 'utf8');
    expect(css).toMatch(/\.rescue-screen\s*\{[^}]*--background:\s*#000000/);
    expect(css).toMatch(/\.rescue-screen\s*\{[^}]*--foreground:\s*#ffffff/);
    expect(css).toMatch(/data-theme='light'\] \.rescue-screen\s*\{[^}]*--background:\s*#ffffff/);
    expect(css).toMatch(/data-theme='light'\] \.rescue-screen\s*\{[^}]*--foreground:\s*#000000/);
    expect(css).toMatch(
      /prefers-color-scheme:\s*light[\s\S]*data-theme='system'\] \.rescue-screen\s*\{[^}]*--background:\s*#ffffff/,
    );
  });
});
