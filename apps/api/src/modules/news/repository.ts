import { accountProfiles, newsItems, newsReads, type Transaction } from '@domusafe/db';
import { and, desc, eq, gt, lt, or, sql } from 'drizzle-orm';

/** Stored news item row. */
export type NewsItemRow = typeof newsItems.$inferSelect;

/**
 * Reads the interface language of an account profile.
 *
 * Preconditions: the transaction runs as the owning account (or may see the profile).
 * Postconditions: returns `it` when the profile row is missing.
 *
 * @param tx - Account transaction.
 * @param accountId - Account id.
 * @returns Profile locale.
 */
export async function profileLocale(tx: Transaction, accountId: string): Promise<'it' | 'en'> {
  const [row] = await tx
    .select({ locale: accountProfiles.locale })
    .from(accountProfiles)
    .where(eq(accountProfiles.accountId, accountId))
    .limit(1);
  return row?.locale === 'en' ? 'en' : 'it';
}

/**
 * Reads the news read cursor of an account.
 *
 * @param tx - Account transaction.
 * @param accountId - Account id.
 * @returns Last read instant, or null when the account never marked the feed as read.
 */
export async function getLastReadAt(tx: Transaction, accountId: string): Promise<Date | null> {
  const [row] = await tx
    .select({ lastReadAt: newsReads.lastReadAt })
    .from(newsReads)
    .where(eq(newsReads.accountId, accountId))
    .limit(1);
  return row?.lastReadAt ?? null;
}

/**
 * Counts published news items newer than the read cursor for one locale.
 *
 * @param tx - Account transaction (catalogue is globally readable).
 * @param locale - Interface language.
 * @param after - Exclusive lower bound; null means every published item is unread.
 * @returns Unread count.
 */
export async function countUnread(tx: Transaction, locale: 'it' | 'en', after: Date | null): Promise<number> {
  const conditions =
    after === null
      ? [eq(newsItems.locale, locale)]
      : [eq(newsItems.locale, locale), gt(newsItems.publishedAt, after)];
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(newsItems)
    .where(and(...conditions));
  return row?.count ?? 0;
}

/**
 * Lists news items for one locale, newest first, with optional keyset cursor.
 *
 * @param tx - Account transaction.
 * @param locale - Interface language.
 * @param limit - Page size (fetch one extra to detect a next page).
 * @param cursor - Optional `(publishedAt iso, id)` of the last returned row.
 * @returns Rows in descending publish order.
 */
export async function listNews(
  tx: Transaction,
  locale: 'it' | 'en',
  limit: number,
  cursor: { publishedAt: string; id: string } | null,
): Promise<NewsItemRow[]> {
  const pageGuard =
    cursor === null
      ? eq(newsItems.locale, locale)
      : and(
          eq(newsItems.locale, locale),
          or(
            lt(newsItems.publishedAt, new Date(cursor.publishedAt)),
            and(eq(newsItems.publishedAt, new Date(cursor.publishedAt)), lt(newsItems.id, cursor.id)),
          ),
        );
  return tx
    .select()
    .from(newsItems)
    .where(pageGuard)
    .orderBy(desc(newsItems.publishedAt), desc(newsItems.id))
    .limit(limit);
}

/**
 * Upserts the account news read cursor to `now`.
 *
 * Preconditions: the transaction runs as the owning account.
 * Postconditions: `last_read_at` equals `now`.
 *
 * @param tx - Account transaction.
 * @param accountId - Account id.
 * @param now - Instant to store.
 */
export async function upsertLastRead(tx: Transaction, accountId: string, now: Date): Promise<void> {
  await tx
    .insert(newsReads)
    .values({ accountId, lastReadAt: now })
    .onConflictDoUpdate({
      target: newsReads.accountId,
      set: { lastReadAt: now },
    });
}
