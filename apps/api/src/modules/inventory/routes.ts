import {
  createInventoryItemRequestSchema,
  createRoomRequestSchema,
  createSavedFilterRequestSchema,
  createStorageUnitRequestSchema,
  familyParamsSchema,
  formatEtag,
  houseParamsSchema,
  inventoryFilterSearchRequestSchema,
  inventoryItemListQuerySchema,
  inventoryItemPageSchema,
  inventoryItemParamsSchema,
  inventoryItemSchema,
  inventorySearchQuerySchema,
  inventorySearchResponseSchema,
  roomListQuerySchema,
  roomPageSchema,
  roomParamsSchema,
  roomSchema,
  savedFilterListSchema,
  savedFilterParamsSchema,
  savedFilterSchema,
  storageUnitListQuerySchema,
  storageUnitPageSchema,
  storageUnitParamsSchema,
  storageUnitSchema,
  updateInventoryItemRequestSchema,
  updateRoomRequestSchema,
  updateSavedFilterRequestSchema,
  updateStorageUnitRequestSchema,
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
import type { InventoryService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

function basePath(familyId: string, houseId: string): string {
  return `/api/v1/families/${familyId}/houses/${houseId}`;
}

/**
 * Routes of the hierarchical house inventory: rooms, storage units, items, nested AND/OR search
 * and up to five saved filters in the sidebar.
 *
 * Rooms use `house.read` / `house.write`. Storage units, items, search and own saved filters use
 * `inventory.read` / `inventory.write` (saved filters are further restricted to the owner by RLS).
 * Everyday inventory is available on every plan, so no route declares a plan feature.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Inventory service.
 */
export const inventoryRoutes: FastifyPluginAsyncZod<{ inventory: InventoryService }> = async (
  app,
  { inventory },
) => {
  const base = '/api/v1/families/:familyId/houses/:houseId';
  const savedFilters = '/api/v1/families/:familyId/saved-filters';

  app.get(
    `${base}/rooms`,
    {
      config: { access: 'family', permission: 'house.read' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.listRooms',
        summary: 'Rooms of one house',
        params: houseParamsSchema,
        querystring: roomListQuerySchema,
        response: { 200: roomPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      inventory.listRooms(tenantOf(request), request.params.houseId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    `${base}/rooms`,
    {
      config: { access: 'family', permission: 'house.write', idempotent: true },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.createRoom',
        summary: 'Add a room',
        params: houseParamsSchema,
        headers: idempotencyHeaders,
        body: createRoomRequestSchema,
        response: { 201: roomSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await inventory.createRoom(tenant, request.params.houseId, request.body);
      void reply
        .status(201)
        .header('location', `${basePath(tenant.familyId, request.params.houseId)}/rooms/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    `${base}/rooms/:roomId`,
    {
      config: { access: 'family', permission: 'house.read' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.getRoom',
        summary: 'One room',
        params: roomParamsSchema,
        response: { 200: roomSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await inventory.getRoom(tenantOf(request), request.params.houseId, request.params.roomId);
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${base}/rooms/:roomId`,
    {
      config: { access: 'family', permission: 'house.write' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.updateRoom',
        summary: 'Update a room',
        params: roomParamsSchema,
        headers: ifMatchHeaders,
        body: updateRoomRequestSchema,
        response: { 200: roomSchema, ...problemResponses(400, 401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      const row = await inventory.updateRoom(
        tenantOf(request),
        request.params.houseId,
        request.params.roomId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${base}/rooms/:roomId`,
    {
      config: { access: 'family', permission: 'house.write' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.deleteRoom',
        summary: 'Move a room to the trash',
        params: roomParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await inventory.deleteRoom(
        tenantOf(request),
        request.params.houseId,
        request.params.roomId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    `${base}/storage-units`,
    {
      config: { access: 'family', permission: 'inventory.read' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.listStorageUnits',
        summary: 'Closets and containers of one house',
        params: houseParamsSchema,
        querystring: storageUnitListQuerySchema,
        response: { 200: storageUnitPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      inventory.listStorageUnits(tenantOf(request), request.params.houseId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        ...(request.query.roomId === undefined ? {} : { roomId: request.query.roomId }),
      }),
  );

  app.post(
    `${base}/storage-units`,
    {
      config: { access: 'family', permission: 'inventory.write', idempotent: true },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.createStorageUnit',
        summary: 'Add a closet or container',
        params: houseParamsSchema,
        headers: idempotencyHeaders,
        body: createStorageUnitRequestSchema,
        response: { 201: storageUnitSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await inventory.createStorageUnit(tenant, request.params.houseId, request.body);
      void reply
        .status(201)
        .header('location', `${basePath(tenant.familyId, request.params.houseId)}/storage-units/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    `${base}/storage-units/:unitId`,
    {
      config: { access: 'family', permission: 'inventory.read' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.getStorageUnit',
        summary: 'One closet or container',
        params: storageUnitParamsSchema,
        response: { 200: storageUnitSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await inventory.getStorageUnit(
        tenantOf(request),
        request.params.houseId,
        request.params.unitId,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${base}/storage-units/:unitId`,
    {
      config: { access: 'family', permission: 'inventory.write' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.updateStorageUnit',
        summary: 'Update a closet or container',
        params: storageUnitParamsSchema,
        headers: ifMatchHeaders,
        body: updateStorageUnitRequestSchema,
        response: { 200: storageUnitSchema, ...problemResponses(400, 401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      const row = await inventory.updateStorageUnit(
        tenantOf(request),
        request.params.houseId,
        request.params.unitId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${base}/storage-units/:unitId`,
    {
      config: { access: 'family', permission: 'inventory.write' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.deleteStorageUnit',
        summary: 'Move a closet or container to the trash',
        params: storageUnitParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await inventory.deleteStorageUnit(
        tenantOf(request),
        request.params.houseId,
        request.params.unitId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    `${base}/inventory-items`,
    {
      config: { access: 'family', permission: 'inventory.read' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.listItems',
        summary: 'Inventory items of one house',
        params: houseParamsSchema,
        querystring: inventoryItemListQuerySchema,
        response: { 200: inventoryItemPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      inventory.listItems(tenantOf(request), request.params.houseId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        ...(request.query.roomId === undefined ? {} : { roomId: request.query.roomId }),
        ...(request.query.storageUnitId === undefined ? {} : { storageUnitId: request.query.storageUnitId }),
      }),
  );

  app.post(
    `${base}/inventory-items`,
    {
      config: { access: 'family', permission: 'inventory.write', idempotent: true },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.createItem',
        summary: 'Add an inventory item',
        params: houseParamsSchema,
        headers: idempotencyHeaders,
        body: createInventoryItemRequestSchema,
        response: { 201: inventoryItemSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await inventory.createItem(tenant, request.params.houseId, request.body);
      void reply
        .status(201)
        .header('location', `${basePath(tenant.familyId, request.params.houseId)}/inventory-items/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    `${base}/inventory-items/:itemId`,
    {
      config: { access: 'family', permission: 'inventory.read' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.getItem',
        summary: 'One inventory item',
        params: inventoryItemParamsSchema,
        response: { 200: inventoryItemSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await inventory.getItem(tenantOf(request), request.params.houseId, request.params.itemId);
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${base}/inventory-items/:itemId`,
    {
      config: { access: 'family', permission: 'inventory.write' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.updateItem',
        summary: 'Update an inventory item',
        params: inventoryItemParamsSchema,
        headers: ifMatchHeaders,
        body: updateInventoryItemRequestSchema,
        response: { 200: inventoryItemSchema, ...problemResponses(400, 401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      const row = await inventory.updateItem(
        tenantOf(request),
        request.params.houseId,
        request.params.itemId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${base}/inventory-items/:itemId`,
    {
      config: { access: 'family', permission: 'inventory.write' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.deleteItem',
        summary: 'Move an inventory item to the trash',
        params: inventoryItemParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await inventory.deleteItem(
        tenantOf(request),
        request.params.houseId,
        request.params.itemId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    `${base}/inventory/search`,
    {
      config: { access: 'family', permission: 'inventory.read' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.search',
        summary: 'Full-text search over the house inventory',
        params: houseParamsSchema,
        querystring: inventorySearchQuerySchema,
        response: { 200: inventorySearchResponseSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      inventory.search(tenantOf(request), request.params.houseId, {
        query: request.query.q,
        limit: request.query.limit,
        ...(request.query.tag === undefined ? {} : { tag: request.query.tag }),
        ...(request.query.tags === undefined ? {} : { tags: request.query.tags }),
        tagMode: request.query.tagMode,
      }),
  );

  app.post(
    `${base}/inventory/search`,
    {
      config: { access: 'family', permission: 'inventory.read' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.searchFiltered',
        summary: 'Nested AND/OR filter search over the house inventory',
        params: houseParamsSchema,
        body: inventoryFilterSearchRequestSchema,
        response: { 200: inventorySearchResponseSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      inventory.searchFiltered(tenantOf(request), request.params.houseId, {
        filter: request.body.filter,
        limit: request.body.limit,
      }),
  );

  app.get(
    savedFilters,
    {
      config: { access: 'family', permission: 'inventory.read' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.listSavedFilters',
        summary: 'Saved inventory filters of the caller (at most five)',
        params: familyParamsSchema,
        response: { 200: savedFilterListSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => inventory.listSavedFilters(tenantOf(request)),
  );

  app.post(
    savedFilters,
    {
      config: { access: 'family', permission: 'inventory.read', idempotent: true },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.createSavedFilter',
        summary: 'Save an inventory filter in the sidebar (max five)',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createSavedFilterRequestSchema,
        response: {
          201: savedFilterSchema,
          ...problemResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await inventory.createSavedFilter(tenant, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/saved-filters/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${savedFilters}/:filterId`,
    {
      config: { access: 'family', permission: 'inventory.read' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.updateSavedFilter',
        summary: "Update one of the caller's saved inventory filters",
        params: savedFilterParamsSchema,
        headers: ifMatchHeaders,
        body: updateSavedFilterRequestSchema,
        response: {
          200: savedFilterSchema,
          ...problemResponses(400, 401, 403, 404, 409, 422, 428),
        },
      },
    },
    async (request, reply) => {
      const row = await inventory.updateSavedFilter(
        tenantOf(request),
        request.params.filterId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${savedFilters}/:filterId`,
    {
      config: { access: 'family', permission: 'inventory.read' },
      schema: {
        tags: ['inventory'],
        operationId: 'inventory.deleteSavedFilter',
        summary: "Remove one of the caller's saved inventory filters",
        params: savedFilterParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await inventory.deleteSavedFilter(tenantOf(request), request.params.filterId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );
};
