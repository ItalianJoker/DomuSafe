import type { RealtimeEventKind } from '@domusafe/contracts';
import { buildRealtimeEvent, type RealtimeHub } from './hub.js';

/** Input of a domain change notification after a successful commit. */
export interface ChangeNotice {
  readonly familyId: string;
  readonly kind: RealtimeEventKind;
  readonly resource: string;
  readonly id: string;
  readonly version: number | null;
  readonly houseId: string | null;
  readonly ownerAccountId?: string | null;
  readonly guestVisible?: boolean;
}

/**
 * Publishes a change notice through the realtime hub.
 *
 * Preconditions: the domain write has already committed.
 * Postconditions: connected members of the family receive a content-free event when allowed.
 * Data contract: only identifiers, version and kind are published.
 *
 * @param hub - Realtime hub, or `null` when realtime is disabled (OpenAPI generation).
 * @param notice - Change metadata.
 * @param now - Clock.
 */
export async function emitChange(
  hub: RealtimeHub | null,
  notice: ChangeNotice,
  now: () => Date = () => new Date(),
): Promise<void> {
  if (hub === null) {
    return;
  }
  await hub.publish({
    familyId: notice.familyId,
    event: buildRealtimeEvent(
      {
        kind: notice.kind,
        resource: notice.resource,
        id: notice.id,
        version: notice.version,
        houseId: notice.houseId,
      },
      now,
    ),
    ...(notice.ownerAccountId === undefined ? {} : { ownerAccountId: notice.ownerAccountId }),
    ...(notice.guestVisible === undefined ? {} : { guestVisible: notice.guestVisible }),
  });
}

/** Callback modules use after a committed write. */
export type ChangeEmitter = (notice: ChangeNotice) => void;
