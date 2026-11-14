import type { DeadlineBoard, DeadlineItem, RescueSheet, Shutoff } from '@domusafe/contracts';
import { deadlineLabel } from '@/features/home/model.js';
import {
  essentialCutoffs,
  rescuePeople,
  type RescueContact,
  type RescueCutoff,
  type RescueMedicine,
  type RescuePerson,
} from '@/features/rescue/model.js';

/** How many deadline rows the tablet gallery keeps visible at once. */
export const KIOSK_DEADLINE_LIMIT = 5;

/** One contact ready for a large tap-to-call control. */
export interface KioskContact {
  readonly id: string;
  readonly displayName: string;
  readonly phone: string | null;
  readonly relationship: string | null;
  readonly personName: string;
}

/** One lifesaving medicine cue for the gallery. */
export interface KioskMedicine {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly personName: string;
}

/** One upcoming deadline line for the gallery. */
export interface KioskDeadline {
  readonly key: string;
  readonly label: string;
  readonly dueDate: string;
  readonly group: 'overdue' | 'week' | 'month';
}

/**
 * Water, gas and power cutoffs for the tablet gallery.
 *
 * Preconditions: `shutoffs` may include the boiler and other kinds.
 * Postconditions: three groups always, even when empty.
 * Data contract: location and instructions only.
 *
 * @param shutoffs - Cutoffs of the open house.
 * @returns The three groups.
 */
export function kioskCutoffs(shutoffs: readonly Shutoff[]): readonly RescueCutoff[] {
  return essentialCutoffs(shutoffs);
}

/**
 * Essential people cards for medicine and contact projection.
 *
 * @param sheet - Rescue sheet of the open house.
 * @returns The cards.
 */
export function kioskPeople(sheet: RescueSheet): readonly RescuePerson[] {
  return rescuePeople(sheet);
}

/**
 * Emergency contacts in call order, tagged with the resident they belong to.
 *
 * Preconditions: `people` already sort contacts by `sortOrder`.
 * Postconditions: every contact appears once; order follows people then call order.
 * Data contract: display name, optional phone and relationship, resident name.
 *
 * @param people - Essential cards.
 * @returns Flat contact list.
 */
export function kioskContacts(people: readonly RescuePerson[]): readonly KioskContact[] {
  const rows: KioskContact[] = [];
  for (const person of people) {
    for (const contact of person.contacts) {
      rows.push(toContact(contact, person.displayName));
    }
  }
  return rows;
}

/**
 * Lifesaving medicines across residents, for large cue tiles.
 *
 * @param people - Essential cards.
 * @returns Flat medicine list.
 */
export function kioskMedicines(people: readonly RescuePerson[]): readonly KioskMedicine[] {
  const rows: KioskMedicine[] = [];
  for (const person of people) {
    for (const medicine of person.medicines) {
      rows.push(toMedicine(medicine, person.displayName));
    }
  }
  return rows;
}

/**
 * Next deadlines: overdue first, then this week, then this month.
 *
 * Preconditions: `board` uses the family time zone.
 * Postconditions: at most {@link KIOSK_DEADLINE_LIMIT} rows; labels are interface language.
 * Data contract: stable key, visible label, due date and group.
 *
 * @param board - Deadline overview of the house.
 * @returns The short list for the gallery.
 */
export function kioskDeadlines(board: DeadlineBoard): readonly KioskDeadline[] {
  const rows: KioskDeadline[] = [];
  pushGroup(rows, board.overdue, 'overdue');
  pushGroup(rows, board.week, 'week');
  pushGroup(rows, board.month, 'month');
  return rows.slice(0, KIOSK_DEADLINE_LIMIT);
}

function pushGroup(
  rows: KioskDeadline[],
  items: readonly DeadlineItem[],
  group: KioskDeadline['group'],
): void {
  for (const item of items) {
    rows.push({
      key: `${item.kind}:${item.sourceId}:${item.dueDate}`,
      label: deadlineLabel(item),
      dueDate: item.dueDate,
      group,
    });
  }
}

function toContact(contact: RescueContact, personName: string): KioskContact {
  return {
    id: contact.id,
    displayName: contact.displayName,
    phone: contact.phone,
    relationship: contact.relationship,
    personName,
  };
}

function toMedicine(medicine: RescueMedicine, personName: string): KioskMedicine {
  return {
    id: medicine.id,
    name: medicine.name,
    location: medicine.location,
    personName,
  };
}
