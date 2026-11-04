/** @vitest-environment happy-dom */
import type { Me } from '@domusafe/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReadingsPage } from '../../src/features/readings/readings-page.js';

const FAMILY = '019a0000-0000-7000-8000-000000000001';
const HOUSE = '019a0000-0000-7000-8000-000000000002';

function account(plan: Me['families'][number]['plan'], role: Me['families'][number]['role']): Me {
  return {
    accountId: '019a0000-0000-7000-8000-000000000010',
    email: 'ada@example.test',
    emailVerified: false,
    displayName: 'Ada',
    locale: 'it',
    theme: 'system',
    twoFactorEnabled: false,
    primaryFamilyId: FAMILY,
    lastFamilyId: FAMILY,
    lastHouseId: HOUSE,
    families: [{ id: FAMILY, name: 'Rossi', role, plan, vaultFamily: true }],
  };
}

describe('reading log', () => {
  it('explains that Free, Basic and Advanced stay closed', () => {
    for (const plan of ['free', 'basic', 'advanced'] as const) {
      const view = render(<ReadingsPage me={account(plan, 'admin')} familyId={FAMILY} houseId={HOUSE} />);
      expect(screen.getByRole('heading', { name: 'Registro delle letture' })).toBeTruthy();
      expect(screen.getByText(/Gratuito, Base e Avanzato/u)).toBeTruthy();
      view.unmount();
    }
  });

  it('hides the list from someone who cannot edit the house', () => {
    render(<ReadingsPage me={account('premium', 'child')} familyId={FAMILY} houseId={HOUSE} />);
    expect(screen.getByText(/Solo chi può modificare la casa/u)).toBeTruthy();
  });
});
