/** @vitest-environment happy-dom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DomusafeApi } from '../../src/lib/api.js';
import type { SessionClient } from '../../src/lib/session.js';
import { createAppRouter } from '../../src/router.js';

const session: SessionClient = {
  signIn: () => Promise.resolve({ status: 'error', reason: 'generic' }),
  signUp: () => Promise.resolve({ status: 'error', reason: 'generic' }),
  verifyCode: () => Promise.resolve({ status: 'error', reason: 'generic' }),
  signOut: () => Promise.resolve(),
};

describe('access screen', () => {
  it('shows the Italian sign-in form', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const api = unusedApi({ getMe: () => Promise.resolve(null) });
    const router = createAppRouter(
      { queryClient, api, session },
      createMemoryHistory({ initialEntries: ['/accesso'] }),
    );
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Accedi' })).toBeTruthy();
    expect(screen.getByLabelText('Indirizzo di posta')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Automatico' })).toBeTruthy();
  });
});

function unusedApi(partial: Partial<DomusafeApi>): DomusafeApi {
  const fail = (): Promise<never> => Promise.reject(new Error('not used'));
  return {
    getMe: fail,
    updateProfile: fail,
    listFamilies: fail,
    getFamily: fail,
    createFamily: fail,
    updateFamily: fail,
    listHouses: fail,
    createHouse: fail,
    updateHouse: fail,
    listMembers: fail,
    getGuestView: fail,
    previewGuestView: fail,
    listGuideEntries: fail,
    createGuideEntry: fail,
    updateGuideEntry: fail,
    listShutoffs: fail,
    createShutoff: fail,
    updateShutoff: fail,
    listWaste: fail,
    createWaste: fail,
    updateWaste: fail,
    deleteWaste: fail,
    listContacts: fail,
    createContact: fail,
    updateContact: fail,
    listUtilities: fail,
    createUtility: fail,
    updateUtility: fail,
    listMaintenance: fail,
    createMaintenance: fail,
    updateMaintenance: fail,
    listResidents: fail,
    createResident: fail,
    updateResident: fail,
    getRescue: fail,
    putRescue: fail,
    getRescueSheet: fail,
    listPets: fail,
    createPet: fail,
    listPhoneLines: fail,
    createPhoneLine: fail,
    listSubscriptions: fail,
    createSubscription: fail,
    listVehicles: fail,
    createVehicle: fail,
    listBankAccounts: fail,
    createBankAccount: fail,
    listTax: fail,
    generateTax: fail,
    updateTaxItem: fail,
    ...partial,
  };
}
