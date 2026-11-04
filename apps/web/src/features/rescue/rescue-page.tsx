import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Me } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { problemText } from '@/lib/copy.js';
import { roleAllows } from '@/lib/permissions.js';
import { rescueSheetQuery, shutoffsQuery } from '@/lib/queries.js';
import { essentialCutoffs, rescuePeople } from './model.js';
import { RescueScreen, type RescueSection } from './rescue-screen.js';

/**
 * Loads the open house and shows the full-screen rescue view.
 *
 * Preconditions: `houseId` belongs to `familyId` and the caller is signed in.
 * Postconditions: closing returns to the previous screen, or to the dashboard when there is none.
 * Data contract: cutoffs and the rescue sheet only. Encrypted documents and payment accounts are not requested.
 *
 * @param props - Account and the open house.
 * @returns The screen.
 */
export function RescuePage(props: {
  readonly me: Me;
  readonly familyId: string;
  readonly houseId: string;
  readonly houseName: string;
}) {
  const api = useApi();
  const navigate = useNavigate();
  const role = props.me.families.find((family) => family.id === props.familyId)?.role;
  const canHealth = role !== undefined && roleAllows(role, 'health.read');
  const canCutoffs = role !== undefined && roleAllows(role, 'house.technical.read');
  const sheet = useQuery({
    ...rescueSheetQuery(api, props.familyId, props.houseId),
    enabled: canHealth,
  });
  const shutoffs = useQuery({
    ...shutoffsQuery(api, props.familyId, props.houseId),
    enabled: canCutoffs,
  });

  function close(): void {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    void navigate({
      to: '/f/$familyId/c/$houseId',
      params: { familyId: props.familyId, houseId: props.houseId },
    });
  }

  const cutoffSection = sectionOf(canCutoffs, shutoffs);
  const peopleSection = sectionOf(canHealth, sheet);

  return (
    <RescueScreen
      houseName={props.houseName}
      cutoffs={
        cutoffSection.status === 'ready'
          ? { status: 'ready', value: essentialCutoffs(cutoffSection.value) }
          : cutoffSection
      }
      people={
        peopleSection.status === 'ready'
          ? { status: 'ready', value: rescuePeople(peopleSection.value) }
          : peopleSection
      }
      onClose={close}
    />
  );
}

function sectionOf<T>(
  allowed: boolean,
  query: {
    readonly isError: boolean;
    readonly isPending: boolean;
    readonly data: T | undefined;
    readonly error: unknown;
  },
): RescueSection<T> {
  if (!allowed) {
    return { status: 'hidden' };
  }
  if (query.isError) {
    return { status: 'error', message: problemText(query.error) };
  }
  if (query.isPending || query.data === undefined) {
    return { status: 'loading' };
  }
  return { status: 'ready', value: query.data };
}
