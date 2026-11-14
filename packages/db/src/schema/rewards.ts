import { sql } from 'drizzle-orm';
import { boolean, date, integer, pgTable, primaryKey, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { instant } from '../columns.js';
import {
  choreAssignmentEnum,
  choreCompletionStatusEnum,
  pointSourceEnum,
  rewardRedemptionStatusEnum,
} from './enums.js';

/**
 * A recurring or one-shot family chore with points and optional parent approval.
 * Soft-deleted with `deleted_at`; house scope is optional.
 */
export const chores = pgTable('chores', {
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
  title: text('title').notNull(),
  description: text('description'),
  rrule: text('rrule'),
  points: smallint('points').notNull().default(1),
  assignment: choreAssignmentEnum('assignment').notNull().default('fixed'),
  assignedResidentIds: uuid('assigned_resident_ids')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  nextDueDate: date('next_due_date', { mode: 'string' }),
  requiresApproval: boolean('requires_approval').notNull().default(true),
  active: boolean('active').notNull().default(true),
  deletedAt: instant('deleted_at'),
});

/**
 * One completion of a chore by a resident for a due date.
 * Optional proof photo is a small image data address for parent review.
 */
export const choreCompletions = pgTable('chore_completions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  familyId: uuid('family_id').notNull(),
  choreId: uuid('chore_id').notNull(),
  residentId: uuid('resident_id').notNull(),
  dueDate: date('due_date', { mode: 'string' }).notNull(),
  completedAt: instant('completed_at').notNull().defaultNow(),
  status: choreCompletionStatusEnum('status').notNull().default('pending_approval'),
  decidedBy: uuid('decided_by'),
  decidedAt: instant('decided_at'),
  pointsAwarded: smallint('points_awarded').notNull().default(0),
  proofPhotoDataUrl: text('proof_photo_data_url'),
  note: text('note'),
  createdBy: uuid('created_by'),
});

/**
 * Append-only ledger row that changes a resident's point balance.
 * Balance is the sum of `delta` for the resident.
 */
export const pointEntries = pgTable('point_entries', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  familyId: uuid('family_id').notNull(),
  residentId: uuid('resident_id').notNull(),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),
  source: pointSourceEnum('source').notNull(),
  sourceId: uuid('source_id'),
  createdBy: uuid('created_by'),
  approvedBy: uuid('approved_by'),
  createdAt: instant('created_at').notNull().defaultNow(),
});

/**
 * A redeemable item in the family rewards store.
 * `stock` null means unlimited; soft-deleted with `deleted_at`.
 */
export const rewards = pgTable('rewards', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  costPoints: integer('cost_points').notNull(),
  stock: integer('stock'),
  active: boolean('active').notNull().default(true),
  deletedAt: instant('deleted_at'),
});

/**
 * A request to redeem a reward for points, awaiting parent decision.
 */
export const rewardRedemptions = pgTable('reward_redemptions', {
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
  rewardId: uuid('reward_id').notNull(),
  status: rewardRedemptionStatusEnum('status').notNull().default('requested'),
  decidedBy: uuid('decided_by'),
  decidedAt: instant('decided_at'),
  pointEntryId: uuid('point_entry_id'),
});

/**
 * Consecutive-day streak for one resident in the family kids economy.
 * Updated when a chore completion is approved.
 */
export const residentStreaks = pgTable(
  'resident_streaks',
  {
    familyId: uuid('family_id').notNull(),
    residentId: uuid('resident_id').notNull(),
    currentDays: integer('current_days').notNull().default(0),
    bestDays: integer('best_days').notNull().default(0),
    lastCompletedOn: date('last_completed_on', { mode: 'string' }),
  },
  (table) => [primaryKey({ columns: [table.familyId, table.residentId] })],
);
