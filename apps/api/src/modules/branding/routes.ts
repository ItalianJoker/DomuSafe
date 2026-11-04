import {
  familyBrandingResponseSchema,
  familyParamsSchema,
  formatEtag,
  putFamilyBrandingRequestSchema,
} from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  idempotencyHeaders,
  ifMatchHeaders,
  problemResponses,
  requireIfMatch,
} from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import type { BrandingService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

/**
 * Routes of the family host mark.
 *
 * Reading is open to people who can prepare the printed sheets. Writing is limited to administrators
 * and to Premium, which the thirty-day trial satisfies. The logo is a small data address.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Branding service.
 */
export const brandingRoutes: FastifyPluginAsyncZod<{ branding: BrandingService }> = async (
  app,
  { branding },
) => {
  app.get(
    '/api/v1/families/:familyId/branding',
    {
      config: { access: 'family', permission: 'qr.manage', planFeature: 'branding' },
      schema: {
        tags: ['branding'],
        operationId: 'branding.get',
        summary: 'Host mark of the family',
        params: familyParamsSchema,
        response: { 200: familyBrandingResponseSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => ({ branding: await branding.get(tenantOf(request)) }),
  );

  app.put(
    '/api/v1/families/:familyId/branding',
    {
      config: { access: 'family', permission: 'branding.manage', planFeature: 'branding', idempotent: true },
      schema: {
        tags: ['branding'],
        operationId: 'branding.put',
        summary: 'Replace the host mark, or clear it when every field is empty',
        params: familyParamsSchema,
        headers: idempotencyHeaders.and(ifMatchHeaders),
        body: putFamilyBrandingRequestSchema,
        response: {
          200: familyBrandingResponseSchema,
          201: familyBrandingResponseSchema,
          ...problemResponses(400, 401, 403, 404, 409, 422, 428),
        },
      },
    },
    async (request, reply) => {
      const expected = request.headers['if-match'] === undefined ? null : requireIfMatch(request);
      const saved = await branding.save(tenantOf(request), expected, request.body);
      if (saved === null) {
        void reply.status(200);
        return { branding: null };
      }
      void reply.status(saved.created ? 201 : 200).header('etag', formatEtag(saved.branding.version));
      return { branding: saved.branding };
    },
  );
};
