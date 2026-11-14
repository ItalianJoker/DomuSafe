import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  customType,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { instant } from '../columns.js';
import { roomKindEnum, storageUnitKindEnum, visibilityEnum } from './enums.js';

const customFields = () => jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({});

/** Stored generated full-text vector. Read-only in the application. */
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

/** A room of one house. Class C. */
export const rooms = pgTable('rooms', {
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
  name: text('name').notNull(),
  kind: roomKindEnum('kind').notNull().default('other'),
  floor: smallint('floor'),
  sortOrder: smallint('sort_order').notNull().default(0),
  notes: text('notes'),
  customFields: customFields(),
  deletedAt: instant('deleted_at'),
});

/** Closet, shelf, drawer or other container nested under a room. Depth is at most four. */
export const storageUnits = pgTable('storage_units', {
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
  roomId: uuid('room_id').notNull(),
  parentId: uuid('parent_id'),
  kind: storageUnitKindEnum('kind').notNull().default('container'),
  name: text('name').notNull(),
  notes: text('notes'),
  sortOrder: smallint('sort_order').notNull().default(0),
  deletedAt: instant('deleted_at'),
});

/** One inventoried object. Photo and receipt are optional small data addresses. */
export const inventoryItems = pgTable('inventory_items', {
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
  roomId: uuid('room_id').notNull(),
  storageUnitId: uuid('storage_unit_id'),
  name: text('name').notNull(),
  category: text('category'),
  quantity: numeric('quantity').notNull().default('1'),
  unit: text('unit'),
  brand: text('brand'),
  model: text('model'),
  serialNumber: text('serial_number'),
  barcode: text('barcode'),
  purchaseDate: date('purchase_date', { mode: 'string' }),
  purchasePriceMinor: bigint('purchase_price_minor', { mode: 'number' }),
  currency: char('currency', { length: 3 }),
  warrantyUntil: date('warranty_until', { mode: 'string' }),
  warrantyNotes: text('warranty_notes'),
  tags: text('tags')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  notes: text('notes'),
  photoCaption: text('photo_caption'),
  photoDataUrl: text('photo_data_url'),
  receiptCaption: text('receipt_caption'),
  receiptDataUrl: text('receipt_data_url'),
  customFields: customFields(),
  deletedAt: instant('deleted_at'),
});

/**
 * One account-owned inventory search filter pinned in the Casa sidebar (at most five).
 * Class C readable definition; personal encryption of the payload is a later step.
 */
export const savedFilters = pgTable('saved_filters', {
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
  name: text('name').notNull(),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
  pinnedPosition: smallint('pinned_position').notNull(),
});

/**
 * Unified full-text index for class C resources.
 * Modules upsert a row in the same write transaction. Guests only see `audience_guest` rows.
 */
export const searchIndex = pgTable(
  'search_index',
  {
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
    familyId: uuid('family_id').notNull(),
    houseId: uuid('house_id'),
    residentId: uuid('resident_id'),
    visibility: visibilityEnum('visibility').notNull().default('family'),
    ownerAccountId: uuid('owner_account_id'),
    audienceGuest: boolean('audience_guest').notNull().default(false),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    tsv: tsvector('tsv').generatedAlwaysAs(
      sql`setweight(to_tsvector('public.domusafe_it'::regconfig, title), 'A'::"char")
          || setweight(to_tsvector('public.domusafe_it'::regconfig, body), 'B'::"char")`,
    ),
  },
  (table) => [primaryKey({ columns: [table.resourceType, table.resourceId] })],
);
