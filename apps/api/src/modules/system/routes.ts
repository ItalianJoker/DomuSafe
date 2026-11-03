import { sql } from 'drizzle-orm';
import type { Database } from '@domusafe/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { KeyValueStore } from '../../infra/kv.js';
import { problemResponses } from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';

const statusSchema = z
  .object({ status: z.literal('ok') })
  .strict()
  .meta({ id: 'HealthStatus' });

/**
 * Liveness and readiness probes (phase 3 §5.1).
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Database and key-value store to probe.
 */
export const systemRoutes: FastifyPluginAsyncZod<{ db: Database; store: KeyValueStore }> = async (
  app,
  { db, store },
) => {
  app.get(
    '/api/v1/health',
    {
      config: { access: 'public' },
      schema: {
        tags: ['system'],
        operationId: 'system.health',
        summary: 'Liveness probe',
        response: { 200: statusSchema },
      },
    },
    () => ({ status: 'ok' as const }),
  );

  app.get(
    '/api/v1/ready',
    {
      config: { access: 'public' },
      schema: {
        tags: ['system'],
        operationId: 'system.ready',
        summary: 'Readiness probe: database and key-value store reachable',
        response: { 200: statusSchema, ...problemResponses(503) },
      },
    },
    async () => {
      try {
        await db.execute(sql`select 1`);
        await store.get('domusafe:ready');
      } catch {
        throw new ProblemError('maintenance', { detail: 'A dependency is not reachable' });
      }
      return { status: 'ok' as const };
    },
  );
};
