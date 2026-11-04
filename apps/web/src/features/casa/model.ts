import type { MemberRole } from '@domusafe/contracts';
import { roleAllows } from '@/lib/permissions.js';

/** Manual subjects shown in the guest view of this slice. */
export const GUEST_TOPICS = ['wifi', 'intercom', 'parcels', 'pets', 'plants'] as const;
/** A guest-manual subject edited on the Casa screen. */
export type GuestTopic = (typeof GUEST_TOPICS)[number];

/** Cutoffs shown as large safety controls. */
export const SHUTOFF_KINDS = ['water', 'gas', 'electricity', 'boiler'] as const;
/** A cutoff kind shown in the technical view. */
export type ShownShutoff = (typeof SHUTOFF_KINDS)[number];

/** Utility contracts edited for the open house. Free includes all of them. */
export const SHOWN_UTILITIES = ['electricity', 'gas', 'internet', 'water'] as const;
/** A utility kind shown on the Casa screen. */
export type ShownUtility = (typeof SHOWN_UTILITIES)[number];

/** Weekday codes stored in a weekly recurrence rule. */
export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

/** Tabs of the Casa section, in screen order. */
export type CasaTab = 'guest' | 'technical' | 'utilities' | 'deadline' | 'houses';

/**
 * Tabs a role may open. Utilities stay available on the Free plan; the role, not the plan, hides them.
 *
 * Preconditions: `role` is the membership role.
 * Postconditions: the guest tab and the house details tab are always present.
 * Data contract: the result is a subset of {@link CasaTab} in screen order.
 *
 * @param role - Role inside the family.
 * @returns The tabs to render.
 */
export function casaTabs(role: MemberRole | undefined): readonly CasaTab[] {
  const tabs: CasaTab[] = ['guest'];
  if (role !== undefined && roleAllows(role, 'house.technical.read')) {
    tabs.push('technical');
  }
  if (role !== undefined && roleAllows(role, 'utilities.read')) {
    tabs.push('utilities');
  }
  if (role !== undefined && roleAllows(role, 'maintenance.read')) {
    tabs.push('deadline');
  }
  tabs.push('houses');
  return tabs;
}

/**
 * Builds a weekly recurrence from the selected weekdays.
 *
 * Preconditions: codes are members of {@link WEEKDAYS}.
 * Postconditions: an empty selection returns null.
 * Data contract: `FREQ=WEEKLY;BYDAY=MO,TU` in weekday order.
 *
 * @param days - Selected weekday codes.
 * @returns The rule, or null when no day is selected.
 */
export function weekdaysToRrule(days: readonly string[]): string | null {
  const ordered = WEEKDAYS.filter((day) => days.includes(day));
  if (ordered.length === 0) {
    return null;
  }
  return `FREQ=WEEKLY;BYDAY=${ordered.join(',')}`;
}

/**
 * Reads weekday codes from a weekly recurrence rule.
 *
 * Preconditions: none.
 * Postconditions: unknown codes are dropped.
 * Data contract: the result uses the codes of {@link WEEKDAYS}.
 *
 * @param rrule - Stored rule, or null.
 * @returns Weekday codes in rule order.
 */
export function rruleToWeekdays(rrule: string | null): string[] {
  const match = /BYDAY=([A-Z,]+)/.exec(rrule ?? '');
  const codes = match?.[1]?.split(',') ?? [];
  return codes.filter((code) => (WEEKDAYS as readonly string[]).includes(code));
}

/**
 * Phone link for a safety call. Only international numbers are accepted.
 *
 * Preconditions: none.
 * Postconditions: anything that is not an international number returns null.
 * Data contract: `tel:+…` with no other characters.
 *
 * @param phone - Stored phone, or null.
 * @returns A `tel` URL, or null.
 */
export function telHref(phone: string | null): string | null {
  if (phone === null || !/^\+[1-9]\d{1,14}$/.test(phone)) {
    return null;
  }
  return `tel:${phone}`;
}

/**
 * Calendar date in the browser's local zone, `YYYY-MM-DD`.
 *
 * Preconditions: none.
 * Postconditions: the string matches a calendar date.
 * Data contract: month and day are zero-padded.
 *
 * @param now - Instant to format. Defaults to the current time.
 * @returns The local calendar date.
 */
export function localDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

/**
 * UUIDv7 for rows whose identifier is generated in the browser.
 *
 * Preconditions: `crypto.getRandomValues` is available.
 * Postconditions: the result is a canonical lowercase version-7 UUID.
 * Data contract: the third group starts with 7 and the fourth with 8, 9, a or b.
 *
 * @param now - Unix milliseconds. Defaults to the current time.
 * @returns The identifier.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let time = Math.floor(now);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
