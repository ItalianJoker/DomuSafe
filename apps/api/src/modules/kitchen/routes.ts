import {
  barcodeProductParamsSchema,
  barcodeProductSchema,
  checkShoppingItemRequestSchema,
  createMealPlanEntryRequestSchema,
  createPantryItemRequestSchema,
  createRecipeImportRequestSchema,
  createRecipeRequestSchema,
  createShoppingItemRequestSchema,
  createShoppingListRequestSchema,
  createStoreRequestSchema,
  familyParamsSchema,
  formatEtag,
  houseParamsSchema,
  mealPlanEntryParamsSchema,
  mealPlanEntryPageSchema,
  mealPlanEntrySchema,
  mealPlanListQuerySchema,
  pantryItemListQuerySchema,
  pantryItemPageSchema,
  pantryItemParamsSchema,
  pantryItemSchema,
  recipeImportParamsSchema,
  recipeImportSchema,
  recipeListQuerySchema,
  recipePageSchema,
  recipeParamsSchema,
  recipeSchema,
  shoppingItemListQuerySchema,
  shoppingItemPageSchema,
  shoppingItemParamsSchema,
  shoppingItemSchema,
  shoppingListListQuerySchema,
  shoppingListPageSchema,
  shoppingListParamsSchema,
  shoppingListSchema,
  storeListQuerySchema,
  storePageSchema,
  storeParamsSchema,
  storeSchema,
  updateMealPlanEntryRequestSchema,
  updatePantryItemRequestSchema,
  updateRecipeRequestSchema,
  updateShoppingItemRequestSchema,
  updateShoppingListRequestSchema,
  updateStoreRequestSchema,
  upsertBarcodeProductRequestSchema,
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
import type { KitchenService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

/**
 * Routes of family recipes, meal plan, pantry, URL import, stores and shopping lists.
 * Permissions follow `kitchen.*` and `shopping.*`. No plan feature gate — Free includes them.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Kitchen service.
 */
export const kitchenRoutes: FastifyPluginAsyncZod<{ kitchen: KitchenService }> = async (app, { kitchen }) => {
  const family = '/api/v1/families/:familyId';
  const recipesPath = `${family}/recipes`;
  const importsPath = `${family}/recipe-imports`;
  const mealPlanPath = `${family}/meal-plan`;
  const pantryPath = `${family}/houses/:houseId/pantry-items`;
  const barcodePath = `${family}/barcode-products`;
  const storesPath = `${family}/stores`;
  const listsPath = `${family}/shopping-lists`;

  app.get(
    recipesPath,
    {
      config: { access: 'family', permission: 'kitchen.read' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.listRecipes',
        summary: 'List family recipes',
        params: familyParamsSchema,
        querystring: recipeListQuerySchema,
        response: { 200: recipePageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      kitchen.listRecipes(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        q: request.query.q,
      }),
  );

  app.post(
    recipesPath,
    {
      config: { access: 'family', permission: 'kitchen.write', idempotent: true },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.createRecipe',
        summary: 'Create a recipe by hand',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createRecipeRequestSchema,
        response: { 201: recipeSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await kitchen.createRecipe(tenant, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/recipes/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    `${recipesPath}/:recipeId`,
    {
      config: { access: 'family', permission: 'kitchen.read' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.getRecipe',
        summary: 'Get one recipe',
        params: recipeParamsSchema,
        response: { 200: recipeSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await kitchen.getRecipe(tenantOf(request), request.params.recipeId);
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${recipesPath}/:recipeId`,
    {
      config: { access: 'family', permission: 'kitchen.write' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.updateRecipe',
        summary: 'Update a recipe',
        params: recipeParamsSchema,
        headers: ifMatchHeaders,
        body: updateRecipeRequestSchema,
        response: { 200: recipeSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await kitchen.updateRecipe(
        tenantOf(request),
        request.params.recipeId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${recipesPath}/:recipeId`,
    {
      config: { access: 'family', permission: 'kitchen.write' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.deleteRecipe',
        summary: 'Soft-delete a recipe',
        params: recipeParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await kitchen.deleteRecipe(tenantOf(request), request.params.recipeId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );

  app.post(
    importsPath,
    {
      config: { access: 'family', permission: 'kitchen.write', idempotent: true },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.importRecipe',
        summary: 'Import a recipe from a public URL',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createRecipeImportRequestSchema,
        response: { 202: recipeImportSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await kitchen.importRecipe(tenant, request.body);
      void reply
        .status(202)
        .header('location', `/api/v1/families/${tenant.familyId}/recipe-imports/${row.id}`);
      return row;
    },
  );

  app.get(
    `${importsPath}/:importId`,
    {
      config: { access: 'family', permission: 'kitchen.write' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.getRecipeImport',
        summary: 'Get one recipe import',
        params: recipeImportParamsSchema,
        response: { 200: recipeImportSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => kitchen.getRecipeImport(tenantOf(request), request.params.importId),
  );

  app.get(
    storesPath,
    {
      config: { access: 'family', permission: 'shopping.read' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.listStores',
        summary: 'List family stores',
        params: familyParamsSchema,
        querystring: storeListQuerySchema,
        response: { 200: storePageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      kitchen.listStores(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    storesPath,
    {
      config: { access: 'family', permission: 'shopping.write', idempotent: true },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.createStore',
        summary: 'Create a store',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createStoreRequestSchema,
        response: { 201: storeSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await kitchen.createStore(tenant, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/stores/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    `${storesPath}/:storeId`,
    {
      config: { access: 'family', permission: 'shopping.read' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.getStore',
        summary: 'Get one store',
        params: storeParamsSchema,
        response: { 200: storeSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await kitchen.getStore(tenantOf(request), request.params.storeId);
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${storesPath}/:storeId`,
    {
      config: { access: 'family', permission: 'shopping.write' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.updateStore',
        summary: 'Update a store',
        params: storeParamsSchema,
        headers: ifMatchHeaders,
        body: updateStoreRequestSchema,
        response: { 200: storeSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await kitchen.updateStore(
        tenantOf(request),
        request.params.storeId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${storesPath}/:storeId`,
    {
      config: { access: 'family', permission: 'shopping.write' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.deleteStore',
        summary: 'Soft-delete a store',
        params: storeParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await kitchen.deleteStore(tenantOf(request), request.params.storeId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );

  app.get(
    listsPath,
    {
      config: { access: 'family', permission: 'shopping.read' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.listShoppingLists',
        summary: 'List shopping lists',
        params: familyParamsSchema,
        querystring: shoppingListListQuerySchema,
        response: { 200: shoppingListPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      kitchen.listShoppingLists(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        houseId: request.query.houseId,
        storeId: request.query.storeId,
        archived: request.query.archived,
      }),
  );

  app.post(
    listsPath,
    {
      config: { access: 'family', permission: 'shopping.write', idempotent: true },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.createShoppingList',
        summary: 'Create a shopping list',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createShoppingListRequestSchema,
        response: { 201: shoppingListSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await kitchen.createShoppingList(tenant, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/shopping-lists/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    `${listsPath}/:listId`,
    {
      config: { access: 'family', permission: 'shopping.read' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.getShoppingList',
        summary: 'Get one shopping list',
        params: shoppingListParamsSchema,
        response: { 200: shoppingListSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await kitchen.getShoppingList(tenantOf(request), request.params.listId);
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${listsPath}/:listId`,
    {
      config: { access: 'family', permission: 'shopping.write' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.updateShoppingList',
        summary: 'Update a shopping list',
        params: shoppingListParamsSchema,
        headers: ifMatchHeaders,
        body: updateShoppingListRequestSchema,
        response: { 200: shoppingListSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await kitchen.updateShoppingList(
        tenantOf(request),
        request.params.listId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${listsPath}/:listId`,
    {
      config: { access: 'family', permission: 'shopping.write' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.deleteShoppingList',
        summary: 'Soft-delete a shopping list',
        params: shoppingListParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await kitchen.deleteShoppingList(tenantOf(request), request.params.listId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );

  app.get(
    `${listsPath}/:listId/items`,
    {
      config: { access: 'family', permission: 'shopping.read' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.listShoppingItems',
        summary: 'List shopping items on one list',
        params: shoppingListParamsSchema,
        querystring: shoppingItemListQuerySchema,
        response: { 200: shoppingItemPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      kitchen.listShoppingItems(tenantOf(request), request.params.listId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        openOnly: request.query.openOnly,
      }),
  );

  app.post(
    `${listsPath}/:listId/items`,
    {
      config: { access: 'family', permission: 'shopping.write', idempotent: true },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.createShoppingItem',
        summary: 'Add an item to a shopping list',
        params: shoppingListParamsSchema,
        headers: idempotencyHeaders,
        body: createShoppingItemRequestSchema,
        response: { 201: shoppingItemSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await kitchen.createShoppingItem(tenant, request.params.listId, request.body);
      void reply
        .status(201)
        .header(
          'location',
          `/api/v1/families/${tenant.familyId}/shopping-lists/${request.params.listId}/items/${row.id}`,
        )
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${listsPath}/:listId/items/:itemId`,
    {
      config: { access: 'family', permission: 'shopping.write' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.updateShoppingItem',
        summary: 'Update a shopping item',
        params: shoppingItemParamsSchema,
        headers: ifMatchHeaders,
        body: updateShoppingItemRequestSchema,
        response: { 200: shoppingItemSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await kitchen.updateShoppingItem(
        tenantOf(request),
        request.params.listId,
        request.params.itemId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.post(
    `${listsPath}/:listId/items/:itemId/check`,
    {
      config: { access: 'family', permission: 'shopping.write', idempotent: true },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.checkShoppingItem',
        summary: 'Check or uncheck a shopping item',
        params: shoppingItemParamsSchema,
        headers: idempotencyHeaders.and(ifMatchHeaders),
        body: checkShoppingItemRequestSchema,
        response: { 200: shoppingItemSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await kitchen.checkShoppingItem(
        tenantOf(request),
        request.params.listId,
        request.params.itemId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${listsPath}/:listId/items/:itemId`,
    {
      config: { access: 'family', permission: 'shopping.write' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.deleteShoppingItem',
        summary: 'Soft-delete a shopping item',
        params: shoppingItemParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await kitchen.deleteShoppingItem(
        tenantOf(request),
        request.params.listId,
        request.params.itemId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    mealPlanPath,
    {
      config: { access: 'family', permission: 'kitchen.read' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.listMealPlan',
        summary: 'List meal plan entries in a date range',
        params: familyParamsSchema,
        querystring: mealPlanListQuerySchema,
        response: { 200: mealPlanEntryPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      kitchen.listMealPlan(tenantOf(request), {
        from: request.query.from,
        to: request.query.to,
        houseId: request.query.houseId,
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    mealPlanPath,
    {
      config: { access: 'family', permission: 'kitchen.write', idempotent: true },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.createMealPlanEntry',
        summary: 'Add a meal to the plan',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createMealPlanEntryRequestSchema,
        response: { 201: mealPlanEntrySchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await kitchen.createMealPlanEntry(tenant, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/meal-plan/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${mealPlanPath}/:entryId`,
    {
      config: { access: 'family', permission: 'kitchen.write' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.updateMealPlanEntry',
        summary: 'Update a meal plan entry',
        params: mealPlanEntryParamsSchema,
        headers: ifMatchHeaders,
        body: updateMealPlanEntryRequestSchema,
        response: { 200: mealPlanEntrySchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await kitchen.updateMealPlanEntry(
        tenantOf(request),
        request.params.entryId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${mealPlanPath}/:entryId`,
    {
      config: { access: 'family', permission: 'kitchen.write' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.deleteMealPlanEntry',
        summary: 'Soft-delete a meal plan entry',
        params: mealPlanEntryParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await kitchen.deleteMealPlanEntry(tenantOf(request), request.params.entryId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );

  app.get(
    pantryPath,
    {
      config: { access: 'family', permission: 'kitchen.read' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.listPantryItems',
        summary: 'List pantry items of one house',
        params: houseParamsSchema,
        querystring: pantryItemListQuerySchema,
        response: { 200: pantryItemPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      kitchen.listPantryItems(tenantOf(request), request.params.houseId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        q: request.query.q,
        barcode: request.query.barcode,
        lowStock: request.query.lowStock,
      }),
  );

  app.post(
    pantryPath,
    {
      config: { access: 'family', permission: 'kitchen.write', idempotent: true },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.createPantryItem',
        summary: 'Add a pantry item by hand',
        params: houseParamsSchema,
        headers: idempotencyHeaders,
        body: createPantryItemRequestSchema,
        response: { 201: pantryItemSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await kitchen.createPantryItem(tenant, request.params.houseId, request.body);
      void reply
        .status(201)
        .header(
          'location',
          `/api/v1/families/${tenant.familyId}/houses/${request.params.houseId}/pantry-items/${row.id}`,
        )
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    `${pantryPath}/:itemId`,
    {
      config: { access: 'family', permission: 'kitchen.read' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.getPantryItem',
        summary: 'Get one pantry item',
        params: pantryItemParamsSchema,
        response: { 200: pantryItemSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await kitchen.getPantryItem(
        tenantOf(request),
        request.params.houseId,
        request.params.itemId,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${pantryPath}/:itemId`,
    {
      config: { access: 'family', permission: 'kitchen.write' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.updatePantryItem',
        summary: 'Update a pantry item',
        params: pantryItemParamsSchema,
        headers: ifMatchHeaders,
        body: updatePantryItemRequestSchema,
        response: { 200: pantryItemSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await kitchen.updatePantryItem(
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
    `${pantryPath}/:itemId`,
    {
      config: { access: 'family', permission: 'kitchen.write' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.deletePantryItem',
        summary: 'Soft-delete a pantry item',
        params: pantryItemParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await kitchen.deletePantryItem(
        tenantOf(request),
        request.params.houseId,
        request.params.itemId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    `${barcodePath}/:code`,
    {
      config: { access: 'family', permission: 'kitchen.read' },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.getBarcodeProduct',
        summary: 'Look up a remembered barcode product',
        params: barcodeProductParamsSchema,
        response: { 200: barcodeProductSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => kitchen.getBarcodeProduct(tenantOf(request), request.params.code),
  );

  app.put(
    `${barcodePath}/:code`,
    {
      config: { access: 'family', permission: 'kitchen.write', idempotent: true },
      schema: {
        tags: ['kitchen'],
        operationId: 'kitchen.upsertBarcodeProduct',
        summary: 'Remember a product by barcode',
        params: barcodeProductParamsSchema,
        headers: idempotencyHeaders,
        body: upsertBarcodeProductRequestSchema,
        response: { 200: barcodeProductSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request) => kitchen.upsertBarcodeProduct(tenantOf(request), request.params.code, request.body),
  );
};
