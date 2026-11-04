import { integer, pgTable, uuid } from 'drizzle-orm/pg-core';
import { bytea, instant } from '../columns.js';
import { vaultSectionEnum } from './enums.js';

/**
 * Family vault document. There is no plaintext column: the browser encrypts the payload
 * and the server stores the envelope (`enc_*`) plus the section name.
 */
export const vaultItems = pgTable('vault_items', {
  id: uuid('id').primaryKey(),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  section: vaultSectionEnum('section').notNull(),
  deletedAt: instant('deleted_at'),
  encScopeId: uuid('enc_scope_id').notNull(),
  encKeyVersion: integer('enc_key_version').notNull(),
  encDek: bytea('enc_dek').notNull(),
  encPayload: bytea('enc_payload').notNull(),
});
