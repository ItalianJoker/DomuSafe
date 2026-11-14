import { newsFeedSchema, newsItemSchema, newsListQuerySchema } from '../src/news.js';
import { describe, expect, it } from 'vitest';

describe('news contracts', () => {
  it('accepts a feed item with an internal link', () => {
    const parsed = newsItemSchema.parse({
      id: '019a2600-0000-7000-8000-000000000001',
      publishedAt: '2026-11-01T09:00:00.000Z',
      locale: 'it',
      title: 'Completa Casa e i dati di soccorso',
      body: 'Sul cruscotto trovi cosa fare dopo.',
      link: '/',
      unread: true,
    });
    expect(parsed.unread).toBe(true);
    expect(parsed.locale).toBe('it');
  });

  it('defaults the list limit and accepts a locale filter', () => {
    const parsed = newsListQuerySchema.parse({ locale: 'en' });
    expect(parsed.limit).toBe(20);
    expect(parsed.locale).toBe('en');
  });

  it('requires unreadCount and lastReadAt on the feed page', () => {
    const parsed = newsFeedSchema.parse({
      items: [],
      nextCursor: null,
      unreadCount: 0,
      lastReadAt: null,
    });
    expect(parsed.unreadCount).toBe(0);
  });
});
