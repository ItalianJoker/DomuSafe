import type { RescueSheet, Shutoff } from '@domusafe/contracts';

/** Cutoffs shown on the rescue screen, in the order a person looks for them. */
export const RESCUE_CUTOFF_KINDS = ['water', 'gas', 'electricity'] as const;

/** One cutoff kind on the rescue screen. */
export type RescueCutoffKind = (typeof RESCUE_CUTOFF_KINDS)[number];

/** Where one supply is shut off, without any account number. */
export interface RescuePlace {
  readonly id: string;
  readonly location: string;
  readonly instructions: string;
}

/** Every place of one kind. Empty when the house has not recorded that cutoff. */
export interface RescueCutoff {
  readonly kind: RescueCutoffKind;
  readonly places: readonly RescuePlace[];
}

/** A lifesaving medicine and the place it is kept. */
export interface RescueMedicine {
  readonly id: string;
  readonly name: string;
  readonly location: string;
}

/** An emergency contact, already sorted into call order. */
export interface RescueContact {
  readonly id: string;
  readonly displayName: string;
  readonly phone: string | null;
  readonly relationship: string | null;
}

/** The essential health card of one resident. */
export interface RescuePerson {
  readonly id: string;
  readonly displayName: string;
  readonly bloodGroup: RescueSheet['residents'][number]['bloodGroup'];
  readonly allergies: readonly string[];
  readonly medicines: readonly RescueMedicine[];
  readonly mobility: RescueSheet['residents'][number]['mobility'];
  readonly usualBedroom: string | null;
  readonly contacts: readonly RescueContact[];
}

/** Telephone address of the Italian medical emergency service. */
export const MEDICAL_EMERGENCY_TEL = 'tel:118';

/**
 * Water, gas and power cutoffs, in that order.
 *
 * Preconditions: `shutoffs` may include the boiler and other kinds.
 * Postconditions: the result always has three groups, even when a group is empty.
 * Data contract: location and instructions only. Boiler and other kinds are dropped.
 *
 * @param shutoffs - Cutoffs of the open house.
 * @returns The three groups.
 */
export function essentialCutoffs(shutoffs: readonly Shutoff[]): readonly RescueCutoff[] {
  return RESCUE_CUTOFF_KINDS.map((kind) => ({
    kind,
    places: shutoffs
      .filter((item) => item.kind === kind)
      .map((item) => ({ id: item.id, location: item.location, instructions: item.instructions })),
  }));
}

/**
 * Essential health cards, with medicines and contacts in call order.
 *
 * Preconditions: `sheet` is the rescue sheet of the open house.
 * Postconditions: one card per resident. Contacts and medicines follow `sortOrder`.
 * Data contract: name, blood group, allergies, medicines and where they are kept, mobility,
 * bedroom and ordered contacts. Photographs, conditions, devices, pets and key flags are omitted.
 *
 * @param sheet - Rescue sheet.
 * @returns The cards.
 */
export function rescuePeople(sheet: RescueSheet): readonly RescuePerson[] {
  return sheet.residents.map((person) => ({
    id: person.id,
    displayName: person.displayName,
    bloodGroup: person.bloodGroup,
    allergies: person.allergies,
    medicines: [...person.medicines].sort(byOrder).map((item) => ({
      id: item.id,
      name: item.name,
      location: item.location,
    })),
    mobility: person.mobility,
    usualBedroom: person.usualBedroom,
    contacts: [...person.contacts].sort(byOrder).map((item) => ({
      id: item.id,
      displayName: item.displayName,
      phone: item.phone,
      relationship: item.relationship,
    })),
  }));
}

function byOrder(
  left: { readonly sortOrder: number; readonly id: string },
  right: { readonly sortOrder: number; readonly id: string },
): number {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}
