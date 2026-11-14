import { decodeCursor, encodeCursor, type NewsFeed, type NewsItem } from '@domusafe/contracts';
import { withContext, type Database } from '@domusafe/db';
import { ProblemError } from '../../http/problem.js';
import type { AuthenticatedAccount } from '../../types.js';
import * as repo from './repository.js';

const accountPrincipal = (accountId: string): { kind: 'account'; accountId: string } => ({
  kind: 'account',
  accountId,
});

/**
 * Family-visible product news feed (phase 3 §5.2 `GET /news` · `POST /news/read`).
 *
 * Preconditions: the caller is an authenticated account.
 * Postconditions: marking as read only updates the caller's `news_reads` row.
 * Data contract: catalogue rows are class C; the read cursor is account-owned.
 *
 * @param db - Database bound to the `domusafe_app` pool.
 * @param now - Clock, injectable for tests.
 * @returns The service.
 */
export function createNewsService(db: Database, now: () => Date = () => new Date()) {
  return {
    /**
     * Lists product news for the caller's language, newest first.
     *
     * @param caller - Authenticated account.
     * @param query - Optional locale override, cursor and page size.
     * @returns A page of items with unread flags and the unread count for the locale.
     */
    async list(
      caller: AuthenticatedAccount,
      query: { readonly locale?: 'it' | 'en'; readonly cursor?: string; readonly limit: number },
    ): Promise<NewsFeed> {
      return withContext(db, { principal: accountPrincipal(caller.id) }, async (tx) => {
        const locale = query.locale ?? (await repo.profileLocale(tx, caller.id));
        let cursor: { publishedAt: string; id: string } | null = null;
        if (query.cursor !== undefined) {
          const decoded = decodeCursor(query.cursor);
          if (decoded === null || typeof decoded[0] !== 'string') {
            throw new ProblemError('cursor_invalid');
          }
          cursor = { publishedAt: decoded[0], id: decoded[1] };
        }
        const rows = await repo.listNews(tx, locale, query.limit + 1, cursor);
        const lastReadAt = await repo.getLastReadAt(tx, caller.id);
        const unreadCount = await repo.countUnread(tx, locale, lastReadAt);
        const page = rows.slice(0, query.limit);
        const next =
          rows.length > query.limit
            ? (() => {
                const last = page[page.length - 1];
                if (last === undefined) {
                  return null;
                }
                return encodeCursor([last.publishedAt.toISOString(), last.id]);
              })()
            : null;
        return {
          items: page.map((row) => viewItem(row, lastReadAt)),
          nextCursor: next,
          unreadCount,
          lastReadAt: lastReadAt === null ? null : lastReadAt.toISOString(),
        };
      });
    },

    /**
     * Marks every currently published news item as read for the caller.
     *
     * @param caller - Authenticated account.
     */
    async markRead(caller: AuthenticatedAccount): Promise<void> {
      const instant = now();
      await withContext(db, { principal: accountPrincipal(caller.id) }, async (tx) => {
        await repo.upsertLastRead(tx, caller.id, instant);
      });
    },
  };
}

/** News service type. */
export type NewsService = ReturnType<typeof createNewsService>;

/**
 * Maps a catalogue row to the public contract, with unread relative to the read cursor.
 *
 * @param row - Stored news item.
 * @param lastReadAt - Account read cursor, or null.
 * @returns Public news item.
 */
function viewItem(row: repo.NewsItemRow, lastReadAt: Date | null): NewsItem {
  const unread = lastReadAt === null || row.publishedAt.getTime() > lastReadAt.getTime();
  return {
    id: row.id,
    publishedAt: row.publishedAt.toISOString(),
    locale: row.locale,
    title: row.title,
    body: row.body,
    link: row.link,
    unread,
  };
}
