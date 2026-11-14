import {
  exportCatalogSchema,
  exportFamilyParamsSchema,
  exportRecordsPageSchema,
  exportRecordsQuerySchema,
} from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { problemResponses } from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import type { BackupService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

/**
 * Family export routes: catalog and paginated records for browser backup and CSV.
 *
 * Preconditions: `export.full` (Administrators, Parents, Children and Caregivers; Guests are refused).
 * Postconditions: each record still respects the caller's per-module read permission and RLS.
 * Data contract: sealed vault and utility envelopes stay encrypted as stored.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Backup service.
 */
export const backupRoutes: FastifyPluginAsyncZod<{ backup: BackupService }> = async (app, { backup }) => {
  const base = '/api/v1/families/:familyId/export';

  app.get(
    `${base}/catalog`,
    {
      config: { access: 'family', permission: 'export.full' },
      schema: {
        tags: ['backup'],
        operationId: 'backup.catalog',
        summary: 'Modules the caller may include in a family export',
        params: exportFamilyParamsSchema,
        response: { 200: exportCatalogSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => backup.catalog(tenantOf(request)),
  );

  app.get(
    `${base}/records`,
    {
      config: { access: 'family', permission: 'export.full' },
      schema: {
        tags: ['backup'],
        operationId: 'backup.listRecords',
        summary: 'Paginated family rows for browser backup and CSV assembly',
        params: exportFamilyParamsSchema,
        querystring: exportRecordsQuerySchema,
        response: { 200: exportRecordsPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) => backup.listRecords(tenantOf(request), request.query),
  );
};
