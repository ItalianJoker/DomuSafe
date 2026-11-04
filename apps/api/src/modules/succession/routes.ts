import {
  createSuccessionItemRequestSchema,
  familyParamsSchema,
  formatEtag,
  successionItemParamsSchema,
  successionItemSchema,
  successionListSchema,
  updateSuccessionItemRequestSchema,
} from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  idempotencyHeaders,
  ifMatchHeaders,
  problemResponses,
  requireIfMatch,
} from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import type { SuccessionService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

/**
 * Routes of the family succession checklist.
 *
 * Reading, editing and therefore the browser export require Premium (`succession`), which the
 * thirty-day trial satisfies. The bodies are checklist fields. Vault envelopes are not accepted.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Succession service.
 */
export const successionRoutes: FastifyPluginAsyncZod<{ succession: SuccessionService }> = async (
  app,
  { succession },
) => {
  app.get(
    '/api/v1/families/:familyId/succession',
    {
      config: { access: 'family', permission: 'vault.family.read', planFeature: 'succession' },
      schema: {
        tags: ['succession'],
        operationId: 'succession.list',
        summary: 'Family succession checklist',
        params: familyParamsSchema,
        response: { 200: successionListSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => succession.list(tenantOf(request)),
  );

  app.post(
    '/api/v1/families/:familyId/succession/prepare',
    {
      config: {
        access: 'family',
        permission: 'vault.family.write',
        planFeature: 'succession',
        idempotent: true,
      },
      schema: {
        tags: ['succession'],
        operationId: 'succession.prepare',
        summary: 'Add the standard succession activities that are missing',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        response: { 200: successionListSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => succession.prepare(tenantOf(request)),
  );

  app.post(
    '/api/v1/families/:familyId/succession',
    {
      config: {
        access: 'family',
        permission: 'vault.family.write',
        planFeature: 'succession',
        idempotent: true,
      },
      schema: {
        tags: ['succession'],
        operationId: 'succession.create',
        summary: 'Add one succession activity',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createSuccessionItemRequestSchema,
        response: { 201: successionItemSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const item = await succession.create(tenantOf(request), request.body);
      return reply.status(201).header('etag', formatEtag(item.version)).send(item);
    },
  );

  app.patch(
    '/api/v1/families/:familyId/succession/:itemId',
    {
      config: { access: 'family', permission: 'vault.family.write', planFeature: 'succession' },
      schema: {
        tags: ['succession'],
        operationId: 'succession.update',
        summary: 'Edit one succession activity or mark it done',
        params: successionItemParamsSchema,
        headers: ifMatchHeaders,
        body: updateSuccessionItemRequestSchema,
        response: { 200: successionItemSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const item = await succession.update(
        tenantOf(request),
        request.params.itemId,
        requireIfMatch(request),
        request.body,
      );
      return reply.header('etag', formatEtag(item.version)).send(item);
    },
  );

  app.delete(
    '/api/v1/families/:familyId/succession/:itemId',
    {
      config: { access: 'family', permission: 'vault.family.write', planFeature: 'succession' },
      schema: {
        tags: ['succession'],
        operationId: 'succession.delete',
        summary: 'Remove one succession activity',
        params: successionItemParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await succession.remove(tenantOf(request), request.params.itemId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );
};
