import { sql } from 'drizzle-orm';
import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { bytea, instant } from '../columns.js';
import { publicationKindEnum } from './enums.js';

/**
 * A revocable code printed on a house sheet.
 * `token` is null after revocation; `token_hash` stays so a scan can be told the code is no longer valid.
 */
export const publications = pgTable('publications', {
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
  kind: publicationKindEnum('kind').notNull(),
  token: text('token'),
  tokenHash: bytea('token_hash').notNull(),
  revokedAt: instant('revoked_at'),
  lastScannedAt: instant('last_scanned_at'),
  scanCount: integer('scan_count').notNull().default(0),
});
