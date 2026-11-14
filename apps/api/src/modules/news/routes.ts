import { markNewsReadRequestSchema, newsFeedSchema, newsListQuerySchema } from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { AuthenticatedAccount } from '../../types.js';
import type { NewsService } from './service.js';

function caller(request: { account: AuthenticatedAccount | null }): AuthenticatedAccount {
  if (request.account === null) {
    throw new ProblemError('unauthenticated');
  }
  return request.account;
}

/**
 * Product news feed routes (phase 3 §5.2).
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - News service.
 */
export const newsRoutes: FastifyPluginAsyncZod<{ news: NewsService }> = async (app, { news }) => {
  app.get(
    '/api/v1/news',
    {
      config: { access: 'account' },
      schema: {
        tags: ['news'],
        operationId: 'news.list',
        summary: 'Family-visible product news for the current account',
        querystring: newsListQuerySchema,
        response: { 200: newsFeedSchema, ...problemResponses(400, 401) },
      },
    },
    async (request) =>
      news.list(caller(request), {
        limit: request.query.limit,
        ...(request.query.locale === undefined ? {} : { locale: request.query.locale }),
        ...(request.query.cursor === undefined ? {} : { cursor: request.query.cursor }),
      }),
  );

  app.post(
    '/api/v1/news/read',
    {
      config: { access: 'account' },
      schema: {
        tags: ['news'],
        operationId: 'news.markRead',
        summary: 'Mark the news feed as read for the current account',
        body: markNewsReadRequestSchema,
        response: { 204: z.null(), ...problemResponses(400, 401) },
      },
    },
    async (request, reply) => {
      await news.markRead(caller(request));
      return reply.code(204).send(null);
    },
  );
};
