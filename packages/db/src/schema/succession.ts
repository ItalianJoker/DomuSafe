import { sql } from 'drizzle-orm';
import { boolean, integer, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { instant } from '../columns.js';
import { successionKindEnum } from './enums.js';

/**
 * One activity of the family succession checklist.
 *
 * The row is family data, not a vault envelope: the inheritance kit is printed from these
 * columns and never from vault ciphertext. Titles and notes cannot hold a run of eight digits.
 */
export const successionItems = pgTable('succession_items', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  kind: successionKindEnum('kind').notNull(),
  title: text('title'),
  notes: text('notes'),
  deadlineNote: text('deadline_note'),
  done: boolean('done').notNull().default(false),
  completedAt: instant('completed_at'),
  sortOrder: smallint('sort_order').notNull().default(0),
  deletedAt: instant('deleted_at'),
});
