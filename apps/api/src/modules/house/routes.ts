import {
  contactListQuerySchema,
  contactPageSchema,
  contactParamsSchema,
  contactSchema,
  createContactRequestSchema,
  createGuideEntryRequestSchema,
  createMaintenanceTaskRequestSchema,
  createShutoffRequestSchema,
  createUtilityRequestSchema,
  createWasteCollectionRequestSchema,
  familyParamsSchema,
  formatEtag,
  guideEntryPageSchema,
  guideEntryParamsSchema,
  guideEntrySchema,
  guideListQuerySchema,
  guestViewSchema,
  houseParamsSchema,
  pageQuerySchema,
  maintenanceListQuerySchema,
  maintenanceTaskPageSchema,
  maintenanceTaskParamsSchema,
  maintenanceTaskSchema,
  shutoffPageSchema,
  shutoffParamsSchema,
  shutoffSchema,
  updateContactRequestSchema,
  updateGuideEntryRequestSchema,
  updateMaintenanceTaskRequestSchema,
  updateShutoffRequestSchema,
  updateUtilityRequestSchema,
  updateWasteCollectionRequestSchema,
  utilityPageSchema,
  utilityParamsSchema,
  utilitySchema,
  wasteCollectionPageSchema,
  wasteCollectionParamsSchema,
  wasteCollectionSchema,
} from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  idempotencyHeaders,
  ifMatchHeaders,
  instantCursor,
  numericCursor,
  problemResponses,
  requireIfMatch,
} from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import type { HouseService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

/**
 * Routes of the house manual: guest and technical entries, cutoffs, waste, contacts, utilities and
 * maintenance deadlines (phase 3 §5.9). Casa and utilities are part of the Free plan, so none of these
 * routes declare a plan feature.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - House service.
 */
export const houseRoutes: FastifyPluginAsyncZod<{ house: HouseService }> = async (app, { house }) => {
  const base = '/api/v1/families/:familyId/houses/:houseId';

  app.get(
    `${base}/guide-entries`,
    {
      config: { access: 'family', permission: 'house.guest_view.read' },
      schema: {
        tags: ['house'],
        operationId: 'house.listGuideEntries',
        summary: 'House manual entries visible to the caller',
        params: houseParamsSchema,
        querystring: guideListQuerySchema,
        response: { 200: guideEntryPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      house.listGuideEntries(tenantOf(request), request.params.houseId, {
        limit: request.query.limit,
        after: numericCursor(request.query.cursor),
        ...(request.query.audience === undefined ? {} : { audience: request.query.audience }),
      }),
  );

  app.post(
    `${base}/guide-entries`,
    {
      config: { access: 'family', permission: 'house.guest_view.write', idempotent: true },
      schema: {
        tags: ['house'],
        operationId: 'house.createGuideEntry',
        summary: 'Add a guest or technical manual entry',
        params: houseParamsSchema,
        headers: idempotencyHeaders,
        body: createGuideEntryRequestSchema,
        response: { 201: guideEntrySchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const entry = await house.createGuideEntry(tenant, request.params.houseId, request.body);
      void reply
        .status(201)
        .header('location', `${basePath(tenant.familyId, request.params.houseId)}/guide-entries/${entry.id}`)
        .header('etag', formatEtag(entry.version));
      return entry;
    },
  );

  app.get(
    `${base}/guide-entries/:entryId`,
    {
      config: { access: 'family', permission: 'house.guest_view.read' },
      schema: {
        tags: ['house'],
        operationId: 'house.getGuideEntry',
        summary: 'One manual entry',
        params: guideEntryParamsSchema,
        response: { 200: guideEntrySchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const entry = await house.getGuideEntry(
        tenantOf(request),
        request.params.houseId,
        request.params.entryId,
      );
      void reply.header('etag', formatEtag(entry.version));
      return entry;
    },
  );

  app.patch(
    `${base}/guide-entries/:entryId`,
    {
      config: { access: 'family', permission: 'house.guest_view.write' },
      schema: {
        tags: ['house'],
        operationId: 'house.updateGuideEntry',
        summary: 'Update a manual entry',
        params: guideEntryParamsSchema,
        headers: ifMatchHeaders,
        body: updateGuideEntryRequestSchema,
        response: { 200: guideEntrySchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const entry = await house.updateGuideEntry(
        tenantOf(request),
        request.params.houseId,
        request.params.entryId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(entry.version));
      return entry;
    },
  );

  app.delete(
    `${base}/guide-entries/:entryId`,
    {
      config: { access: 'family', permission: 'house.guest_view.write' },
      schema: {
        tags: ['house'],
        operationId: 'house.deleteGuideEntry',
        summary: 'Move a manual entry to the trash',
        params: guideEntryParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await house.deleteGuideEntry(
        tenantOf(request),
        request.params.houseId,
        request.params.entryId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    `${base}/guest-view`,
    {
      config: { access: 'family', permission: 'house.guest_view.read' },
      schema: {
        tags: ['house'],
        operationId: 'house.getGuestView',
        summary: 'What a guest of this house can read',
        params: houseParamsSchema,
        response: { 200: guestViewSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => house.getGuestView(tenantOf(request), request.params.houseId),
  );

  app.get(
    `${base}/guest-view/preview`,
    {
      config: { access: 'family', permission: 'house.write' },
      schema: {
        tags: ['house'],
        operationId: 'house.previewGuestView',
        summary: 'Guest projection for the people who edit the house',
        params: houseParamsSchema,
        response: { 200: guestViewSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => house.previewGuestView(tenantOf(request), request.params.houseId),
  );

  app.get(
    `${base}/shutoffs`,
    {
      config: { access: 'family', permission: 'house.technical.read' },
      schema: {
        tags: ['house'],
        operationId: 'house.listShutoffs',
        summary: 'Water, gas, electricity and boiler cutoffs',
        params: houseParamsSchema,
        querystring: pageQuerySchema,
        response: { 200: shutoffPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      house.listShutoffs(tenantOf(request), request.params.houseId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    `${base}/shutoffs`,
    {
      config: { access: 'family', permission: 'house.technical.write', idempotent: true },
      schema: {
        tags: ['house'],
        operationId: 'house.createShutoff',
        summary: 'Add a cutoff location',
        params: houseParamsSchema,
        headers: idempotencyHeaders,
        body: createShutoffRequestSchema,
        response: { 201: shutoffSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await house.createShutoff(tenant, request.params.houseId, request.body);
      void reply
        .status(201)
        .header('location', `${basePath(tenant.familyId, request.params.houseId)}/shutoffs/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    `${base}/shutoffs/:shutoffId`,
    {
      config: { access: 'family', permission: 'house.technical.read' },
      schema: {
        tags: ['house'],
        operationId: 'house.getShutoff',
        summary: 'One cutoff',
        params: shutoffParamsSchema,
        response: { 200: shutoffSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await house.getShutoff(tenantOf(request), request.params.houseId, request.params.shutoffId);
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${base}/shutoffs/:shutoffId`,
    {
      config: { access: 'family', permission: 'house.technical.write' },
      schema: {
        tags: ['house'],
        operationId: 'house.updateShutoff',
        summary: 'Update a cutoff',
        params: shutoffParamsSchema,
        headers: ifMatchHeaders,
        body: updateShutoffRequestSchema,
        response: { 200: shutoffSchema, ...problemResponses(400, 401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      const row = await house.updateShutoff(
        tenantOf(request),
        request.params.houseId,
        request.params.shutoffId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${base}/shutoffs/:shutoffId`,
    {
      config: { access: 'family', permission: 'house.technical.write' },
      schema: {
        tags: ['house'],
        operationId: 'house.deleteShutoff',
        summary: 'Move a cutoff to the trash',
        params: shutoffParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await house.deleteShutoff(
        tenantOf(request),
        request.params.houseId,
        request.params.shutoffId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    `${base}/waste-collections`,
    {
      config: { access: 'family', permission: 'house.guest_view.read' },
      schema: {
        tags: ['house'],
        operationId: 'house.listWasteCollections',
        summary: 'Waste collection rules',
        params: houseParamsSchema,
        querystring: pageQuerySchema,
        response: { 200: wasteCollectionPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      house.listWaste(tenantOf(request), request.params.houseId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    `${base}/waste-collections`,
    {
      config: { access: 'family', permission: 'house.write', idempotent: true },
      schema: {
        tags: ['house'],
        operationId: 'house.createWasteCollection',
        summary: 'Add a waste collection rule',
        params: houseParamsSchema,
        headers: idempotencyHeaders,
        body: createWasteCollectionRequestSchema,
        response: { 201: wasteCollectionSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await house.createWaste(tenant, request.params.houseId, request.body);
      void reply
        .status(201)
        .header(
          'location',
          `${basePath(tenant.familyId, request.params.houseId)}/waste-collections/${row.id}`,
        )
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    `${base}/waste-collections/:collectionId`,
    {
      config: { access: 'family', permission: 'house.guest_view.read' },
      schema: {
        tags: ['house'],
        operationId: 'house.getWasteCollection',
        summary: 'One waste collection rule',
        params: wasteCollectionParamsSchema,
        response: { 200: wasteCollectionSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await house.getWaste(
        tenantOf(request),
        request.params.houseId,
        request.params.collectionId,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${base}/waste-collections/:collectionId`,
    {
      config: { access: 'family', permission: 'house.write' },
      schema: {
        tags: ['house'],
        operationId: 'house.updateWasteCollection',
        summary: 'Update a waste collection rule',
        params: wasteCollectionParamsSchema,
        headers: ifMatchHeaders,
        body: updateWasteCollectionRequestSchema,
        response: { 200: wasteCollectionSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await house.updateWaste(
        tenantOf(request),
        request.params.houseId,
        request.params.collectionId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${base}/waste-collections/:collectionId`,
    {
      config: { access: 'family', permission: 'house.write' },
      schema: {
        tags: ['house'],
        operationId: 'house.deleteWasteCollection',
        summary: 'Delete a waste collection rule',
        params: wasteCollectionParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await house.deleteWaste(
        tenantOf(request),
        request.params.houseId,
        request.params.collectionId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    `${base}/utilities`,
    {
      config: { access: 'family', permission: 'utilities.read' },
      schema: {
        tags: ['house'],
        operationId: 'house.listUtilities',
        summary: 'Utility contracts of the house',
        params: houseParamsSchema,
        querystring: pageQuerySchema,
        response: { 200: utilityPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      house.listUtilities(tenantOf(request), request.params.houseId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    `${base}/utilities`,
    {
      config: { access: 'family', permission: 'utilities.write', idempotent: true },
      schema: {
        tags: ['house'],
        operationId: 'house.createUtility',
        summary: 'Add a utility contract',
        params: houseParamsSchema,
        headers: idempotencyHeaders,
        body: createUtilityRequestSchema,
        response: { 201: utilitySchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await house.createUtility(tenant, request.params.houseId, request.body);
      void reply
        .status(201)
        .header('location', `${basePath(tenant.familyId, request.params.houseId)}/utilities/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    `${base}/utilities/:utilityId`,
    {
      config: { access: 'family', permission: 'utilities.read' },
      schema: {
        tags: ['house'],
        operationId: 'house.getUtility',
        summary: 'One utility contract',
        params: utilityParamsSchema,
        response: { 200: utilitySchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await house.getUtility(tenantOf(request), request.params.houseId, request.params.utilityId);
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${base}/utilities/:utilityId`,
    {
      config: { access: 'family', permission: 'utilities.write' },
      schema: {
        tags: ['house'],
        operationId: 'house.updateUtility',
        summary: 'Update a utility contract',
        params: utilityParamsSchema,
        headers: ifMatchHeaders,
        body: updateUtilityRequestSchema,
        response: { 200: utilitySchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await house.updateUtility(
        tenantOf(request),
        request.params.houseId,
        request.params.utilityId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${base}/utilities/:utilityId`,
    {
      config: { access: 'family', permission: 'utilities.write' },
      schema: {
        tags: ['house'],
        operationId: 'house.deleteUtility',
        summary: 'Move a utility contract to the trash',
        params: utilityParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await house.deleteUtility(
        tenantOf(request),
        request.params.houseId,
        request.params.utilityId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    `${base}/maintenance-tasks`,
    {
      config: { access: 'family', permission: 'maintenance.read' },
      schema: {
        tags: ['house'],
        operationId: 'house.listMaintenanceTasks',
        summary: 'Maintenance tasks, including the boiler check',
        params: houseParamsSchema,
        querystring: maintenanceListQuerySchema,
        response: { 200: maintenanceTaskPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      house.listMaintenance(tenantOf(request), request.params.houseId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        ...(request.query.category === undefined ? {} : { category: request.query.category }),
      }),
  );

  app.post(
    `${base}/maintenance-tasks`,
    {
      config: { access: 'family', permission: 'maintenance.write', idempotent: true },
      schema: {
        tags: ['house'],
        operationId: 'house.createMaintenanceTask',
        summary: 'Add a maintenance task',
        params: houseParamsSchema,
        headers: idempotencyHeaders,
        body: createMaintenanceTaskRequestSchema,
        response: { 201: maintenanceTaskSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await house.createMaintenance(tenant, request.params.houseId, request.body);
      void reply
        .status(201)
        .header(
          'location',
          `${basePath(tenant.familyId, request.params.houseId)}/maintenance-tasks/${row.id}`,
        )
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    `${base}/maintenance-tasks/:taskId`,
    {
      config: { access: 'family', permission: 'maintenance.read' },
      schema: {
        tags: ['house'],
        operationId: 'house.getMaintenanceTask',
        summary: 'One maintenance task',
        params: maintenanceTaskParamsSchema,
        response: { 200: maintenanceTaskSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await house.getMaintenance(
        tenantOf(request),
        request.params.houseId,
        request.params.taskId,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${base}/maintenance-tasks/:taskId`,
    {
      config: { access: 'family', permission: 'maintenance.write' },
      schema: {
        tags: ['house'],
        operationId: 'house.updateMaintenanceTask',
        summary: 'Update a maintenance task',
        params: maintenanceTaskParamsSchema,
        headers: ifMatchHeaders,
        body: updateMaintenanceTaskRequestSchema,
        response: { 200: maintenanceTaskSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await house.updateMaintenance(
        tenantOf(request),
        request.params.houseId,
        request.params.taskId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${base}/maintenance-tasks/:taskId`,
    {
      config: { access: 'family', permission: 'maintenance.write' },
      schema: {
        tags: ['house'],
        operationId: 'house.deleteMaintenanceTask',
        summary: 'Move a maintenance task to the trash',
        params: maintenanceTaskParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await house.deleteMaintenance(
        tenantOf(request),
        request.params.houseId,
        request.params.taskId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/api/v1/families/:familyId/contacts',
    {
      config: { access: 'family', permission: 'contacts.read' },
      schema: {
        tags: ['house'],
        operationId: 'house.listContacts',
        summary: 'Family address book',
        params: familyParamsSchema,
        querystring: contactListQuerySchema,
        response: { 200: contactPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      house.listContacts(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        ...(request.query.kind === undefined ? {} : { kind: request.query.kind }),
        ...(request.query.houseId === undefined ? {} : { houseId: request.query.houseId }),
      }),
  );

  app.post(
    '/api/v1/families/:familyId/contacts',
    {
      config: { access: 'family', permission: 'contacts.write', idempotent: true },
      schema: {
        tags: ['house'],
        operationId: 'house.createContact',
        summary: 'Add a contact',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createContactRequestSchema,
        response: { 201: contactSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await house.createContact(tenant, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/contacts/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    '/api/v1/families/:familyId/contacts/:contactId',
    {
      config: { access: 'family', permission: 'contacts.read' },
      schema: {
        tags: ['house'],
        operationId: 'house.getContact',
        summary: 'One contact',
        params: contactParamsSchema,
        response: { 200: contactSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await house.getContact(tenantOf(request), request.params.contactId);
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    '/api/v1/families/:familyId/contacts/:contactId',
    {
      config: { access: 'family', permission: 'contacts.write' },
      schema: {
        tags: ['house'],
        operationId: 'house.updateContact',
        summary: 'Update a contact',
        params: contactParamsSchema,
        headers: ifMatchHeaders,
        body: updateContactRequestSchema,
        response: { 200: contactSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await house.updateContact(
        tenantOf(request),
        request.params.contactId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    '/api/v1/families/:familyId/contacts/:contactId',
    {
      config: { access: 'family', permission: 'contacts.write' },
      schema: {
        tags: ['house'],
        operationId: 'house.deleteContact',
        summary: 'Move a contact to the trash',
        params: contactParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await house.deleteContact(tenantOf(request), request.params.contactId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );
};

function basePath(familyId: string, houseId: string): string {
  return `/api/v1/families/${familyId}/houses/${houseId}`;
}
