import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  date,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { bytea, citext, instant } from '../columns.js';
import {
  billingFrequencyEnum,
  contactKindEnum,
  guideAudienceEnum,
  guideTopicEnum,
  maintenanceCategoryEnum,
  maintenancePriorityEnum,
  shutoffKindEnum,
  utilityKindEnum,
  visibilityEnum,
  wasteFractionEnum,
} from './enums.js';

const customFields = () => jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({});

/** Guest and technical entries of the house manual. Identifiers are generated in the browser. */
export const houseGuideEntries = pgTable('house_guide_entries', {
  id: uuid('id').primaryKey(),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id').notNull(),
  audience: guideAudienceEnum('audience').notNull(),
  topic: guideTopicEnum('topic').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  sortOrder: smallint('sort_order').notNull().default(0),
  customFields: customFields(),
  deletedAt: instant('deleted_at'),
  encScopeId: uuid('enc_scope_id'),
  encKeyVersion: integer('enc_key_version'),
  encDek: bytea('enc_dek'),
  encPayload: bytea('enc_payload'),
});

/** Locations of the water, gas, electricity and boiler cutoffs. */
export const houseShutoffs = pgTable('house_shutoffs', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id').notNull(),
  kind: shutoffKindEnum('kind').notNull(),
  location: text('location').notNull(),
  instructions: text('instructions').notNull().default(''),
  visibleToGuests: boolean('visible_to_guests').notNull().default(true),
  customFields: customFields(),
  deletedAt: instant('deleted_at'),
});

/** Municipal waste collection days for a house. Visible to guests. */
export const wasteCollections = pgTable('waste_collections', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id').notNull(),
  fraction: wasteFractionEnum('fraction').notNull(),
  rrule: text('rrule'),
  collectionTime: text('collection_time'),
  instructions: text('instructions'),
});

/** Family address book. Craftsmen are the artisans of the technical view. */
export const contacts = pgTable('contacts', {
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
  houseId: uuid('house_id'),
  kind: contactKindEnum('kind').notNull(),
  trade: text('trade'),
  displayName: text('display_name').notNull(),
  company: text('company'),
  phone: text('phone'),
  email: citext('email'),
  website: text('website'),
  address: text('address'),
  notes: text('notes'),
  rating: smallint('rating'),
  visibleToGuests: boolean('visible_to_guests').notNull().default(false),
  customFields: customFields(),
  deletedAt: instant('deleted_at'),
});

/** Household utility contracts. Payment secrets, when present, stay in the envelope. */
export const utilities = pgTable('utilities', {
  id: uuid('id').primaryKey(),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id').notNull(),
  kind: utilityKindEnum('kind').notNull(),
  providerName: text('provider_name').notNull(),
  customerCode: text('customer_code'),
  contractCode: text('contract_code'),
  supplyPointCode: text('supply_point_code'),
  tariffName: text('tariff_name'),
  startDate: date('start_date', { mode: 'string' }),
  renewalDate: date('renewal_date', { mode: 'string' }),
  billingFrequency: billingFrequencyEnum('billing_frequency'),
  estimatedCostMinor: bigint('estimated_cost_minor', { mode: 'number' }),
  currency: char('currency', { length: 3 }),
  autopay: boolean('autopay').notNull().default(false),
  notes: text('notes'),
  customFields: customFields(),
  deletedAt: instant('deleted_at'),
  encScopeId: uuid('enc_scope_id'),
  encKeyVersion: integer('enc_key_version'),
  encDek: bytea('enc_dek'),
  encPayload: bytea('enc_payload'),
});

/** Recurring upkeep. The boiler check is a heating task with a due date. */
export const maintenanceTasks = pgTable('maintenance_tasks', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id').notNull(),
  contactId: uuid('contact_id'),
  category: maintenanceCategoryEnum('category').notNull(),
  priority: maintenancePriorityEnum('priority').notNull().default('medium'),
  title: text('title').notNull(),
  description: text('description'),
  rrule: text('rrule'),
  nextDueDate: date('next_due_date', { mode: 'string' }),
  lastDoneOn: date('last_done_on', { mode: 'string' }),
  estimatedCostMinor: bigint('estimated_cost_minor', { mode: 'number' }),
  currency: char('currency', { length: 3 }),
  active: boolean('active').notNull().default(true),
  customFields: customFields(),
  deletedAt: instant('deleted_at'),
});
