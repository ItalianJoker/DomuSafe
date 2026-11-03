import { sql } from 'drizzle-orm';
import { boolean, char, integer, jsonb, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { bytea, instant } from '../columns.js';
import {
  kioskProfileEnum,
  memberRoleEnum,
  membershipStatusEnum,
  planSourceEnum,
  planTierEnum,
  residentKindEnum,
} from './enums.js';
import { authUsers } from './identity.js';

/** Families (tenants). */
export const families = pgTable('families', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  name: text('name').notNull(),
  ownerAccountId: uuid('owner_account_id')
    .notNull()
    .references(() => authUsers.id),
  plan: planTierEnum('plan').notNull().default('free'),
  planSource: planSourceEnum('plan_source').notNull().default('default'),
  timezone: text('timezone').notNull().default('Europe/Rome'),
  baseCurrency: char('base_currency', { length: 3 }).notNull().default('EUR'),
  locale: text('locale', { enum: ['it', 'en'] })
    .notNull()
    .default('it'),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  deletedAt: instant('deleted_at'),
});

/** Account membership in a family with role and scope. */
export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  familyId: uuid('family_id')
    .notNull()
    .references(() => families.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  role: memberRoleEnum('role').notNull(),
  status: membershipStatusEnum('status').notNull().default('active'),
  allHouses: boolean('all_houses').notNull().default(true),
  allResidents: boolean('all_residents').notNull().default(true),
  vaultFamily: boolean('vault_family').notNull().default(false),
  expiresAt: instant('expires_at'),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

/** Houses of a family. */
export const houses = pgTable('houses', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  familyId: uuid('family_id')
    .notNull()
    .references(() => families.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  addressLine: text('address_line'),
  postalCode: text('postal_code'),
  city: text('city'),
  province: text('province'),
  country: char('country', { length: 2 }).notNull().default('IT'),
  coverFileId: uuid('cover_file_id'),
  sortOrder: smallint('sort_order').notNull().default(0),
  planLockedAt: instant('plan_locked_at'),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  deletedAt: instant('deleted_at'),
});

/** Residents (people, with or without an account). */
export const residents = pgTable('residents', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  familyId: uuid('family_id')
    .notNull()
    .references(() => families.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  kind: residentKindEnum('kind').notNull().default('adult'),
  accountId: uuid('account_id'),
  color: char('color', { length: 7 }).notNull().default('#3f6e8c'),
  avatarFileId: uuid('avatar_file_id'),
  sortOrder: smallint('sort_order').notNull().default(0),
  planLockedAt: instant('plan_locked_at'),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  deletedAt: instant('deleted_at'),
});

/** Resident ↔ house assignment. */
export const residentHouses = pgTable('resident_houses', {
  familyId: uuid('family_id').notNull(),
  residentId: uuid('resident_id').notNull(),
  houseId: uuid('house_id').notNull(),
});

/** Houses assigned to a restricted membership (Caregiver, Guest). */
export const membershipHouses = pgTable('membership_houses', {
  membershipId: uuid('membership_id').notNull(),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id').notNull(),
});

/** Residents assigned to a restricted membership (Caregiver). */
export const membershipResidents = pgTable('membership_residents', {
  membershipId: uuid('membership_id').notNull(),
  familyId: uuid('family_id').notNull(),
  residentId: uuid('resident_id').notNull(),
});

/** One-time Premium trial per account. */
export const premiumTrials = pgTable('premium_trials', {
  accountId: uuid('account_id').primaryKey(),
  familyId: uuid('family_id').notNull(),
  startedAt: instant('started_at').notNull().defaultNow(),
  endsAt: instant('ends_at').notNull(),
});

/** Kiosk tablets registered by an administrator. */
export const kioskDevices = pgTable('kiosk_devices', {
  id: uuid('id').primaryKey(),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id').notNull(),
  name: text('name').notNull(),
  profile: kioskProfileEnum('profile').notNull().default('standard'),
  residentId: uuid('resident_id'),
  credentialHash: bytea('credential_hash').notNull(),
  publicKey: bytea('public_key').notNull(),
  layout: jsonb('layout').$type<Record<string, unknown>>().notNull().default({ widgets: [] }),
  idleReturnSeconds: smallint('idle_return_seconds').notNull().default(120),
  lastSeenAt: instant('last_seen_at'),
  revokedAt: instant('revoked_at'),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});
