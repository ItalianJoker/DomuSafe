import type { DeadlineItem } from '@domusafe/contracts';
import { successionTitle } from '@/features/succession/model.js';
import { taxLabel } from '@/features/personale/model.js';
import { m } from '@/paraglide/messages.js';

/**
 * Words shown for one deadline. Stored titles are kept; the other kinds use the interface language.
 *
 * Preconditions: a tax row has `taxItemKey`; a succession row has `successionKind`.
 * Postconditions: the result is a single line, without a date.
 * Data contract: vehicle lines include the plate; tax lines include the year.
 *
 * @param item - One row from the overview.
 * @returns The line to show.
 */
export function deadlineLabel(item: DeadlineItem): string {
  switch (item.kind) {
    case 'maintenance':
      return item.title ?? '';
    case 'vehicle_insurance':
      return join(m.personaleInsurance(), item.detail);
    case 'vehicle_road_tax':
      return join(m.personaleRoadTax(), item.detail);
    case 'vehicle_inspection':
      return join(m.personaleInspection(), item.detail);
    case 'tax':
      return join(item.taxItemKey === null ? '' : taxLabel(item.taxItemKey), item.detail);
    case 'succession':
      return item.successionKind === null
        ? (item.title ?? '')
        : successionTitle({ kind: item.successionKind, title: item.title });
  }
}

/**
 * Stable key for a row. One vehicle can contribute three dates.
 *
 * @param item - One row from the overview.
 * @returns A key unique inside the board.
 */
export function deadlineKey(item: Pick<DeadlineItem, 'kind' | 'sourceId'>): string {
  return `${item.kind}:${item.sourceId}`;
}

function join(label: string, detail: string | null): string {
  if (detail === null || detail === '') {
    return label;
  }
  return `${label} · ${detail}`;
}
