import {
  createHaConnectionRequestSchema,
  createHaConnectionResponseSchema,
  createHaZoneRequestSchema,
  formatEtag,
  haConnectionPageSchema,
  haConnectionParamsSchema,
  haConnectionSchema,
  haConnectionTestResultSchema,
  haDeviceListQuerySchema,
  haDevicePageSchema,
  haDeviceParamsSchema,
  haDeviceSchema,
  haEventPageSchema,
  haInboundSecretResponseSchema,
  haLockCodePageSchema,
  haRefreshResultSchema,
  haWebhookParamsSchema,
  haZonePageSchema,
  haZoneParamsSchema,
  haZoneSchema,
  homeAssistantIngestSchema,
  houseParamsSchema,
  issueHaLockCodeRequestSchema,
  issueHaLockCodeResponseSchema,
  pageQuerySchema,
  updateHaConnectionRequestSchema,
  updateHaDeviceRequestSchema,
  updateHaZoneRequestSchema,
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
import type { HomeAutomationService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

/**
 * Routes of the home-automation bridge under a house.
 * Family routes require `home_automation` (Premium). The inbound webhook is public and HMAC-signed.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Home-automation service.
 */
export const homeAutomationRoutes: FastifyPluginAsyncZod<{
  homeAutomation: HomeAutomationService;
}> = async (app, { homeAutomation }) => {
  const base = '/api/v1/families/:familyId/houses/:houseId/automation';
  const connections = `${base}/connections`;
  const devices = `${base}/devices`;
  const zones = `${base}/zones`;
  const events = `${base}/events`;
  const lockCodes = `${base}/lock-codes`;

  app.get(
    connections,
    {
      config: { access: 'family', permission: 'automation.read', planFeature: 'home_automation' },
      schema: {
        tags: ['automation'],
        operationId: 'automation.listConnections',
        summary: 'List home-automation connections of a house',
        params: houseParamsSchema,
        querystring: pageQuerySchema,
        response: { 200: haConnectionPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      homeAutomation.listConnections(tenantOf(request), request.params.houseId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    connections,
    {
      config: {
        access: 'family',
        permission: 'automation.manage',
        planFeature: 'home_automation',
        idempotent: true,
      },
      schema: {
        tags: ['automation'],
        operationId: 'automation.createConnection',
        summary: 'Create a Home Assistant or MQTT connection',
        params: houseParamsSchema,
        headers: idempotencyHeaders,
        body: createHaConnectionRequestSchema,
        response: {
          201: createHaConnectionResponseSchema,
          ...problemResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    async (request, reply) => {
      const created = await homeAutomation.createConnection(
        tenantOf(request),
        request.params.houseId,
        request.body,
      );
      void reply.status(201).header('etag', formatEtag(created.connection.version));
      return created;
    },
  );

  app.patch(
    `${connections}/:connectionId`,
    {
      config: { access: 'family', permission: 'automation.manage', planFeature: 'home_automation' },
      schema: {
        tags: ['automation'],
        operationId: 'automation.updateConnection',
        summary: 'Update a home-automation connection',
        params: haConnectionParamsSchema,
        headers: ifMatchHeaders,
        body: updateHaConnectionRequestSchema,
        response: { 200: haConnectionSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const updated = await homeAutomation.updateConnection(
        tenantOf(request),
        request.params.houseId,
        request.params.connectionId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(updated.version));
      return updated;
    },
  );

  app.delete(
    `${connections}/:connectionId`,
    {
      config: { access: 'family', permission: 'automation.manage', planFeature: 'home_automation' },
      schema: {
        tags: ['automation'],
        operationId: 'automation.deleteConnection',
        summary: 'Delete a home-automation connection',
        params: haConnectionParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await homeAutomation.deleteConnection(
        tenantOf(request),
        request.params.houseId,
        request.params.connectionId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.post(
    `${connections}/:connectionId/test`,
    {
      config: {
        access: 'family',
        permission: 'automation.manage',
        planFeature: 'home_automation',
        idempotent: true,
      },
      schema: {
        tags: ['automation'],
        operationId: 'automation.testConnection',
        summary: 'Test a home-automation connection through the bridge adapter',
        params: haConnectionParamsSchema,
        headers: idempotencyHeaders,
        response: { 200: haConnectionTestResultSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) =>
      homeAutomation.testConnection(tenantOf(request), request.params.houseId, request.params.connectionId),
  );

  app.post(
    `${connections}/:connectionId/rotate-secret`,
    {
      config: {
        access: 'family',
        permission: 'automation.manage',
        planFeature: 'home_automation',
        idempotent: true,
      },
      schema: {
        tags: ['automation'],
        operationId: 'automation.rotateInboundSecret',
        summary: 'Rotate the inbound webhook secret',
        params: haConnectionParamsSchema,
        headers: idempotencyHeaders.and(ifMatchHeaders),
        response: { 200: haInboundSecretResponseSchema, ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      const rotated = await homeAutomation.rotateInboundSecret(
        tenantOf(request),
        request.params.houseId,
        request.params.connectionId,
        requireIfMatch(request),
      );
      void reply.header('etag', formatEtag(rotated.connection.version));
      return rotated;
    },
  );

  app.post(
    `${connections}/:connectionId/refresh`,
    {
      config: {
        access: 'family',
        permission: 'automation.manage',
        planFeature: 'home_automation',
        idempotent: true,
      },
      schema: {
        tags: ['automation'],
        operationId: 'automation.refreshDevices',
        summary: 'Refresh entity status through the bridge adapter',
        params: haConnectionParamsSchema,
        headers: idempotencyHeaders,
        response: { 200: haRefreshResultSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) =>
      homeAutomation.refreshDevices(tenantOf(request), request.params.houseId, request.params.connectionId),
  );

  app.get(
    devices,
    {
      config: { access: 'family', permission: 'automation.read', planFeature: 'home_automation' },
      schema: {
        tags: ['automation'],
        operationId: 'automation.listDevices',
        summary: 'List home-automation devices and latest status',
        params: houseParamsSchema,
        querystring: haDeviceListQuerySchema,
        response: { 200: haDevicePageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      homeAutomation.listDevices(tenantOf(request), request.params.houseId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        ...(request.query.kind === undefined ? {} : { kind: request.query.kind }),
      }),
  );

  app.patch(
    `${devices}/:deviceId`,
    {
      config: { access: 'family', permission: 'automation.manage', planFeature: 'home_automation' },
      schema: {
        tags: ['automation'],
        operationId: 'automation.updateDevice',
        summary: 'Rename a device or assign room and zone',
        params: haDeviceParamsSchema,
        headers: ifMatchHeaders,
        body: updateHaDeviceRequestSchema,
        response: { 200: haDeviceSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const updated = await homeAutomation.updateDevice(
        tenantOf(request),
        request.params.houseId,
        request.params.deviceId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(updated.version));
      return updated;
    },
  );

  app.get(
    zones,
    {
      config: { access: 'family', permission: 'automation.read', planFeature: 'home_automation' },
      schema: {
        tags: ['automation'],
        operationId: 'automation.listZones',
        summary: 'List zone alarms of a house',
        params: houseParamsSchema,
        querystring: pageQuerySchema,
        response: { 200: haZonePageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      homeAutomation.listZones(tenantOf(request), request.params.houseId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    zones,
    {
      config: {
        access: 'family',
        permission: 'automation.manage',
        planFeature: 'home_automation',
        idempotent: true,
      },
      schema: {
        tags: ['automation'],
        operationId: 'automation.createZone',
        summary: 'Create a zone alarm',
        params: houseParamsSchema,
        headers: idempotencyHeaders,
        body: createHaZoneRequestSchema,
        response: { 201: haZoneSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const created = await homeAutomation.createZone(
        tenantOf(request),
        request.params.houseId,
        request.body,
      );
      void reply.status(201).header('etag', formatEtag(created.version));
      return created;
    },
  );

  app.patch(
    `${zones}/:zoneId`,
    {
      config: { access: 'family', permission: 'automation.manage', planFeature: 'home_automation' },
      schema: {
        tags: ['automation'],
        operationId: 'automation.updateZone',
        summary: 'Update a zone or change its armed state',
        params: haZoneParamsSchema,
        headers: ifMatchHeaders,
        body: updateHaZoneRequestSchema,
        response: { 200: haZoneSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const updated = await homeAutomation.updateZone(
        tenantOf(request),
        request.params.houseId,
        request.params.zoneId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(updated.version));
      return updated;
    },
  );

  app.delete(
    `${zones}/:zoneId`,
    {
      config: { access: 'family', permission: 'automation.manage', planFeature: 'home_automation' },
      schema: {
        tags: ['automation'],
        operationId: 'automation.deleteZone',
        summary: 'Delete a zone alarm',
        params: haZoneParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await homeAutomation.deleteZone(
        tenantOf(request),
        request.params.houseId,
        request.params.zoneId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    events,
    {
      config: { access: 'family', permission: 'automation.read', planFeature: 'home_automation' },
      schema: {
        tags: ['automation'],
        operationId: 'automation.listEvents',
        summary: 'List recent home-automation events',
        params: houseParamsSchema,
        querystring: pageQuerySchema,
        response: { 200: haEventPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      homeAutomation.listEvents(tenantOf(request), request.params.houseId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.get(
    lockCodes,
    {
      config: { access: 'family', permission: 'automation.read', planFeature: 'home_automation' },
      schema: {
        tags: ['automation'],
        operationId: 'automation.listLockCodes',
        summary: 'List temporary smart-lock codes',
        params: houseParamsSchema,
        querystring: pageQuerySchema,
        response: { 200: haLockCodePageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      homeAutomation.listLockCodes(tenantOf(request), request.params.houseId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    `${devices}/:deviceId/lock-codes`,
    {
      config: {
        access: 'family',
        permission: 'automation.manage',
        planFeature: 'home_automation',
        idempotent: true,
      },
      schema: {
        tags: ['automation'],
        operationId: 'automation.issueLockCode',
        summary: 'Issue a temporary smart-lock code',
        params: haDeviceParamsSchema,
        headers: idempotencyHeaders,
        body: issueHaLockCodeRequestSchema,
        response: { 201: issueHaLockCodeResponseSchema, ...problemResponses(400, 401, 403, 404, 422) },
      },
    },
    async (request, reply) => {
      const issued = await homeAutomation.issueLockCode(
        tenantOf(request),
        request.params.houseId,
        request.params.deviceId,
        request.body,
      );
      void reply.status(201).header('etag', formatEtag(issued.lockCode.version));
      return issued;
    },
  );

  app.post(
    '/api/v1/public/webhooks/home-assistant/:connectionId',
    {
      config: { access: 'public' },
      schema: {
        tags: ['public'],
        operationId: 'automation.ingestHomeAssistant',
        summary: 'Ingest a signed Home Assistant webhook',
        params: haWebhookParamsSchema,
        body: homeAssistantIngestSchema,
        response: {
          202: z.object({ accepted: z.literal(true) }).strict(),
          ...problemResponses(400, 401, 404, 409),
        },
      },
    },
    async (request, reply) => {
      const rawBody = JSON.stringify(request.body);
      await homeAutomation.ingestWebhook(
        request.params.connectionId,
        rawBody,
        {
          timestamp:
            typeof request.headers['x-domusafe-timestamp'] === 'string'
              ? request.headers['x-domusafe-timestamp']
              : undefined,
          eventId:
            typeof request.headers['x-domusafe-event-id'] === 'string'
              ? request.headers['x-domusafe-event-id']
              : undefined,
          signature:
            typeof request.headers['x-domusafe-signature'] === 'string'
              ? request.headers['x-domusafe-signature']
              : undefined,
        },
        request.body,
      );
      return reply.status(202).send({ accepted: true as const });
    },
  );
};
