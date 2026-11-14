import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Me } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { problemText } from '@/lib/copy.js';
import { roleAllows } from '@/lib/permissions.js';
import { deadlinesQuery, rescueSheetQuery, shutoffsQuery } from '@/lib/queries.js';
import { KioskScreen, type KioskSection } from './kiosk-screen.js';
import { kioskContacts, kioskCutoffs, kioskDeadlines, kioskMedicines, kioskPeople } from './model.js';

/**
 * Loads the open house and shows the full-screen tablet gallery.
 *
 * Preconditions: `houseId` belongs to `familyId` and the caller is signed in.
 * Postconditions: closing returns to the previous screen, or to Famiglia when there is none.
 * Data contract: cutoffs, rescue sheet and deadlines only. Encrypted documents are not requested.
 *
 * @param props - Account and the open house.
 * @returns The gallery.
 */
export function KioskPage(props: {
  readonly me: Me;
  readonly familyId: string;
  readonly houseId: string;
  readonly houseName: string;
}) {
  const api = useApi();
  const navigate = useNavigate();
  const membership = props.me.families.find((family) => family.id === props.familyId);
  const role = membership?.role;
  const canHealth = role !== undefined && roleAllows(role, 'health.read');
  const canCutoffs = role !== undefined && roleAllows(role, 'house.technical.read');
  const canDeadlines = role !== undefined && roleAllows(role, 'deadlines.read');

  const sheet = useQuery({
    ...rescueSheetQuery(api, props.familyId, props.houseId),
    enabled: canHealth,
  });
  const shutoffs = useQuery({
    ...shutoffsQuery(api, props.familyId, props.houseId),
    enabled: canCutoffs,
  });
  const deadlines = useQuery({
    ...deadlinesQuery(api, props.familyId, props.houseId),
    enabled: canDeadlines,
  });

  function close(): void {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    void navigate({
      to: '/f/$familyId/c/$houseId/famiglia',
      params: { familyId: props.familyId, houseId: props.houseId },
    });
  }

  const cutoffSection = sectionOf(canCutoffs, shutoffs);
  const peopleSection = sectionOf(canHealth, sheet);
  const deadlineSection = sectionOf(canDeadlines, deadlines);

  return (
    <KioskScreen
      familyId={props.familyId}
      houseId={props.houseId}
      houseName={props.houseName}
      contacts={
        peopleSection.status === 'ready'
          ? { status: 'ready', value: kioskContacts(kioskPeople(peopleSection.value)) }
          : peopleSection
      }
      cutoffs={
        cutoffSection.status === 'ready'
          ? { status: 'ready', value: kioskCutoffs(cutoffSection.value) }
          : cutoffSection
      }
      deadlines={
        deadlineSection.status === 'ready'
          ? { status: 'ready', value: kioskDeadlines(deadlineSection.value) }
          : deadlineSection
      }
      medicines={
        peopleSection.status === 'ready'
          ? { status: 'ready', value: kioskMedicines(kioskPeople(peopleSection.value)) }
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
): KioskSection<T> {
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
