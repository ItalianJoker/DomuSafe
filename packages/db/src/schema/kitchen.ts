import { sql } from 'drizzle-orm';
import { integer, jsonb, numeric, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { instant } from '../columns.js';
import { recipeImportStatusEnum } from './enums.js';

/** One ingredient line stored inside a recipe. */
export interface RecipeIngredientRow {
  readonly name: string;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly note: string | null;
}

/**
 * A family recipe with ingredients and steps.
 * Soft-deleted with `deleted_at`. Source fields record optional URL imports.
 */
export const recipes = pgTable('recipes', {
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
  servings: smallint('servings'),
  prepMinutes: smallint('prep_minutes'),
  cookMinutes: smallint('cook_minutes'),
  ingredients: jsonb('ingredients').$type<RecipeIngredientRow[]>().notNull().default([]),
  steps: jsonb('steps').$type<string[]>().notNull().default([]),
  tags: text('tags')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  sourceUrl: text('source_url'),
  sourceName: text('source_name'),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
  deletedAt: instant('deleted_at'),
});

/**
 * One attempt to import a recipe from a public URL.
 * Kept for audit; succeeded rows point at the created recipe.
 */
export const recipeImports = pgTable('recipe_imports', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  familyId: uuid('family_id').notNull(),
  url: text('url').notNull(),
  status: recipeImportStatusEnum('status').notNull().default('queued'),
  errorCode: text('error_code'),
  recipeId: uuid('recipe_id'),
  createdBy: uuid('created_by'),
  createdAt: instant('created_at').notNull().defaultNow(),
  finishedAt: instant('finished_at'),
});

/**
 * A store (or market) with a preferred aisle order for shopping lists.
 */
export const stores = pgTable('stores', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  name: text('name').notNull(),
  aisleOrder: text('aisle_order')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  deletedAt: instant('deleted_at'),
});

/**
 * A shopping list, optionally tied to a house and a store.
 */
export const shoppingLists = pgTable('shopping_lists', {
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
  storeId: uuid('store_id'),
  name: text('name').notNull(),
  archivedAt: instant('archived_at'),
  deletedAt: instant('deleted_at'),
});

/**
 * One line on a shopping list. Checked state is concurrent-safe via its own version.
 */
export const shoppingItems = pgTable('shopping_items', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  listId: uuid('list_id').notNull(),
  name: text('name').notNull(),
  quantity: numeric('quantity'),
  unit: text('unit'),
  aisle: text('aisle'),
  position: integer('position').notNull().default(0),
  checkedAt: instant('checked_at'),
  checkedBy: uuid('checked_by'),
  deletedAt: instant('deleted_at'),
});
