import { deadlineBoardSchema, deadlineListQuerySchema, familyParamsSchema } from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { problemResponses } from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import type { DeadlinesService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

/**
 * Overview deadlines for the open house.
 *
 * The route reads dates that are already stored: maintenance (including the boiler check),
 * vehicle dates, tax checklist rows that have a date, and succession reminders that are a real date.
 * It does not send push notifications. Writing a task stays on the house maintenance routes.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Deadlines service.
 */
export const deadlineRoutes: FastifyPluginAsyncZod<{ deadlines: DeadlinesService }> = async (
  app,
  { deadlines },
) => {
  app.get(
    '/api/v1/families/:familyId/deadlines',
    {
      config: { access: 'family', permission: 'deadlines.read' },
      schema: {
        tags: ['deadlines'],
        operationId: 'deadlines.list',
        summary: 'Deadlines grouped for the overview',
        params: familyParamsSchema,
        querystring: deadlineListQuerySchema,
        response: { 200: deadlineBoardSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => deadlines.list(tenantOf(request), request.query.houseId),
  );
};
