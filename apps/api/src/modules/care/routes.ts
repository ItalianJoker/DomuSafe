import {
  createHandoverRequestSchema,
  createVitalEntryRequestSchema,
  familyParamsSchema,
  formatEtag,
  handoverListQuerySchema,
  handoverPageSchema,
  handoverParamsSchema,
  handoverSchema,
  putResidentAboutRequestSchema,
  residentAboutCardSchema,
  residentParamsSchema,
  updateHandoverRequestSchema,
  updateVitalEntryRequestSchema,
  vitalEntryPageSchema,
  vitalEntryParamsSchema,
  vitalEntrySchema,
  vitalListQuerySchema,
} from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  idempotencyHeaders,
  ifMatchHeaders,
  instantCursor,
  problemResponses,
  requireIfMatch,
} from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import type { CareService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

/**
 * Routes of care coordination: vital diary, «Chi sono» and caregiver handovers.
 * Vitals and the identity sheet use `health.*`. Handovers use `care.*`.
 * No plan feature gate — Free includes them within resident limits.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Care service.
 */
export const careRoutes: FastifyPluginAsyncZod<{ care: CareService }> = async (app, { care }) => {
  const resident = '/api/v1/families/:familyId/residents/:residentId';
  const vitals = `${resident}/vitals`;
  const about = `${resident}/about`;
  const handovers = '/api/v1/families/:familyId/handovers';

  app.get(
    vitals,
    {
      config: { access: 'family', permission: 'health.read' },
      schema: {
        tags: ['care'],
        operationId: 'care.listVitals',
        summary: 'Vital parameters diary of one resident',
        params: residentParamsSchema,
        querystring: vitalListQuerySchema,
        response: { 200: vitalEntryPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      care.listVitals(tenantOf(request), request.params.residentId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    vitals,
    {
      config: { access: 'family', permission: 'health.write', idempotent: true },
      schema: {
        tags: ['care'],
        operationId: 'care.createVital',
        summary: 'Add a vital parameters diary row',
        params: residentParamsSchema,
        headers: idempotencyHeaders,
        body: createVitalEntryRequestSchema,
        response: { 201: vitalEntrySchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await care.createVital(tenant, request.params.residentId, request.body);
      void reply
        .status(201)
        .header(
          'location',
          `/api/v1/families/${tenant.familyId}/residents/${request.params.residentId}/vitals/${row.id}`,
        )
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${vitals}/:entryId`,
    {
      config: { access: 'family', permission: 'health.write' },
      schema: {
        tags: ['care'],
        operationId: 'care.updateVital',
        summary: 'Update a vital parameters diary row',
        params: vitalEntryParamsSchema,
        headers: ifMatchHeaders,
        body: updateVitalEntryRequestSchema,
        response: { 200: vitalEntrySchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await care.updateVital(
        tenantOf(request),
        request.params.residentId,
        request.params.entryId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${vitals}/:entryId`,
    {
      config: { access: 'family', permission: 'health.write' },
      schema: {
        tags: ['care'],
        operationId: 'care.deleteVital',
        summary: 'Remove a vital parameters diary row',
        params: vitalEntryParamsSchema,
        headers: ifMatchHeaders,
        response: {
          204: z.null(),
          ...problemResponses(400, 401, 403, 404, 409, 428),
        },
      },
    },
    async (request, reply) => {
      await care.deleteVital(
        tenantOf(request),
        request.params.residentId,
        request.params.entryId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    about,
    {
      config: { access: 'family', permission: 'health.read' },
      schema: {
        tags: ['care'],
        operationId: 'care.getAbout',
        summary: '«Chi sono» caregiver identity sheet',
        params: residentParamsSchema,
        response: { 200: residentAboutCardSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await care.getAbout(tenantOf(request), request.params.residentId);
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.put(
    about,
    {
      config: { access: 'family', permission: 'health.write', idempotent: true },
      schema: {
        tags: ['care'],
        operationId: 'care.putAbout',
        summary: 'Replace the «Chi sono» caregiver identity sheet',
        params: residentParamsSchema,
        headers: idempotencyHeaders.and(ifMatchHeaders),
        body: putResidentAboutRequestSchema,
        response: { 200: residentAboutCardSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await care.putAbout(
        tenantOf(request),
        request.params.residentId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    handovers,
    {
      config: { access: 'family', permission: 'care.read' },
      schema: {
        tags: ['care'],
        operationId: 'care.listHandovers',
        summary: 'Handover notes between caregivers',
        params: familyParamsSchema,
        querystring: handoverListQuerySchema,
        response: { 200: handoverPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      care.listHandovers(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        houseId: request.query.houseId ?? null,
        residentId: request.query.residentId ?? null,
        audience: request.query.audience ?? null,
      }),
  );

  app.post(
    handovers,
    {
      config: { access: 'family', permission: 'care.write', idempotent: true },
      schema: {
        tags: ['care'],
        operationId: 'care.createHandover',
        summary: 'Add a handover note',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createHandoverRequestSchema,
        response: { 201: handoverSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await care.createHandover(tenant, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/handovers/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${handovers}/:handoverId`,
    {
      config: { access: 'family', permission: 'care.write' },
      schema: {
        tags: ['care'],
        operationId: 'care.updateHandover',
        summary: 'Update a handover note',
        params: handoverParamsSchema,
        headers: ifMatchHeaders,
        body: updateHandoverRequestSchema,
        response: { 200: handoverSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await care.updateHandover(
        tenantOf(request),
        request.params.handoverId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.post(
    `${handovers}/:handoverId/acknowledge`,
    {
      config: { access: 'family', permission: 'care.read', idempotent: true },
      schema: {
        tags: ['care'],
        operationId: 'care.acknowledgeHandover',
        summary: 'Mark a handover note as read',
        params: handoverParamsSchema,
        headers: idempotencyHeaders.and(ifMatchHeaders),
        response: { 200: handoverSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await care.acknowledgeHandover(
        tenantOf(request),
        request.params.handoverId,
        requireIfMatch(request),
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${handovers}/:handoverId`,
    {
      config: { access: 'family', permission: 'care.write' },
      schema: {
        tags: ['care'],
        operationId: 'care.deleteHandover',
        summary: 'Remove a handover note',
        params: handoverParamsSchema,
        headers: ifMatchHeaders,
        response: {
          204: z.null(),
          ...problemResponses(400, 401, 403, 404, 409, 428),
        },
      },
    },
    async (request, reply) => {
      await care.deleteHandover(tenantOf(request), request.params.handoverId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );
};
