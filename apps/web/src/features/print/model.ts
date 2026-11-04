import type { Contact, Publication, PublicationKind, RescueSheet, Shutoff } from '@domusafe/contracts';
import { PLAN_DEFINITIONS, type PlanTier } from '@domusafe/plans';

/** Cutoffs drawn as the three boxes of the wall sheet. */
export const WALL_KINDS = ['water', 'gas', 'electricity'] as const;
/** A cutoff box on the wall sheet. */
export type WallKind = (typeof WALL_KINDS)[number];

/** One line inside a cutoff box. */
export interface WallLine {
  readonly location: string;
  readonly instructions: string;
}

/** A cutoff box, empty when the house has no location of that kind. */
export interface WallBox {
  readonly kind: WallKind;
  readonly lines: readonly WallLine[];
}

/** An artisan as printed. Notes, mail and the web address stay off the sheet. */
export interface PrintedTrade {
  readonly id: string;
  readonly displayName: string;
  readonly trade: string | null;
  readonly phone: string | null;
}

/** The first person to call, as printed. */
export interface PrintedContact {
  readonly displayName: string;
  readonly phone: string | null;
  readonly relationship: string | null;
}

/** Health facts that fit on the folded strip. Photos stay on the rescue page. */
export interface EssentialPerson {
  readonly id: string;
  readonly displayName: string;
  readonly bloodGroup: RescueSheet['residents'][number]['bloodGroup'];
  readonly mobility: RescueSheet['residents'][number]['mobility'];
  readonly usualBedroom: string | null;
  readonly allergies: readonly string[];
  readonly conditions: readonly string[];
  readonly medicines: readonly { readonly id: string; readonly name: string; readonly location: string }[];
}

/**
 * Whether a plan prints the DomuSafe mark on the sheet.
 *
 * Preconditions: `tier` is the effective plan of the family.
 * Postconditions: Free and Basic return true; Advanced and Premium return false.
 * Data contract: the result is the catalogue flag, not a stored preference.
 *
 * @param tier - Effective plan.
 * @returns True when the sheet must show the mark.
 */
export function sheetHasWatermark(tier: PlanTier): boolean {
  return PLAN_DEFINITIONS[tier].watermark;
}

/**
 * Groups water, gas and power cutoffs into the three wall boxes.
 *
 * Preconditions: `shutoffs` may include the boiler and other kinds.
 * Postconditions: the result always has three boxes, in water, gas, power order.
 * Data contract: only location and instructions are copied.
 *
 * @param shutoffs - Cutoffs of the house.
 * @returns The three boxes.
 */
export function wallBoxes(shutoffs: readonly Shutoff[]): readonly WallBox[] {
  return WALL_KINDS.map((kind) => ({
    kind,
    lines: shutoffs
      .filter((item) => item.kind === kind)
      .map((item) => ({ location: item.location, instructions: item.instructions })),
  }));
}

/**
 * Artisans of this house, without the notes kept in the address book.
 *
 * Preconditions: `contacts` may include other houses and other kinds.
 * Postconditions: only craftsmen linked to `houseId` remain.
 * Data contract: the result has no notes, mail or web address.
 *
 * @param contacts - Address book rows.
 * @param houseId - Open house.
 * @returns The lines to print.
 */
export function printedTrades(contacts: readonly Contact[], houseId: string): readonly PrintedTrade[] {
  return contacts
    .filter((item) => item.kind === 'craftsman' && item.houseId === houseId)
    .map((item) => ({
      id: item.id,
      displayName: item.displayName,
      trade: item.trade,
      phone: item.phone,
    }));
}

/**
 * First emergency contact on the rescue sheet.
 *
 * Preconditions: contacts of each person are already in call order.
 * Postconditions: null when nobody has a contact.
 * Data contract: name, phone and relationship only.
 *
 * @param sheet - Rescue sheet of the house.
 * @returns The contact, or null.
 */
export function primaryEmergencyContact(sheet: RescueSheet): PrintedContact | null {
  for (const person of sheet.residents) {
    const contact = person.contacts[0];
    if (contact !== undefined) {
      return {
        displayName: contact.displayName,
        phone: contact.phone,
        relationship: contact.relationship,
      };
    }
  }
  return null;
}

/**
 * Health facts for the folded strip.
 *
 * Preconditions: `sheet` is the rescue sheet of this house.
 * Postconditions: one entry per person, without the photograph.
 * Data contract: blood, mobility, bedroom, allergies, conditions and medicines.
 *
 * @param sheet - Rescue sheet.
 * @returns The strip.
 */
export function essentialPeople(sheet: RescueSheet): readonly EssentialPerson[] {
  return sheet.residents.map((person) => ({
    id: person.id,
    displayName: person.displayName,
    bloodGroup: person.bloodGroup,
    mobility: person.mobility,
    usualBedroom: person.usualBedroom,
    allergies: person.allergies,
    conditions: person.conditions,
    medicines: person.medicines.map((item) => ({ id: item.id, name: item.name, location: item.location })),
  }));
}

/**
 * Path of the public house page.
 *
 * @param token - Active token.
 * @returns An absolute path.
 */
export function housePagePath(token: string): string {
  return `/p/${token}`;
}

/**
 * Path of the public rescue sheet.
 *
 * @param token - Active token.
 * @returns An absolute path.
 */
export function rescuePagePath(token: string): string {
  return `/e/${token}`;
}

/**
 * Absolute address encoded in a printed code.
 *
 * Preconditions: `origin` is an absolute origin and `path` starts with `/`.
 * Postconditions: the result has no fragment and no query.
 * Data contract: origin plus path.
 *
 * @param origin - Page origin, for example `https://example.test`.
 * @param path - Path from {@link housePagePath} or {@link rescuePagePath}.
 * @returns The address.
 */
export function sheetUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
}

/**
 * The code to show for one kind: the active one, or the newest revoked one.
 *
 * Preconditions: `items` is newest first.
 * Postconditions: an active token wins over a newer revoked row only when the active row is present.
 * Data contract: the result is one of `items`, or null.
 *
 * @param items - Codes of the house.
 * @param kind - House page or rescue sheet.
 * @returns The code, or null when none exists.
 */
export function currentPublication(items: readonly Publication[], kind: PublicationKind): Publication | null {
  return (
    items.find((item) => item.kind === kind && item.token !== null) ??
    items.find((item) => item.kind === kind) ??
    null
  );
}
