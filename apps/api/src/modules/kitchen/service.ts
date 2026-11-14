import {
  encodeCursor,
  type CheckShoppingItemRequest,
  type CreateRecipeImportRequest,
  type CreateRecipeRequest,
  type CreateShoppingItemRequest,
  type CreateShoppingListRequest,
  type CreateStoreRequest,
  type Recipe,
  type RecipeImport,
  type RecipeIngredient,
  type ShoppingItem,
  type ShoppingList,
  type Store,
  type UpdateRecipeRequest,
  type UpdateShoppingItemRequest,
  type UpdateShoppingListRequest,
  type UpdateStoreRequest,
} from '@domusafe/contracts';
import { recordAudit, recordRevision, withContext, type Database, type Transaction } from '@domusafe/db';
import { ProblemError, classifyDatabaseError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import { importRecipeFromUrl } from './import-url.js';
import * as repo from './repository.js';

/** One page of a list. */
export interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

const account = (accountId: string): { kind: 'account'; accountId: string } => ({
  kind: 'account',
  accountId,
});

function rethrowDatabaseError(error: unknown): never {
  if (error instanceof ProblemError) {
    throw error;
  }
  const failure = classifyDatabaseError(error);
  switch (failure.kind) {
    case 'rls_denied':
      throw new ProblemError('forbidden');
    case 'unique':
      throw new ProblemError('duplicate');
    case 'foreign_key':
      throw new ProblemError('validation_failed', {
        detail: 'A referenced item does not exist in this family',
      });
    case 'check':
      throw new ProblemError('domain_rule_violated', {
        detail: `Constraint ${failure.constraint ?? 'check'} violated`,
      });
    case 'other':
      throw error;
  }
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    rethrowDatabaseError(error);
  }
}

function conflict(currentVersion: number): never {
  throw new ProblemError('version_conflict', { currentVersion });
}

function pageOfCreated<TRow extends { createdAt: Date; id: string }, TView>(
  rows: TRow[],
  limit: number,
  view: (row: TRow) => TView,
): Page<TView> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice.at(-1);
  return {
    items: slice.map(view),
    nextCursor: hasMore && last !== undefined ? encodeCursor([last.createdAt.toISOString(), last.id]) : null,
  };
}

function ingredientsOf(value: unknown): RecipeIngredient[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: RecipeIngredient[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== 'string') {
      continue;
    }
    out.push({
      name: record.name,
      quantity: typeof record.quantity === 'number' ? record.quantity : null,
      unit: typeof record.unit === 'string' ? record.unit : null,
      note: typeof record.note === 'string' ? record.note : null,
    });
  }
  return out;
}

function stepsOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function recipeView(row: repo.RecipeRow): Recipe {
  return {
    id: row.id,
    familyId: row.familyId,
    title: row.title,
    description: row.description,
    servings: row.servings,
    prepMinutes: row.prepMinutes,
    cookMinutes: row.cookMinutes,
    ingredients: ingredientsOf(row.ingredients),
    steps: stepsOf(row.steps),
    tags: row.tags,
    sourceUrl: row.sourceUrl,
    sourceName: row.sourceName,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function importView(row: repo.RecipeImportRow): RecipeImport {
  return {
    id: row.id,
    familyId: row.familyId,
    url: row.url,
    status: row.status,
    errorCode: row.errorCode,
    recipeId: row.recipeId,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function storeView(row: repo.StoreRow): Store {
  return {
    id: row.id,
    familyId: row.familyId,
    name: row.name,
    aisleOrder: row.aisleOrder,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function listView(row: repo.ShoppingListRow): ShoppingList {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    storeId: row.storeId,
    name: row.name,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function quantityOf(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Stored quantity is invalid');
  }
  return parsed;
}

function itemView(row: repo.ShoppingItemRow): ShoppingItem {
  return {
    id: row.id,
    familyId: row.familyId,
    listId: row.listId,
    name: row.name,
    quantity: quantityOf(row.quantity),
    unit: row.unit,
    aisle: row.aisle,
    position: row.position,
    checkedAt: row.checkedAt?.toISOString() ?? null,
    checkedBy: row.checkedBy,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function trace(
  tx: Transaction,
  tenant: TenantContext,
  input: {
    readonly resourceType: string;
    readonly resourceId: string;
    readonly op: 'create' | 'update' | 'delete';
    readonly version: number;
    readonly action: string;
    readonly data: Record<string, unknown>;
  },
): Promise<void> {
  const actor = { kind: 'account' as const, id: tenant.accountId };
  await recordRevision(tx, {
    familyId: tenant.familyId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    version: input.version,
    op: input.op,
    actor,
    data: input.data,
  });
  await recordAudit(tx, {
    familyId: tenant.familyId,
    actor,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: 'success',
    metadata: { version: input.version },
  });
}

async function requireHouse(tx: Transaction, familyId: string, houseId: string): Promise<void> {
  const row = await repo.findHouse(tx, familyId, houseId);
  if (row === null) {
    throw new ProblemError('not_found');
  }
}

async function requireStore(tx: Transaction, familyId: string, storeId: string): Promise<void> {
  const row = await repo.getStore(tx, familyId, storeId);
  if (row === null) {
    throw new ProblemError('not_found');
  }
}

/**
 * Kitchen and shopping use-cases: recipes, URL import, stores and shopping lists.
 * No plan feature gate — Free includes them (phase 3 §9).
 *
 * @param db - Database pool wrapper.
 * @returns The service surface used by routes.
 */
export function createKitchenService(db: Database) {
  const inFamily = <T>(tenant: TenantContext, work: (tx: Transaction) => Promise<T>): Promise<T> =>
    guarded(() => withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, work));

  return {
    listRecipes(
      tenant: TenantContext,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly q?: string | undefined;
      },
    ): Promise<Page<Recipe>> {
      return inFamily(tenant, async (tx) =>
        pageOfCreated(
          await repo.listRecipes(tx, { familyId: tenant.familyId, ...query }),
          query.limit,
          recipeView,
        ),
      );
    },

    getRecipe(tenant: TenantContext, recipeId: string): Promise<Recipe> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.getRecipe(tx, tenant.familyId, recipeId);
        if (row === null) {
          throw new ProblemError('not_found');
        }
        return recipeView(row);
      });
    },

    createRecipe(tenant: TenantContext, body: CreateRecipeRequest): Promise<Recipe> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.insertRecipe(tx, {
          familyId: tenant.familyId,
          title: body.title,
          description: body.description ?? null,
          servings: body.servings ?? null,
          prepMinutes: body.prepMinutes ?? null,
          cookMinutes: body.cookMinutes ?? null,
          ingredients: body.ingredients ?? [],
          steps: body.steps ?? [],
          tags: body.tags ?? [],
          sourceUrl: body.sourceUrl ?? null,
          sourceName: body.sourceName ?? null,
          createdBy: tenant.accountId,
        });
        await trace(tx, tenant, {
          resourceType: 'recipes',
          resourceId: row.id,
          op: 'create',
          version: row.version,
          action: 'kitchen.recipes.create',
          data: { id: row.id },
        });
        return recipeView(row);
      });
    },

    updateRecipe(
      tenant: TenantContext,
      recipeId: string,
      expectedVersion: number,
      body: UpdateRecipeRequest,
    ): Promise<Recipe> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.getRecipe(tx, tenant.familyId, recipeId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.updateRecipe(tx, tenant.familyId, recipeId, expectedVersion, {
          ...body,
          updatedBy: tenant.accountId,
        });
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'recipes',
          resourceId: row.id,
          op: 'update',
          version: row.version,
          action: 'kitchen.recipes.update',
          data: { id: row.id },
        });
        return recipeView(row);
      });
    },

    deleteRecipe(tenant: TenantContext, recipeId: string, expectedVersion: number): Promise<void> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.getRecipe(tx, tenant.familyId, recipeId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.updateRecipe(tx, tenant.familyId, recipeId, expectedVersion, {
          deletedAt: new Date(),
          updatedBy: tenant.accountId,
        });
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'recipes',
          resourceId: row.id,
          op: 'delete',
          version: row.version,
          action: 'kitchen.recipes.delete',
          data: { id: row.id },
        });
      });
    },

    async importRecipe(tenant: TenantContext, body: CreateRecipeImportRequest): Promise<RecipeImport> {
      const created = await inFamily(tenant, async (tx) => {
        const row = await repo.insertRecipeImport(tx, {
          familyId: tenant.familyId,
          url: body.url,
          createdBy: tenant.accountId,
        });
        await recordAudit(tx, {
          familyId: tenant.familyId,
          actor: { kind: 'account', id: tenant.accountId },
          action: 'kitchen.recipe_imports.create',
          resourceType: 'recipe_imports',
          resourceId: row.id,
          outcome: 'success',
        });
        return row;
      });

      const fetched = await importRecipeFromUrl(body.url);
      return inFamily(tenant, async (tx) => {
        const running = await repo.markRecipeImportRunning(tx, tenant.familyId, created.id);
        if (running === null) {
          const existing = await repo.getRecipeImport(tx, tenant.familyId, created.id);
          if (existing === null) {
            throw new ProblemError('not_found');
          }
          return importView(existing);
        }
        const finishedAt = new Date();
        if (!fetched.ok) {
          const failed = await repo.markRecipeImportFailed(
            tx,
            tenant.familyId,
            created.id,
            fetched.code,
            finishedAt,
          );
          if (failed === null) {
            throw new ProblemError('not_found');
          }
          return importView(failed);
        }
        const recipe = await repo.insertRecipe(tx, {
          familyId: tenant.familyId,
          title: fetched.draft.title,
          description: fetched.draft.description,
          servings: fetched.draft.servings,
          prepMinutes: fetched.draft.prepMinutes,
          cookMinutes: fetched.draft.cookMinutes,
          ingredients: fetched.draft.ingredients,
          steps: fetched.draft.steps,
          tags: [],
          sourceUrl: body.url,
          sourceName: fetched.draft.sourceName,
          createdBy: tenant.accountId,
        });
        await trace(tx, tenant, {
          resourceType: 'recipes',
          resourceId: recipe.id,
          op: 'create',
          version: recipe.version,
          action: 'kitchen.recipes.create',
          data: { id: recipe.id },
        });
        const succeeded = await repo.markRecipeImportSucceeded(
          tx,
          tenant.familyId,
          created.id,
          recipe.id,
          finishedAt,
        );
        if (succeeded === null) {
          throw new ProblemError('not_found');
        }
        return importView(succeeded);
      });
    },

    getRecipeImport(tenant: TenantContext, importId: string): Promise<RecipeImport> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.getRecipeImport(tx, tenant.familyId, importId);
        if (row === null) {
          throw new ProblemError('not_found');
        }
        return importView(row);
      });
    },

    listStores(
      tenant: TenantContext,
      query: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<Store>> {
      return inFamily(tenant, async (tx) =>
        pageOfCreated(
          await repo.listStores(tx, { familyId: tenant.familyId, ...query }),
          query.limit,
          storeView,
        ),
      );
    },

    getStore(tenant: TenantContext, storeId: string): Promise<Store> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.getStore(tx, tenant.familyId, storeId);
        if (row === null) {
          throw new ProblemError('not_found');
        }
        return storeView(row);
      });
    },

    createStore(tenant: TenantContext, body: CreateStoreRequest): Promise<Store> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.insertStore(tx, {
          familyId: tenant.familyId,
          name: body.name,
          aisleOrder: body.aisleOrder ?? [],
          createdBy: tenant.accountId,
        });
        await trace(tx, tenant, {
          resourceType: 'stores',
          resourceId: row.id,
          op: 'create',
          version: row.version,
          action: 'kitchen.stores.create',
          data: { id: row.id },
        });
        return storeView(row);
      });
    },

    updateStore(
      tenant: TenantContext,
      storeId: string,
      expectedVersion: number,
      body: UpdateStoreRequest,
    ): Promise<Store> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.getStore(tx, tenant.familyId, storeId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.updateStore(tx, tenant.familyId, storeId, expectedVersion, {
          ...body,
          updatedBy: tenant.accountId,
        });
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'stores',
          resourceId: row.id,
          op: 'update',
          version: row.version,
          action: 'kitchen.stores.update',
          data: { id: row.id },
        });
        return storeView(row);
      });
    },

    deleteStore(tenant: TenantContext, storeId: string, expectedVersion: number): Promise<void> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.getStore(tx, tenant.familyId, storeId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.updateStore(tx, tenant.familyId, storeId, expectedVersion, {
          deletedAt: new Date(),
          updatedBy: tenant.accountId,
        });
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'stores',
          resourceId: row.id,
          op: 'delete',
          version: row.version,
          action: 'kitchen.stores.delete',
          data: { id: row.id },
        });
      });
    },

    listShoppingLists(
      tenant: TenantContext,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly houseId?: string | undefined;
        readonly storeId?: string | undefined;
        readonly archived?: boolean | undefined;
      },
    ): Promise<Page<ShoppingList>> {
      return inFamily(tenant, async (tx) =>
        pageOfCreated(
          await repo.listShoppingLists(tx, { familyId: tenant.familyId, ...query }),
          query.limit,
          listView,
        ),
      );
    },

    getShoppingList(tenant: TenantContext, listId: string): Promise<ShoppingList> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.getShoppingList(tx, tenant.familyId, listId);
        if (row === null) {
          throw new ProblemError('not_found');
        }
        return listView(row);
      });
    },

    createShoppingList(tenant: TenantContext, body: CreateShoppingListRequest): Promise<ShoppingList> {
      return inFamily(tenant, async (tx) => {
        const houseId = body.houseId ?? null;
        const storeId = body.storeId ?? null;
        if (houseId !== null) {
          await requireHouse(tx, tenant.familyId, houseId);
        }
        if (storeId !== null) {
          await requireStore(tx, tenant.familyId, storeId);
        }
        const row = await repo.insertShoppingList(tx, {
          familyId: tenant.familyId,
          houseId,
          storeId,
          name: body.name,
          createdBy: tenant.accountId,
        });
        await trace(tx, tenant, {
          resourceType: 'shopping_lists',
          resourceId: row.id,
          op: 'create',
          version: row.version,
          action: 'kitchen.shopping_lists.create',
          data: { id: row.id },
        });
        return listView(row);
      });
    },

    updateShoppingList(
      tenant: TenantContext,
      listId: string,
      expectedVersion: number,
      body: UpdateShoppingListRequest,
    ): Promise<ShoppingList> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.getShoppingList(tx, tenant.familyId, listId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        if (body.houseId !== undefined && body.houseId !== null) {
          await requireHouse(tx, tenant.familyId, body.houseId);
        }
        if (body.storeId !== undefined && body.storeId !== null) {
          await requireStore(tx, tenant.familyId, body.storeId);
        }
        const row = await repo.updateShoppingList(tx, tenant.familyId, listId, expectedVersion, {
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.houseId === undefined ? {} : { houseId: body.houseId }),
          ...(body.storeId === undefined ? {} : { storeId: body.storeId }),
          ...(body.archivedAt === undefined
            ? {}
            : { archivedAt: body.archivedAt === null ? null : new Date(body.archivedAt) }),
          updatedBy: tenant.accountId,
        });
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'shopping_lists',
          resourceId: row.id,
          op: 'update',
          version: row.version,
          action: 'kitchen.shopping_lists.update',
          data: { id: row.id },
        });
        return listView(row);
      });
    },

    deleteShoppingList(tenant: TenantContext, listId: string, expectedVersion: number): Promise<void> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.getShoppingList(tx, tenant.familyId, listId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.updateShoppingList(tx, tenant.familyId, listId, expectedVersion, {
          deletedAt: new Date(),
          updatedBy: tenant.accountId,
        });
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'shopping_lists',
          resourceId: row.id,
          op: 'delete',
          version: row.version,
          action: 'kitchen.shopping_lists.delete',
          data: { id: row.id },
        });
      });
    },

    listShoppingItems(
      tenant: TenantContext,
      listId: string,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly openOnly?: boolean | undefined;
      },
    ): Promise<Page<ShoppingItem>> {
      return inFamily(tenant, async (tx) => {
        const list = await repo.getShoppingList(tx, tenant.familyId, listId);
        if (list === null) {
          throw new ProblemError('not_found');
        }
        return pageOfCreated(
          await repo.listShoppingItems(tx, { familyId: tenant.familyId, listId, ...query }),
          query.limit,
          itemView,
        );
      });
    },

    createShoppingItem(
      tenant: TenantContext,
      listId: string,
      body: CreateShoppingItemRequest,
    ): Promise<ShoppingItem> {
      return inFamily(tenant, async (tx) => {
        const list = await repo.getShoppingList(tx, tenant.familyId, listId);
        if (list === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.insertShoppingItem(tx, {
          familyId: tenant.familyId,
          listId,
          name: body.name,
          quantity: body.quantity === undefined || body.quantity === null ? null : String(body.quantity),
          unit: body.unit ?? null,
          aisle: body.aisle ?? null,
          position: body.position ?? 0,
          createdBy: tenant.accountId,
        });
        await trace(tx, tenant, {
          resourceType: 'shopping_items',
          resourceId: row.id,
          op: 'create',
          version: row.version,
          action: 'kitchen.shopping_items.create',
          data: { id: row.id },
        });
        return itemView(row);
      });
    },

    updateShoppingItem(
      tenant: TenantContext,
      listId: string,
      itemId: string,
      expectedVersion: number,
      body: UpdateShoppingItemRequest,
    ): Promise<ShoppingItem> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.getShoppingItem(tx, tenant.familyId, listId, itemId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.updateShoppingItem(tx, tenant.familyId, listId, itemId, expectedVersion, {
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.quantity === undefined
            ? {}
            : { quantity: body.quantity === null ? null : String(body.quantity) }),
          ...(body.unit === undefined ? {} : { unit: body.unit }),
          ...(body.aisle === undefined ? {} : { aisle: body.aisle }),
          ...(body.position === undefined ? {} : { position: body.position }),
          updatedBy: tenant.accountId,
        });
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'shopping_items',
          resourceId: row.id,
          op: 'update',
          version: row.version,
          action: 'kitchen.shopping_items.update',
          data: { id: row.id },
        });
        return itemView(row);
      });
    },

    checkShoppingItem(
      tenant: TenantContext,
      listId: string,
      itemId: string,
      expectedVersion: number,
      body: CheckShoppingItemRequest,
    ): Promise<ShoppingItem> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.getShoppingItem(tx, tenant.familyId, listId, itemId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.updateShoppingItem(tx, tenant.familyId, listId, itemId, expectedVersion, {
          checkedAt: body.checked ? new Date() : null,
          checkedBy: body.checked ? tenant.accountId : null,
          updatedBy: tenant.accountId,
        });
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'shopping_items',
          resourceId: row.id,
          op: 'update',
          version: row.version,
          action: 'kitchen.shopping_items.update',
          data: { id: row.id },
        });
        return itemView(row);
      });
    },

    deleteShoppingItem(
      tenant: TenantContext,
      listId: string,
      itemId: string,
      expectedVersion: number,
    ): Promise<void> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.getShoppingItem(tx, tenant.familyId, listId, itemId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.updateShoppingItem(tx, tenant.familyId, listId, itemId, expectedVersion, {
          deletedAt: new Date(),
          updatedBy: tenant.accountId,
        });
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'shopping_items',
          resourceId: row.id,
          op: 'delete',
          version: row.version,
          action: 'kitchen.shopping_items.delete',
          data: { id: row.id },
        });
      });
    },
  };
}

/** Kitchen and shopping service. */
export type KitchenService = ReturnType<typeof createKitchenService>;
