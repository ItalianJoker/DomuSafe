import { z } from 'zod';
import { calendarDate, shiftCalendarDate, type DeadlineKind, DEADLINE_KINDS } from './deadlines.js';
import { instantSchema, localDateSchema, pageSchema, timeZoneSchema, uuidSchema } from './common.js';

/** Category of a family calendar appointment. */
export const CALENDAR_CATEGORIES = [
  'appointment',
  'school',
  'work',
  'health',
  'birthday',
  'holiday',
  'other',
] as const;
/** Category of a family calendar appointment. */
export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number];

/** How a calendar event entered the family calendar. */
export const CALENDAR_SOURCES = ['internal', 'ics_import'] as const;
/** How a calendar event entered the family calendar. */
export type CalendarSource = (typeof CALENDAR_SOURCES)[number];

/** Origin of one row on the family calendar board. */
export const CALENDAR_OCCURRENCE_KINDS = ['event', 'chore', 'deadline', 'timetable'] as const;
/** Origin of one row on the family calendar board. */
export type CalendarOccurrenceKind = (typeof CALENDAR_OCCURRENCE_KINDS)[number];

/** Visibility of a stored calendar event. */
export const CALENDAR_VISIBILITIES = ['family', 'personal'] as const;
/** Visibility of a stored calendar event. */
export type CalendarVisibility = (typeof CALENDAR_VISIBILITIES)[number];

const categorySchema = z.enum(CALENDAR_CATEGORIES);
const sourceSchema = z.enum(CALENDAR_SOURCES);
const visibilitySchema = z.enum(CALENDAR_VISIBILITIES);
const titleSchema = z.string().trim().min(1).max(200);
const shortTitleSchema = z.string().trim().min(1).max(140);
const descriptionSchema = z.string().trim().max(4000);
const locationSchema = z.string().trim().min(1).max(300);
const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');
const rruleSchema = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .regex(/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,-]+)*$/, 'Invalid recurrence');
const residentIdsSchema = z.array(uuidSchema).max(32);
const limitField = z.coerce.number().int().min(1).max(200).default(50);
const cursorField = z.string().max(512).optional();

/** Maximum inclusive span of a calendar board or export query, in days. */
export const CALENDAR_RANGE_MAX_DAYS = 366;

function atLeastOneField(value: object): boolean {
  return Object.keys(value).length > 0;
}

/**
 * Ensures `to` is on or after `from` and the inclusive span is at most {@link CALENDAR_RANGE_MAX_DAYS}.
 *
 * Preconditions: both values look like calendar dates.
 * Postconditions: invalid ranges are rejected by Zod.
 * Data contract: inclusive day count is `(to - from) + 1`.
 *
 * @param from - Range start.
 * @param to - Range end.
 * @returns Whether the range is accepted.
 */
export function isValidCalendarRange(from: string, to: string): boolean {
  if (calendarDate(from) === null || calendarDate(to) === null || to < from) {
    return false;
  }
  const limit = shiftCalendarDate(from, CALENDAR_RANGE_MAX_DAYS - 1);
  return to <= limit;
}

const calendarRangeRefine = (value: { from: string; to: string }, ctx: z.RefinementCtx): void => {
  if (!isValidCalendarRange(value.from, value.to)) {
    ctx.addIssue({
      code: 'custom',
      message: `Expected from ≤ to and at most ${String(CALENDAR_RANGE_MAX_DAYS)} days`,
      path: ['to'],
    });
  }
};

/** Path parameters of one calendar event. */
export const calendarEventParamsSchema = z.object({ familyId: uuidSchema, eventId: uuidSchema }).strict();
/** Path parameters of one calendar event. */
export type CalendarEventParams = z.infer<typeof calendarEventParamsSchema>;

/** Path parameters of one timetable slot. */
export const timetableSlotParamsSchema = z.object({ familyId: uuidSchema, slotId: uuidSchema }).strict();
/** Path parameters of one timetable slot. */
export type TimetableSlotParams = z.infer<typeof timetableSlotParamsSchema>;

/** Query of the calendar board and of the calendar-file export. */
export const calendarBoardQuerySchema = z
  .object({
    from: localDateSchema,
    to: localDateSchema,
    houseId: uuidSchema,
  })
  .strict()
  .superRefine(calendarRangeRefine);
/** Query of the calendar board and of the calendar-file export. */
export type CalendarBoardQuery = z.infer<typeof calendarBoardQuerySchema>;

/** Query of the stored event list. */
export const calendarEventListQuerySchema = z
  .object({
    from: localDateSchema,
    to: localDateSchema,
    houseId: uuidSchema.optional(),
    limit: limitField,
    cursor: cursorField,
  })
  .strict()
  .superRefine(calendarRangeRefine);
/** Query of the stored event list. */
export type CalendarEventListQuery = z.infer<typeof calendarEventListQuerySchema>;

/** Query of the timetable list. */
export const timetableListQuerySchema = z
  .object({
    residentId: uuidSchema.optional(),
    limit: limitField,
    cursor: cursorField,
  })
  .strict();
/** Query of the timetable list. */
export type TimetableListQuery = z.infer<typeof timetableListQuerySchema>;

/** One stored family calendar event. */
export const calendarEventSchema = z
  .object({
    id: uuidSchema,
    version: z.int().min(1),
    familyId: uuidSchema,
    houseId: uuidSchema.nullable(),
    visibility: visibilitySchema,
    ownerAccountId: uuidSchema.nullable(),
    title: titleSchema,
    description: z.string().max(4000).nullable(),
    location: z.string().max(300).nullable(),
    startsAt: instantSchema,
    endsAt: instantSchema,
    allDay: z.boolean(),
    timezone: timeZoneSchema,
    rrule: z.string().max(400).nullable(),
    exdates: z.array(localDateSchema).max(366),
    category: categorySchema,
    source: sourceSchema,
    icsUid: z.string().max(200).nullable(),
    icsSourceLabel: z.string().max(120).nullable(),
    residentIds: residentIdsSchema,
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'CalendarEvent' });
/** One stored family calendar event. */
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

/** Page of stored calendar events. */
export const calendarEventPageSchema = pageSchema(calendarEventSchema).meta({
  id: 'CalendarEventPage',
});
/** Page of stored calendar events. */
export type CalendarEventPage = z.infer<typeof calendarEventPageSchema>;

/** Body that creates a calendar event. */
export const createCalendarEventRequestSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.optional(),
    location: locationSchema.optional(),
    startsAt: instantSchema,
    endsAt: instantSchema,
    allDay: z.boolean().default(false),
    timezone: timeZoneSchema.optional(),
    rrule: rruleSchema.optional(),
    exdates: z.array(localDateSchema).max(366).optional(),
    category: categorySchema.default('other'),
    houseId: uuidSchema.optional(),
    visibility: visibilitySchema.default('family'),
    residentIds: residentIdsSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Date.parse(value.endsAt) < Date.parse(value.startsAt)) {
      ctx.addIssue({ code: 'custom', message: 'endsAt must be on or after startsAt', path: ['endsAt'] });
    }
  })
  .meta({ id: 'CreateCalendarEventRequest' });
/** Body that creates a calendar event. */
export type CreateCalendarEventRequest = z.infer<typeof createCalendarEventRequestSchema>;

/** Body that updates a calendar event. */
export const updateCalendarEventRequestSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    location: locationSchema.nullable().optional(),
    startsAt: instantSchema.optional(),
    endsAt: instantSchema.optional(),
    allDay: z.boolean().optional(),
    timezone: timeZoneSchema.optional(),
    rrule: rruleSchema.nullable().optional(),
    exdates: z.array(localDateSchema).max(366).optional(),
    category: categorySchema.optional(),
    houseId: uuidSchema.nullable().optional(),
    visibility: visibilitySchema.optional(),
    residentIds: residentIdsSchema.optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .meta({ id: 'UpdateCalendarEventRequest' });
/** Body that updates a calendar event. */
export type UpdateCalendarEventRequest = z.infer<typeof updateCalendarEventRequestSchema>;

/** One weekly timetable slot. */
export const timetableSlotSchema = z
  .object({
    id: uuidSchema,
    version: z.int().min(1),
    familyId: uuidSchema,
    residentId: uuidSchema,
    weekday: z.int().min(1).max(7),
    startsAt: clockTimeSchema,
    endsAt: clockTimeSchema,
    title: shortTitleSchema,
    location: z.string().max(300).nullable(),
    validFrom: localDateSchema.nullable(),
    validTo: localDateSchema.nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'TimetableSlot' });
/** One weekly timetable slot. */
export type TimetableSlot = z.infer<typeof timetableSlotSchema>;

/** Page of timetable slots. */
export const timetableSlotPageSchema = pageSchema(timetableSlotSchema).meta({
  id: 'TimetableSlotPage',
});
/** Page of timetable slots. */
export type TimetableSlotPage = z.infer<typeof timetableSlotPageSchema>;

/** Body that creates a timetable slot. */
export const createTimetableSlotRequestSchema = z
  .object({
    residentId: uuidSchema,
    weekday: z.int().min(1).max(7),
    startsAt: clockTimeSchema,
    endsAt: clockTimeSchema,
    title: shortTitleSchema,
    location: locationSchema.optional(),
    validFrom: localDateSchema.optional(),
    validTo: localDateSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.endsAt <= value.startsAt) {
      ctx.addIssue({ code: 'custom', message: 'endsAt must be after startsAt', path: ['endsAt'] });
    }
    if (value.validFrom !== undefined && value.validTo !== undefined && value.validTo < value.validFrom) {
      ctx.addIssue({ code: 'custom', message: 'validTo must be on or after validFrom', path: ['validTo'] });
    }
  })
  .meta({ id: 'CreateTimetableSlotRequest' });
/** Body that creates a timetable slot. */
export type CreateTimetableSlotRequest = z.infer<typeof createTimetableSlotRequestSchema>;

/** Body that updates a timetable slot. */
export const updateTimetableSlotRequestSchema = z
  .object({
    weekday: z.int().min(1).max(7).optional(),
    startsAt: clockTimeSchema.optional(),
    endsAt: clockTimeSchema.optional(),
    title: shortTitleSchema.optional(),
    location: locationSchema.nullable().optional(),
    validFrom: localDateSchema.nullable().optional(),
    validTo: localDateSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .meta({ id: 'UpdateTimetableSlotRequest' });
/** Body that updates a timetable slot. */
export type UpdateTimetableSlotRequest = z.infer<typeof updateTimetableSlotRequestSchema>;

/** One occurrence on the family calendar board (appointment, schedule, chore or deadline). */
export const calendarOccurrenceSchema = z
  .object({
    id: z.string().min(1).max(120),
    kind: z.enum(CALENDAR_OCCURRENCE_KINDS),
    sourceId: uuidSchema,
    title: z.string().min(1).max(200),
    description: z.string().max(4000).nullable(),
    location: z.string().max(300).nullable(),
    startDate: localDateSchema,
    endDate: localDateSchema,
    startTime: clockTimeSchema.nullable(),
    endTime: clockTimeSchema.nullable(),
    allDay: z.boolean(),
    category: categorySchema.nullable(),
    deadlineKind: z.enum(DEADLINE_KINDS).nullable(),
    houseId: uuidSchema.nullable(),
    residentIds: residentIdsSchema,
    version: z.int().min(1).nullable(),
  })
  .strict()
  .meta({ id: 'CalendarOccurrence' });
/** One occurrence on the family calendar board. */
export type CalendarOccurrence = z.infer<typeof calendarOccurrenceSchema>;

/** Response of `GET /families/{familyId}/calendar`. */
export const calendarBoardSchema = z
  .object({
    timezone: timeZoneSchema,
    from: localDateSchema,
    to: localDateSchema,
    items: z.array(calendarOccurrenceSchema).max(5_000),
  })
  .strict()
  .meta({ id: 'CalendarBoard' });
/** Response of `GET /families/{familyId}/calendar`. */
export type CalendarBoard = z.infer<typeof calendarBoardSchema>;

/**
 * Response of `GET /families/{familyId}/calendar/export`.
 * The browser saves `body` as a downloadable calendar file (`.ics`).
 */
export const calendarExportSchema = z
  .object({
    filename: z.string().min(1).max(120),
    mediaType: z.literal('text/calendar'),
    body: z.string().min(1).max(2_000_000),
  })
  .strict()
  .meta({ id: 'CalendarExport' });
/** Response of `GET /families/{familyId}/calendar/export`. */
export type CalendarExport = z.infer<typeof calendarExportSchema>;

/** Re-export for callers that need deadline kinds next to calendar types. */
export type { DeadlineKind };
