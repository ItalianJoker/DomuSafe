import {
  createPublicationRequestSchema,
  houseParamsSchema,
  publicHousePageSchema,
  publicRescueSheetSchema,
  publicTokenParamsSchema,
  publicationListSchema,
  publicationParamsSchema,
  publicationSchema,
  formatEtag,
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
import type { PrintService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

/**
 * Routes of the printed sheets: family codes, and the two public pages opened by those codes.
 *
 * Preconditions: family routes require `qr.manage` (people who can edit the house).
 * Postconditions: the public pages do not require a session.
 * Data contract: the public house page has no health data; the rescue page is the rescue sheet only.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Print service.
 */
export const printRoutes: FastifyPluginAsyncZod<{ print: PrintService }> = async (app, { print }) => {
  const base = '/api/v1/families/:familyId/houses/:houseId/publications';

  app.get(
    base,
    {
      config: { access: 'family', permission: 'qr.manage' },
      schema: {
        tags: ['print'],
        operationId: 'print.listPublications',
        summary: 'Printed codes of one house, with the last reading',
        params: houseParamsSchema,
        response: { 200: publicationListSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => ({
      items: [...(await print.list(tenantOf(request), request.params.houseId))],
    }),
  );

  app.post(
    base,
    {
      config: { access: 'family', permission: 'qr.manage', idempotent: true },
      schema: {
        tags: ['print'],
        operationId: 'print.createPublication',
        summary: 'Prepare a printed code, or return the active one',
        params: houseParamsSchema,
        headers: idempotencyHeaders,
        body: createPublicationRequestSchema,
        response: {
          200: publicationSchema,
          201: publicationSchema,
          ...problemResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    async (request, reply) => {
      const prepared = await print.create(tenantOf(request), request.params.houseId, request.body.kind);
      void reply
        .status(prepared.created ? 201 : 200)
        .header('etag', formatEtag(prepared.publication.version));
      return prepared.publication;
    },
  );

  app.post(
    `${base}/:publicationId/revoke`,
    {
      config: { access: 'family', permission: 'qr.manage' },
      schema: {
        tags: ['print'],
        operationId: 'print.revokePublication',
        summary: 'Revoke a printed code',
        params: publicationParamsSchema,
        headers: ifMatchHeaders,
        response: { 200: publicationSchema, ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      const publication = await print.revoke(
        tenantOf(request),
        request.params.houseId,
        request.params.publicationId,
        requireIfMatch(request),
      );
      void reply.header('etag', formatEtag(publication.version));
      return publication;
    },
  );

  app.get(
    '/api/v1/public/house-pages/:token',
    {
      config: {
        access: 'public',
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['print'],
        operationId: 'print.getPublicHousePage',
        summary: 'Public house page opened by the wall-sheet code, without a sign-in',
        params: publicTokenParamsSchema,
        response: { 200: publicHousePageSchema, ...problemResponses(400, 404, 410, 429) },
      },
    },
    async (request) => print.openHousePage(request.params.token),
  );

  app.get(
    '/api/v1/public/rescue-sheets/:token',
    {
      config: {
        access: 'public',
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['print'],
        operationId: 'print.getPublicRescueSheet',
        summary: 'Public rescue sheet opened by the emergency code, without a sign-in',
        params: publicTokenParamsSchema,
        response: { 200: publicRescueSheetSchema, ...problemResponses(400, 404, 410, 429) },
      },
    },
    async (request) => print.openRescueSheet(request.params.token),
  );
};
