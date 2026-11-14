import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { instant } from '../columns.js';
import {
  finAccountSubtypeEnum,
  finAccountTypeEnum,
  finBudgetPeriodEnum,
  finTransactionStatusEnum,
  visibilityEnum,
} from './enums.js';

/** One balanced posting line inside a recurring template. */
export interface FinRecurringPostingTemplate {
  readonly accountId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly memo: string | null;
}

/** Body of a recurring transaction template. */
export interface FinRecurringTemplate {
  readonly description: string;
  readonly payee: string | null;
  readonly tags: readonly string[];
  readonly notes: string | null;
  readonly postings: readonly FinRecurringPostingTemplate[];
}

/**
 * European Central Bank (or other) foreign-exchange reference rate for one day.
 * Global catalogue; not tenant-scoped.
 */
export const fxRates = pgTable(
  'fx_rates',
  {
    base: char('base', { length: 3 }).notNull().default('EUR'),
    quote: char('quote', { length: 3 }).notNull(),
    rateDate: date('rate_date').notNull(),
    rate: numeric('rate').notNull(),
    source: text('source').notNull().default('ecb'),
  },
  (table) => [primaryKey({ columns: [table.base, table.quote, table.rateDate] })],
);

/**
 * One ledger account (asset, liability, equity, income or expense).
 * Soft-deleted with `deleted_at`. Piggy banks require a resident.
 */
export const finAccounts = pgTable(
  'fin_accounts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    version: integer('version').notNull().default(1),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    familyId: uuid('family_id').notNull(),
    visibility: visibilityEnum('visibility').notNull().default('family'),
    ownerAccountId: uuid('owner_account_id'),
    residentId: uuid('resident_id'),
    type: finAccountTypeEnum('type').notNull(),
    subtype: finAccountSubtypeEnum('subtype').notNull(),
    name: text('name').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    parentId: uuid('parent_id'),
    archivedAt: instant('archived_at'),
    deletedAt: instant('deleted_at'),
  },
  (table) => [unique().on(table.familyId, table.id)],
);

/**
 * One double-entry transaction header.
 * Soft-deleted with `deleted_at`. Balance is enforced on `fin_postings`.
 */
export const finTransactions = pgTable(
  'fin_transactions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    version: integer('version').notNull().default(1),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    familyId: uuid('family_id').notNull(),
    bookedOn: date('booked_on').notNull(),
    description: text('description').notNull(),
    payee: text('payee'),
    status: finTransactionStatusEnum('status').notNull().default('cleared'),
    recurringId: uuid('recurring_id'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notes: text('notes'),
    deletedAt: instant('deleted_at'),
  },
  (table) => [unique().on(table.familyId, table.id)],
);

/**
 * One signed posting line of a finance transaction.
 * Amounts must sum to zero per currency; currency must match the account.
 */
export const finPostings = pgTable(
  'fin_postings',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    familyId: uuid('family_id').notNull(),
    transactionId: uuid('transaction_id').notNull(),
    accountId: uuid('account_id').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    fxRate: numeric('fx_rate').notNull().default('1'),
    baseAmountMinor: bigint('base_amount_minor', { mode: 'number' }).notNull(),
    memo: text('memo'),
  },
  (table) => [unique().on(table.familyId, table.id)],
);

/**
 * A spending limit on an expense (or income) category account for a period.
 */
export const finBudgets = pgTable(
  'fin_budgets',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    version: integer('version').notNull().default(1),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    familyId: uuid('family_id').notNull(),
    accountId: uuid('account_id').notNull(),
    period: finBudgetPeriodEnum('period').notNull(),
    startsOn: date('starts_on').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    rollover: boolean('rollover').notNull().default(false),
    deletedAt: instant('deleted_at'),
  },
  (table) => [unique().on(table.familyId, table.id)],
);

/**
 * A savings goal tied to a savings or piggy-bank account.
 */
export const finSavingsGoals = pgTable(
  'fin_savings_goals',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    version: integer('version').notNull().default(1),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    familyId: uuid('family_id').notNull(),
    residentId: uuid('resident_id'),
    accountId: uuid('account_id').notNull(),
    name: text('name').notNull(),
    targetMinor: bigint('target_minor', { mode: 'number' }).notNull(),
    targetDate: date('target_date'),
    deletedAt: instant('deleted_at'),
  },
  (table) => [unique().on(table.familyId, table.id)],
);

/**
 * A recurring transaction template that can materialise ledger rows.
 */
export const finRecurring = pgTable(
  'fin_recurring',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    version: integer('version').notNull().default(1),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    familyId: uuid('family_id').notNull(),
    description: text('description').notNull(),
    rrule: text('rrule').notNull(),
    nextRunOn: date('next_run_on').notNull(),
    endOn: date('end_on'),
    template: jsonb('template').$type<FinRecurringTemplate>().notNull(),
    autoPost: boolean('auto_post').notNull().default(false),
    active: boolean('active').notNull().default(true),
    deletedAt: instant('deleted_at'),
  },
  (table) => [unique().on(table.familyId, table.id)],
);

/**
 * One member's share of a split expense on a transaction.
 */
export const finSplitShares = pgTable(
  'fin_split_shares',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    familyId: uuid('family_id').notNull(),
    transactionId: uuid('transaction_id').notNull(),
    residentId: uuid('resident_id').notNull(),
    shareMinor: bigint('share_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    settledTransactionId: uuid('settled_transaction_id'),
  },
  (table) => [unique().on(table.familyId, table.id)],
);
