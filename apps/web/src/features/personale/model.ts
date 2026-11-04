import {
  BLOOD_GROUPS,
  MOBILITY_STATUSES,
  PET_SPECIES,
  TAX_ITEM_KEYS,
  TAX_ITEM_STATUSES,
  type MemberRole,
} from '@domusafe/contracts';
import { roleAllows } from '@/lib/permissions.js';
import { m } from '@/paraglide/messages.js';

/** Tabs of Personale, in screen order. */
export const PERSONALE_TABS = ['card', 'services', 'pets', 'taxes', 'accounts'] as const;
/** A tab of the Personale section. */
export type PersonaleTab = (typeof PERSONALE_TABS)[number];

/**
 * Tabs a role may open. Premium gates sit inside the tax and account tabs.
 *
 * @param role - Role inside the family.
 * @returns The tabs to render, in screen order.
 */
export function personaleTabs(role: MemberRole | undefined): readonly PersonaleTab[] {
  if (role === undefined) {
    return [];
  }
  const allowed = new Set<PersonaleTab>();
  if (roleAllows(role, 'residents.read')) {
    allowed.add('card');
    allowed.add('services');
    allowed.add('accounts');
  }
  if (roleAllows(role, 'pets.read')) {
    allowed.add('pets');
  }
  if (roleAllows(role, 'taxes.read')) {
    allowed.add('taxes');
  }
  return PERSONALE_TABS.filter((tab) => allowed.has(tab));
}

/**
 * Caption of a Personale tab.
 *
 * @param tab - Tab id.
 * @returns The translated caption.
 */
export function personaleTabLabel(tab: PersonaleTab): string {
  switch (tab) {
    case 'card':
      return m.personaleCard();
    case 'services':
      return m.personaleServices();
    case 'pets':
      return m.personalePets();
    case 'taxes':
      return m.personaleTaxes();
    case 'accounts':
      return m.personaleAccounts();
  }
}

/** Blood groups the form can store. */
export const BLOOD_OPTIONS = BLOOD_GROUPS;
/** Mobility values the form can store. */
export const MOBILITY_OPTIONS = MOBILITY_STATUSES;
/** Species the form can store. */
export const SPECIES_OPTIONS = PET_SPECIES;
/** Tax items, in catalogue order. */
export const TAX_OPTIONS = TAX_ITEM_KEYS;
/** Statuses of a tax item. */
export const TAX_STATUS_OPTIONS = TAX_ITEM_STATUSES;

type Blood = (typeof BLOOD_GROUPS)[number];
type MobilityStatus = (typeof MOBILITY_STATUSES)[number];
type Species = (typeof PET_SPECIES)[number];

/**
 * Caption of a blood group.
 *
 * @param value - Stored group, or null when unset.
 * @returns The full words.
 */
export function bloodLabel(value: Blood | null): string {
  switch (value) {
    case null:
      return m.personaleNotSet();
    case 'a_positive':
      return m.bloodAPositive();
    case 'a_negative':
      return m.bloodANegative();
    case 'b_positive':
      return m.bloodBPositive();
    case 'b_negative':
      return m.bloodBNegative();
    case 'ab_positive':
      return m.bloodAbPositive();
    case 'ab_negative':
      return m.bloodAbNegative();
    case 'o_positive':
      return m.bloodOPositive();
    case 'o_negative':
      return m.bloodONegative();
    case 'unknown':
      return m.bloodUnknown();
  }
}

/**
 * Caption of a mobility status.
 *
 * @param value - Stored status, or null when unset.
 * @returns The full words.
 */
export function mobilityLabel(value: MobilityStatus | null): string {
  switch (value) {
    case null:
      return m.personaleNotSet();
    case 'independent':
      return m.mobilityIndependent();
    case 'assisted':
      return m.mobilityAssisted();
    case 'wheelchair':
      return m.mobilityWheelchair();
    case 'bedridden':
      return m.mobilityBedridden();
  }
}

/**
 * Caption of a species.
 *
 * @param value - Stored species.
 * @returns The full word.
 */
export function speciesLabel(value: Species): string {
  switch (value) {
    case 'dog':
      return m.speciesDog();
    case 'cat':
      return m.speciesCat();
    case 'bird':
      return m.speciesBird();
    case 'fish':
      return m.speciesFish();
    case 'rabbit':
      return m.speciesRabbit();
    case 'rodent':
      return m.speciesRodent();
    case 'reptile':
      return m.speciesReptile();
    case 'horse':
      return m.speciesHorse();
    case 'other':
      return m.speciesOther();
  }
}

/**
 * Caption of a tax item. The indicator of the equivalent economic situation is written in full.
 *
 * @param key - Stable item key.
 * @returns The full words.
 */
export function taxLabel(key: (typeof TAX_ITEM_KEYS)[number]): string {
  switch (key) {
    case 'declaration':
      return m.taxDeclaration();
    case 'precompiled_return':
      return m.taxPrecompiled();
    case 'isee':
      return m.taxIsee();
    case 'property_tax':
      return m.taxProperty();
    case 'waste_tax':
      return m.taxWaste();
    case 'income_tax_first_instalment':
      return m.taxIncomeFirst();
    case 'income_tax_second_instalment':
      return m.taxIncomeSecond();
  }
}

/**
 * Caption of a tax status.
 *
 * @param status - Stored status.
 * @returns The full words.
 */
export function taxStatusLabel(status: (typeof TAX_ITEM_STATUSES)[number]): string {
  switch (status) {
    case 'todo':
      return m.taxTodo();
    case 'in_progress':
      return m.taxProgress();
    case 'done':
      return m.taxDone();
    case 'not_applicable':
      return m.taxSkipped();
  }
}

/**
 * Splits a textarea into trimmed lines.
 *
 * @param value - Raw text.
 * @returns Non-empty lines.
 */
export function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Joins stored lines for a textarea.
 *
 * @param values - Stored phrases.
 * @returns One phrase per line.
 */
export function listToLines(values: readonly string[]): string {
  return values.join('\n');
}

/**
 * Builds a telephone link when the number is international.
 *
 * @param phone - Stored number, or null.
 * @returns A `tel:` link, or null.
 */
export function telHref(phone: string | null): string | null {
  if (phone === null || !/^\+[1-9]\d{1,14}$/.test(phone)) {
    return null;
  }
  return `tel:${phone}`;
}
