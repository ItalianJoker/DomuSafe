import {
  auditEventListQuerySchema,
  auditEventListSchema,
  familyParamsSchema,
  restoreRevisionRequestSchema,
  revisionListQuerySchema,
  revisionListSchema,
  revisionParamsSchema,
  revisionSchema,
} from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  idempotencyHeaders,
  instantCursor,
  numericCursor,
  problemResponses,
} from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import type { SyncService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

/**
 * Revision history, restore and audit event listing (phase 3 §5.6).
 *
 * @param app - Fastify instance.
 * @param options - Sync service.
 */
export const syncRoutes: FastifyPluginAsyncZod<{ sync: SyncService }> = async (app, { sync }) => {
  app.get(
    '/api/v1/families/:familyId/revisions',
    {
      config: { access: 'family', permission: 'family.read' },
      schema: {
        tags: ['sync'],
        operationId: 'sync.listRevisions',
        summary: 'Revision history of one resource, newest first',
        params: familyParamsSchema,
        querystring: revisionListQuerySchema,
        response: { 200: revisionListSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => {
      const tenant = tenantOf(request);
      // Route permission is family.read; the service re-checks the resource-specific read permission.
      return sync.listRevisionsPage(tenant, {
        resourceType: request.query.resourceType,
        resourceId: request.query.resourceId,
        limit: request.query.limit,
        after: numericCursor(request.query.cursor),
      });
    },
  );

  app.get(
    '/api/v1/families/:familyId/revisions/:revisionId',
    {
      config: { access: 'family', permission: 'family.read' },
      schema: {
        tags: ['sync'],
        operationId: 'sync.getRevision',
        summary: 'One revision with its class C snapshot',
        params: revisionParamsSchema,
        response: { 200: revisionSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => sync.getRevision(tenantOf(request), request.params.revisionId),
  );

  app.post(
    '/api/v1/families/:familyId/revisions/:revisionId/restore',
    {
      config: { access: 'family', permission: 'house.write', idempotent: true },
      schema: {
        tags: ['sync'],
        operationId: 'sync.restoreRevision',
        summary: 'Restore a resource from a previous revision (guide entries in this release)',
        params: revisionParamsSchema,
        headers: idempotencyHeaders,
        body: restoreRevisionRequestSchema,
        response: { 200: revisionSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request) => sync.restoreRevision(tenantOf(request), request.params.revisionId, request.body),
  );

  app.get(
    '/api/v1/families/:familyId/audit-events',
    {
      config: { access: 'family', permission: 'audit.read', planFeature: 'audit_log' },
      schema: {
        tags: ['sync'],
        operationId: 'sync.listAuditEvents',
        summary: 'Family audit history for administrators (Premium or trial)',
        params: familyParamsSchema,
        querystring: auditEventListQuerySchema,
        response: { 200: auditEventListSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) =>
      sync.listAuditEvents(tenantOf(request), request.query, instantCursor(request.query.cursor)),
  );
};
