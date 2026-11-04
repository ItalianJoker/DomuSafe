import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/components/api-context.js';
import { pickHouseId } from '@/lib/entry.js';
import { sectionFromPath } from '@/lib/navigation.js';
import { meKey } from '@/lib/queries.js';
import type { Me } from '@domusafe/contracts';

/**
 * Opens a family and house, remembering the choice on the account.
 *
 * Preconditions: rendered inside the router and the API provider.
 * Postconditions: navigation keeps the current section; a failed profile update still navigates.
 * Data contract: `houseId` null asks the destination family for its first visible house.
 *
 * @returns A function `(familyId, houseId | null) => Promise<void>`.
 */
export function useOpenPlace(): (familyId: string, houseId: string | null) => Promise<void> {
  const navigate = useNavigate();
  const api = useApi();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return async (familyId, requestedHouseId) => {
    let resolved = requestedHouseId;
    if (resolved === null) {
      const houses = await api.listHouses(familyId);
      queryClient.setQueryData(['houses', familyId], houses);
      const me = queryClient.getQueryData<Me>(meKey);
      resolved = me === undefined ? (houses[0]?.id ?? null) : pickHouseId(me, familyId, houses);
    }
    if (resolved === null) {
      await navigate({ to: '/famiglia/nuova' });
      return;
    }
    try {
      const me = await api.updateProfile({ lastFamilyId: familyId, lastHouseId: resolved });
      queryClient.setQueryData(meKey, me);
    } catch {
      // The place still opens. The account keeps the previous last house.
    }
    const section = sectionFromPath(pathname);
    const params = { familyId, houseId: resolved };
    switch (section) {
      case 'home':
        await navigate({ to: '/f/$familyId/c/$houseId', params });
        return;
      case 'cassaforte':
        await navigate({ to: '/f/$familyId/c/$houseId/cassaforte', params });
        return;
      case 'famiglia':
        await navigate({ to: '/f/$familyId/c/$houseId/famiglia', params });
        return;
      case 'casa':
        await navigate({ to: '/f/$familyId/c/$houseId/casa', params });
        return;
      case 'personale':
        await navigate({ to: '/f/$familyId/c/$houseId/personale', params });
        return;
      case 'stampa':
        await navigate({ to: '/f/$familyId/c/$houseId/stampa', params });
        return;
      case 'extra':
        await navigate({ to: '/f/$familyId/c/$houseId/extra', params });
        return;
      case 'guida':
        await navigate({ to: '/f/$familyId/c/$houseId/guida', params });
        return;
      case 'account':
        await navigate({ to: '/f/$familyId/c/$houseId/account', params });
        return;
    }
  };
}
