import { z } from 'zod';
import { localDateSchema, timeZoneSchema, uuidSchema } from './common.js';
import { TAX_ITEM_KEYS } from './personale.js';
import { SUCCESSION_KINDS } from './succession.js';

/**
 * Where a deadline on the overview comes from.
 * Vehicle and tax rows can contribute more than one date, so the kind tells them apart.
 */
export const DEADLINE_KINDS = [
  'maintenance',
  'vehicle_insurance',
  'vehicle_road_tax',
  'vehicle_inspection',
  'tax',
  'succession',
] as const;
/** One deadline source. */
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

/** The three overview groups. A later date is omitted. */
export const DEADLINE_GROUPS = ['overdue', 'week', 'month'] as const;
/** One overview group. */
export type DeadlineGroup = (typeof DEADLINE_GROUPS)[number];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whether `value` is a real calendar date.
 *
 * Preconditions: none.
 * Postconditions: February 31 and a one-digit month are rejected.
 * Data contract: the result is `YYYY-MM-DD` or null.
 *
 * @param value - Text that might be a date.
 * @returns The date, or null when it is not a real calendar day.
 */
export function calendarDate(value: string): string | null {
  const match = ISO_DATE.exec(value);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Reads a succession reminder only when the family stored a real date.
 * A phrase such as "within twelve months" is a hint, not a deadline.
 *
 * Preconditions: none.
 * Postconditions: surrounding spaces are ignored.
 * Data contract: the result is `YYYY-MM-DD` or null.
 *
 * @param note - Stored reminder, or null.
 * @returns The calendar date, or null.
 */
export function successionCalendarDate(note: string | null): string | null {
  if (note === null) {
    return null;
  }
  return calendarDate(note.trim());
}

/**
 * Calendar date of an instant in an IANA time zone.
 *
 * Preconditions: `timeZone` is a time zone the runtime accepts.
 * Postconditions: the result is `YYYY-MM-DD`.
 * Data contract: the date follows that zone, not UTC.
 *
 * @param instant - Instant to place on a calendar.
 * @param timeZone - Family time zone, for example `Europe/Rome`.
 * @returns The calendar date.
 */
export function calendarDateInTimeZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('Calendar date parts missing');
  }
  return `${year}-${month}-${day}`;
}

/**
 * Moves a calendar date by a number of days.
 *
 * Preconditions: `iso` is a real `YYYY-MM-DD` date.
 * Postconditions: the result is a real calendar date.
 * Data contract: the shift uses UTC dates so a time zone cannot skip a day.
 *
 * @param iso - Start date.
 * @param days - Days to add. Negative values move backward.
 * @returns The shifted date.
 */
export function shiftCalendarDate(iso: string, days: number): string {
  const parsed = calendarDate(iso);
  if (parsed === null) {
    throw new Error('Expected a calendar date');
  }
  const [year, month, day] = parsed.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Sunday that ends the week containing `today`. Weeks start on Monday.
 *
 * Preconditions: `today` is a real calendar date.
 * Postconditions: the result is that Sunday, which may fall in the next month.
 * Data contract: `YYYY-MM-DD`.
 *
 * @param today - Calendar date in the family time zone.
 * @returns The Sunday of that week.
 */
export function endOfWeek(today: string): string {
  const parsed = calendarDate(today);
  if (parsed === null) {
    throw new Error('Expected a calendar date');
  }
  const [year, month, day] = parsed.split('-').map((part) => Number(part));
  const weekday = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay();
  const untilSunday = weekday === 0 ? 0 : 7 - weekday;
  return shiftCalendarDate(parsed, untilSunday);
}

/**
 * Last calendar day of the month that contains `today`.
 *
 * Preconditions: `today` is a real calendar date.
 * Postconditions: the result is in the same month.
 * Data contract: `YYYY-MM-DD`.
 *
 * @param today - Calendar date in the family time zone.
 * @returns The last day of that month.
 */
export function endOfMonth(today: string): string {
  const parsed = calendarDate(today);
  if (parsed === null) {
    throw new Error('Expected a calendar date');
  }
  const [year, month] = parsed.split('-').map((part) => Number(part));
  const last = new Date(Date.UTC(year ?? 0, month ?? 1, 0));
  return last.toISOString().slice(0, 10);
}

/**
 * Places one due date into the overview.
 * Overdue is before today. This week runs through Sunday, even into the next month.
 * This month is the rest of the current month after that Sunday. Later dates are left out.
 *
 * Preconditions: both values are real `YYYY-MM-DD` dates.
 * Postconditions: a date is in at most one group.
 * Data contract: `null` means the date is after this month.
 *
 * @param dueDate - Stored due date.
 * @param today - Today in the family time zone.
 * @returns The group, or null.
 */
export function deadlineGroup(dueDate: string, today: string): DeadlineGroup | null {
  if (dueDate < today) {
    return 'overdue';
  }
  if (dueDate <= endOfWeek(today)) {
    return 'week';
  }
  if (dueDate <= endOfMonth(today)) {
    return 'month';
  }
  return null;
}

/** One dated row on the overview. Titles that the interface translates stay as stable keys. */
export const deadlineItemSchema = z
  .object({
    kind: z.enum(DEADLINE_KINDS),
    sourceId: uuidSchema,
    dueDate: localDateSchema,
    title: z.string().min(1).max(200).nullable(),
    detail: z.string().min(1).max(80).nullable(),
    taxItemKey: z.enum(TAX_ITEM_KEYS).nullable(),
    successionKind: z.enum(SUCCESSION_KINDS).nullable(),
    version: z.int().min(1).nullable(),
    houseId: uuidSchema.nullable(),
  })
  .strict()
  .meta({ id: 'DeadlineItem' });
/** One dated row on the overview. */
export type DeadlineItem = z.infer<typeof deadlineItemSchema>;

/** Response of `GET /families/{familyId}/deadlines`. */
export const deadlineBoardSchema = z
  .object({
    timezone: timeZoneSchema,
    today: localDateSchema,
    overdue: z.array(deadlineItemSchema),
    week: z.array(deadlineItemSchema),
    month: z.array(deadlineItemSchema),
  })
  .strict()
  .meta({ id: 'DeadlineBoard' });
/** Response of `GET /families/{familyId}/deadlines`. */
export type DeadlineBoard = z.infer<typeof deadlineBoardSchema>;

/** Query of `GET /families/{familyId}/deadlines`. */
export const deadlineListQuerySchema = z
  .object({
    houseId: uuidSchema,
  })
  .strict();
/** Query of `GET /families/{familyId}/deadlines`. */
export type DeadlineListQuery = z.infer<typeof deadlineListQuerySchema>;
