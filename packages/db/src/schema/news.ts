import { sql } from 'drizzle-orm';
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { instant } from '../columns.js';

/** Supported news locales (same set as the interface language). */
export const NEWS_LOCALES = ['it', 'en'] as const;

/** One news locale. */
export type NewsLocale = (typeof NEWS_LOCALES)[number];

/**
 * Global product news catalogue (`news_items`, class C, RLS model G).
 *
 * Preconditions: rows are inserted by migrations or by operators with the owner role.
 * Postconditions: `domusafe_app` may only select.
 * Data contract: `link` is an internal path starting with `/`, or null.
 */
export const newsItems = pgTable('news_items', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  publishedAt: instant('published_at').notNull(),
  locale: text('locale', { enum: NEWS_LOCALES }).notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  link: text('link'),
});

/**
 * Per-account news read cursor (`news_reads`, class C, RLS model A).
 *
 * Preconditions: the transaction runs as the owning account.
 * Postconditions: `last_read_at` is the instant used to mark items as read.
 * Data contract: one row per account.
 */
export const newsReads = pgTable('news_reads', {
  accountId: uuid('account_id').primaryKey(),
  lastReadAt: instant('last_read_at').notNull(),
});
