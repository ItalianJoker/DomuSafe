import { char, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { instant } from '../columns.js';

/**
 * Host mark of one family.
 * `logo_data_url` is a small image address. There is no object store yet, so the column
 * itself is capped at 24576 characters. The row is class C and is not a vault document.
 */
export const familyBranding = pgTable('family_branding', {
  familyId: uuid('family_id').primaryKey(),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  displayName: text('display_name'),
  accentColor: char('accent_color', { length: 7 }),
  welcome: text('welcome'),
  logoDataUrl: text('logo_data_url'),
});
