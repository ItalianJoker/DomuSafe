import { z } from 'zod';
import { instantSchema, localeSchema, pageSchema, uuidSchema } from './common.js';

/** One family-visible news item (product tip). */
export const newsItemSchema = z
  .object({
    id: uuidSchema,
    publishedAt: instantSchema,
    locale: localeSchema,
    title: z.string().min(1).max(140),
    body: z.string().min(1).max(1000),
    link: z.string().min(1).max(500).nullable(),
    unread: z.boolean(),
  })
  .strict()
  .meta({ id: 'NewsItem' });
/** One family-visible news item. */
export type NewsItem = z.infer<typeof newsItemSchema>;

/** Page of news items with unread summary. */
export const newsFeedSchema = pageSchema(newsItemSchema)
  .extend({
    unreadCount: z.number().int().min(0),
    lastReadAt: instantSchema.nullable(),
  })
  .strict()
  .meta({ id: 'NewsFeed' });
/** Page of news items with unread summary. */
export type NewsFeed = z.infer<typeof newsFeedSchema>;

/** Query of `GET /news`. */
export const newsListQuerySchema = z
  .object({
    locale: localeSchema.optional(),
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

/** Body of `POST /news/read` (empty: marks every published item as read now). */
export const markNewsReadRequestSchema = z.object({}).strict().meta({ id: 'MarkNewsReadRequest' });
/** Body of `POST /news/read`. */
export type MarkNewsReadRequest = z.infer<typeof markNewsReadRequestSchema>;
