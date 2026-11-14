import { sql } from 'drizzle-orm';
import { boolean, date, integer, pgTable, primaryKey, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { instant } from '../columns.js';
import { calendarCategoryEnum, calendarSourceEnum, visibilityEnum } from './enums.js';

/**
 * A family calendar appointment or all-day entry.
 * Soft-deleted with `deleted_at`; optional house and resident links.
 */
export const calendarEvents = pgTable('calendar_events', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id'),
  visibility: visibilityEnum('visibility').notNull().default('family'),
  ownerAccountId: uuid('owner_account_id'),
  title: text('title').notNull(),
  description: text('description'),
  location: text('location'),
  startsAt: instant('starts_at').notNull(),
  endsAt: instant('ends_at').notNull(),
  allDay: boolean('all_day').notNull().default(false),
  timezone: text('timezone').notNull(),
  rrule: text('rrule'),
  exdates: date('exdates', { mode: 'string' })
    .array()
    .notNull()
    .default(sql`'{}'::date[]`),
  category: calendarCategoryEnum('category').notNull().default('other'),
  source: calendarSourceEnum('source').notNull().default('internal'),
  icsUid: text('ics_uid'),
  icsSourceLabel: text('ics_source_label'),
  deletedAt: instant('deleted_at'),
});

/**
 * Residents linked to a calendar event.
 * Composite foreign keys keep the row inside the same family.
 */
export const calendarEventResidents = pgTable(
  'calendar_event_residents',
  {
    familyId: uuid('family_id').notNull(),
    eventId: uuid('event_id').notNull(),
    residentId: uuid('resident_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.residentId] })],
);

/**
 * A weekly timetable slot for one resident (school, work, therapy, and similar).
 * Soft-deleted with `deleted_at`. Weekday is ISO 1–7 (Monday–Sunday).
 */
export const timetableSlots = pgTable('timetable_slots', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  residentId: uuid('resident_id').notNull(),
  weekday: smallint('weekday').notNull(),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  title: text('title').notNull(),
  location: text('location'),
  validFrom: date('valid_from', { mode: 'string' }),
  validTo: date('valid_to', { mode: 'string' }),
  deletedAt: instant('deleted_at'),
});
