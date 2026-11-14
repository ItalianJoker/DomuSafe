import type { NewsFeed } from '@domusafe/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, type TestApp } from './helpers.js';

const PASSWORD = 'una-password-lunga-42';

let ctx: TestApp;
let alice: Client;

beforeAll(async () => {
  ctx = await createTestApp();
  alice = new Client(ctx.app);
  await alice.signUp('Alice Novità', 'alice-news@example.test', PASSWORD);
});

afterAll(async () => {
  await ctx.close();
});

describe('product news feed', () => {
  it('lists Italian tips as unread for a new account', async () => {
    const listed = await alice.request('GET', '/api/v1/news?locale=it&limit=10');
    expect(listed.statusCode).toBe(200);
    const feed = listed.json<NewsFeed>();
    expect(feed.items.length).toBeGreaterThanOrEqual(1);
    expect(feed.unreadCount).toBe(feed.items.filter((item) => item.unread).length);
    expect(feed.items.every((item) => item.locale === 'it')).toBe(true);
    expect(feed.items.every((item) => item.unread)).toBe(true);
    expect(feed.lastReadAt).toBeNull();
    expect(feed.items[0]?.title).toContain('Inventario');
  });

  it('marks the feed as read and clears unread flags', async () => {
    const marked = await alice.request('POST', '/api/v1/news/read', { body: {} });
    expect(marked.statusCode).toBe(204);

    const listed = await alice.request('GET', '/api/v1/news?locale=it');
    expect(listed.statusCode).toBe(200);
    const feed = listed.json<NewsFeed>();
    expect(feed.unreadCount).toBe(0);
    expect(feed.lastReadAt).not.toBeNull();
    expect(feed.items.every((item) => !item.unread)).toBe(true);
  });

  it('rejects an unauthenticated caller', async () => {
    const guest = new Client(ctx.app);
    const listed = await guest.request('GET', '/api/v1/news');
    expect(listed.statusCode).toBe(401);
  });
});
