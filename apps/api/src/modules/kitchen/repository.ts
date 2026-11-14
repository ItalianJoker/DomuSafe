import {
  barcodeProducts,
  houses,
  mealPlanEntries,
  pantryItems,
  recipeImports,
  recipes,
  shoppingItems,
  shoppingLists,
  storageUnits,
  stores,
  type RecipeIngredientRow,
  type Transaction,
} from '@domusafe/db';
import { and, asc, desc, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';

/** Row of `recipes`. */
export type RecipeRow = typeof recipes.$inferSelect;
/** Row of `recipe_imports`. */
export type RecipeImportRow = typeof recipeImports.$inferSelect;
/** Row of `stores`. */
export type StoreRow = typeof stores.$inferSelect;
/** Row of `shopping_lists`. */
export type ShoppingListRow = typeof shoppingLists.$inferSelect;
/** Row of `shopping_items`. */
export type ShoppingItemRow = typeof shoppingItems.$inferSelect;
/** Row of `meal_plan_entries`. */
export type MealPlanEntryRow = typeof mealPlanEntries.$inferSelect;
/** Row of `pantry_items`. */
export type PantryItemRow = typeof pantryItems.$inferSelect;
/** Row of `barcode_products`. */
export type BarcodeProductRow = typeof barcodeProducts.$inferSelect;

interface Page {
  readonly limit: number;
  readonly after: readonly [string, string] | null;
}

/**
 * Confirms a house exists in the family.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns The id, or `null`.
 */
export async function findHouse(
  tx: Transaction,
  familyId: string,
  houseId: string,
): Promise<{ id: string } | null> {
  const [row] = await tx
    .select({ id: houses.id })
    .from(houses)
    .where(and(eq(houses.familyId, familyId), eq(houses.id, houseId), isNull(houses.deletedAt)));
  return row ?? null;
}

/**
 * Inserts a recipe.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertRecipe(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly title: string;
    readonly description: string | null;
    readonly servings: number | null;
    readonly prepMinutes: number | null;
    readonly cookMinutes: number | null;
    readonly ingredients: readonly RecipeIngredientRow[];
    readonly steps: readonly string[];
    readonly tags: readonly string[];
    readonly sourceUrl: string | null;
    readonly sourceName: string | null;
    readonly createdBy: string;
  },
): Promise<RecipeRow> {
  const [row] = await tx
    .insert(recipes)
    .values({
      familyId: input.familyId,
      title: input.title,
      description: input.description,
      servings: input.servings,
      prepMinutes: input.prepMinutes,
      cookMinutes: input.cookMinutes,
      ingredients: [...input.ingredients],
      steps: [...input.steps],
      tags: [...input.tags],
      sourceUrl: input.sourceUrl,
      sourceName: input.sourceName,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Recipe insert returned no row');
  }
  return row;
}

/**
 * Lists recipes for a family, newest first.
 *
 * @param tx - Transaction.
 * @param scope - Family, optional search and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listRecipes(
  tx: Transaction,
  scope: { readonly familyId: string; readonly q?: string | undefined } & Page,
): Promise<RecipeRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${recipes.createdAt}, ${recipes.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  const search =
    scope.q === undefined
      ? undefined
      : sql`(${recipes.title} ilike ${`%${scope.q}%`} or ${recipes.description} ilike ${`%${scope.q}%`})`;
  return tx
    .select()
    .from(recipes)
    .where(and(eq(recipes.familyId, scope.familyId), isNull(recipes.deletedAt), search, after))
    .orderBy(desc(recipes.createdAt), desc(recipes.id))
    .limit(scope.limit + 1);
}

/**
 * Loads one recipe.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param recipeId - Recipe id.
 * @returns The row, or `null`.
 */
export async function getRecipe(
  tx: Transaction,
  familyId: string,
  recipeId: string,
): Promise<RecipeRow | null> {
  const [row] = await tx
    .select()
    .from(recipes)
    .where(and(eq(recipes.familyId, familyId), eq(recipes.id, recipeId), isNull(recipes.deletedAt)));
  return row ?? null;
}

/**
 * Updates a recipe when the version matches.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param recipeId - Recipe id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or `null` on version conflict / missing.
 */
export async function updateRecipe(
  tx: Transaction,
  familyId: string,
  recipeId: string,
  expectedVersion: number,
  patch: {
    readonly title?: string | undefined;
    readonly description?: string | null | undefined;
    readonly servings?: number | null | undefined;
    readonly prepMinutes?: number | null | undefined;
    readonly cookMinutes?: number | null | undefined;
    readonly ingredients?: readonly RecipeIngredientRow[] | undefined;
    readonly steps?: readonly string[] | undefined;
    readonly tags?: readonly string[] | undefined;
    readonly sourceUrl?: string | null | undefined;
    readonly sourceName?: string | null | undefined;
    readonly deletedAt?: Date | null | undefined;
    readonly updatedBy: string;
  },
): Promise<RecipeRow | null> {
  const [row] = await tx
    .update(recipes)
    .set({
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.description === undefined ? {} : { description: patch.description }),
      ...(patch.servings === undefined ? {} : { servings: patch.servings }),
      ...(patch.prepMinutes === undefined ? {} : { prepMinutes: patch.prepMinutes }),
      ...(patch.cookMinutes === undefined ? {} : { cookMinutes: patch.cookMinutes }),
      ...(patch.ingredients === undefined ? {} : { ingredients: [...patch.ingredients] }),
      ...(patch.steps === undefined ? {} : { steps: [...patch.steps] }),
      ...(patch.tags === undefined ? {} : { tags: [...patch.tags] }),
      ...(patch.sourceUrl === undefined ? {} : { sourceUrl: patch.sourceUrl }),
      ...(patch.sourceName === undefined ? {} : { sourceName: patch.sourceName }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${recipes.version} + 1`,
    })
    .where(
      and(
        eq(recipes.familyId, familyId),
        eq(recipes.id, recipeId),
        eq(recipes.version, expectedVersion),
        isNull(recipes.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a recipe import row in `queued` status.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertRecipeImport(
  tx: Transaction,
  input: { readonly familyId: string; readonly url: string; readonly createdBy: string },
): Promise<RecipeImportRow> {
  const [row] = await tx
    .insert(recipeImports)
    .values({
      familyId: input.familyId,
      url: input.url,
      status: 'queued',
      createdBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Recipe import insert returned no row');
  }
  return row;
}

/**
 * Loads one recipe import.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param importId - Import id.
 * @returns The row, or `null`.
 */
export async function getRecipeImport(
  tx: Transaction,
  familyId: string,
  importId: string,
): Promise<RecipeImportRow | null> {
  const [row] = await tx
    .select()
    .from(recipeImports)
    .where(and(eq(recipeImports.familyId, familyId), eq(recipeImports.id, importId)));
  return row ?? null;
}

/**
 * Marks an import as running.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param importId - Import id.
 * @returns The updated row, or `null`.
 */
export async function markRecipeImportRunning(
  tx: Transaction,
  familyId: string,
  importId: string,
): Promise<RecipeImportRow | null> {
  const [row] = await tx
    .update(recipeImports)
    .set({ status: 'running' })
    .where(
      and(
        eq(recipeImports.familyId, familyId),
        eq(recipeImports.id, importId),
        eq(recipeImports.status, 'queued'),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Marks an import as succeeded with the created recipe.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param importId - Import id.
 * @param recipeId - Created recipe id.
 * @param finishedAt - Finish instant.
 * @returns The updated row, or `null`.
 */
export async function markRecipeImportSucceeded(
  tx: Transaction,
  familyId: string,
  importId: string,
  recipeId: string,
  finishedAt: Date,
): Promise<RecipeImportRow | null> {
  const [row] = await tx
    .update(recipeImports)
    .set({
      status: 'succeeded',
      recipeId,
      finishedAt,
      errorCode: null,
    })
    .where(and(eq(recipeImports.familyId, familyId), eq(recipeImports.id, importId)))
    .returning();
  return row ?? null;
}

/**
 * Marks an import as failed.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param importId - Import id.
 * @param errorCode - Stable failure code.
 * @param finishedAt - Finish instant.
 * @returns The updated row, or `null`.
 */
export async function markRecipeImportFailed(
  tx: Transaction,
  familyId: string,
  importId: string,
  errorCode: string,
  finishedAt: Date,
): Promise<RecipeImportRow | null> {
  const [row] = await tx
    .update(recipeImports)
    .set({
      status: 'failed',
      errorCode,
      finishedAt,
      recipeId: null,
    })
    .where(and(eq(recipeImports.familyId, familyId), eq(recipeImports.id, importId)))
    .returning();
  return row ?? null;
}

/**
 * Inserts a store.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertStore(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly name: string;
    readonly aisleOrder: readonly string[];
    readonly createdBy: string;
  },
): Promise<StoreRow> {
  const [row] = await tx
    .insert(stores)
    .values({
      familyId: input.familyId,
      name: input.name,
      aisleOrder: [...input.aisleOrder],
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Store insert returned no row');
  }
  return row;
}

/**
 * Lists stores for a family, newest first.
 *
 * @param tx - Transaction.
 * @param scope - Family and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listStores(
  tx: Transaction,
  scope: { readonly familyId: string } & Page,
): Promise<StoreRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${stores.createdAt}, ${stores.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(stores)
    .where(and(eq(stores.familyId, scope.familyId), isNull(stores.deletedAt), after))
    .orderBy(desc(stores.createdAt), desc(stores.id))
    .limit(scope.limit + 1);
}

/**
 * Loads one store.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param storeId - Store id.
 * @returns The row, or `null`.
 */
export async function getStore(tx: Transaction, familyId: string, storeId: string): Promise<StoreRow | null> {
  const [row] = await tx
    .select()
    .from(stores)
    .where(and(eq(stores.familyId, familyId), eq(stores.id, storeId), isNull(stores.deletedAt)));
  return row ?? null;
}

/**
 * Updates a store when the version matches.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param storeId - Store id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or `null`.
 */
export async function updateStore(
  tx: Transaction,
  familyId: string,
  storeId: string,
  expectedVersion: number,
  patch: {
    readonly name?: string | undefined;
    readonly aisleOrder?: readonly string[] | undefined;
    readonly deletedAt?: Date | null | undefined;
    readonly updatedBy: string;
  },
): Promise<StoreRow | null> {
  const [row] = await tx
    .update(stores)
    .set({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.aisleOrder === undefined ? {} : { aisleOrder: [...patch.aisleOrder] }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${stores.version} + 1`,
    })
    .where(
      and(
        eq(stores.familyId, familyId),
        eq(stores.id, storeId),
        eq(stores.version, expectedVersion),
        isNull(stores.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a shopping list.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertShoppingList(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly houseId: string | null;
    readonly storeId: string | null;
    readonly name: string;
    readonly createdBy: string;
  },
): Promise<ShoppingListRow> {
  const [row] = await tx
    .insert(shoppingLists)
    .values({
      familyId: input.familyId,
      houseId: input.houseId,
      storeId: input.storeId,
      name: input.name,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Shopping list insert returned no row');
  }
  return row;
}

/**
 * Lists shopping lists for a family, newest first.
 *
 * @param tx - Transaction.
 * @param scope - Family, optional filters and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listShoppingLists(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly houseId?: string | undefined;
    readonly storeId?: string | undefined;
    readonly archived?: boolean | undefined;
  } & Page,
): Promise<ShoppingListRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${shoppingLists.createdAt}, ${shoppingLists.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  const archivedFilter =
    scope.archived === undefined
      ? undefined
      : scope.archived
        ? isNotNull(shoppingLists.archivedAt)
        : isNull(shoppingLists.archivedAt);
  return tx
    .select()
    .from(shoppingLists)
    .where(
      and(
        eq(shoppingLists.familyId, scope.familyId),
        isNull(shoppingLists.deletedAt),
        scope.houseId === undefined ? undefined : eq(shoppingLists.houseId, scope.houseId),
        scope.storeId === undefined ? undefined : eq(shoppingLists.storeId, scope.storeId),
        archivedFilter,
        after,
      ),
    )
    .orderBy(desc(shoppingLists.createdAt), desc(shoppingLists.id))
    .limit(scope.limit + 1);
}

/**
 * Loads one shopping list.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param listId - List id.
 * @returns The row, or `null`.
 */
export async function getShoppingList(
  tx: Transaction,
  familyId: string,
  listId: string,
): Promise<ShoppingListRow | null> {
  const [row] = await tx
    .select()
    .from(shoppingLists)
    .where(
      and(
        eq(shoppingLists.familyId, familyId),
        eq(shoppingLists.id, listId),
        isNull(shoppingLists.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates a shopping list when the version matches.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param listId - List id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or `null`.
 */
export async function updateShoppingList(
  tx: Transaction,
  familyId: string,
  listId: string,
  expectedVersion: number,
  patch: {
    readonly name?: string | undefined;
    readonly houseId?: string | null | undefined;
    readonly storeId?: string | null | undefined;
    readonly archivedAt?: Date | null | undefined;
    readonly deletedAt?: Date | null | undefined;
    readonly updatedBy: string;
  },
): Promise<ShoppingListRow | null> {
  const [row] = await tx
    .update(shoppingLists)
    .set({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.houseId === undefined ? {} : { houseId: patch.houseId }),
      ...(patch.storeId === undefined ? {} : { storeId: patch.storeId }),
      ...(patch.archivedAt === undefined ? {} : { archivedAt: patch.archivedAt }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${shoppingLists.version} + 1`,
    })
    .where(
      and(
        eq(shoppingLists.familyId, familyId),
        eq(shoppingLists.id, listId),
        eq(shoppingLists.version, expectedVersion),
        isNull(shoppingLists.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a shopping item.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertShoppingItem(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly listId: string;
    readonly name: string;
    readonly quantity: string | null;
    readonly unit: string | null;
    readonly aisle: string | null;
    readonly position: number;
    readonly createdBy: string;
  },
): Promise<ShoppingItemRow> {
  const [row] = await tx
    .insert(shoppingItems)
    .values({
      familyId: input.familyId,
      listId: input.listId,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      aisle: input.aisle,
      position: input.position,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Shopping item insert returned no row');
  }
  return row;
}

/**
 * Lists shopping items on one list, open first then by position.
 *
 * @param tx - Transaction.
 * @param scope - Family, list, optional open-only and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listShoppingItems(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly listId: string;
    readonly openOnly?: boolean | undefined;
  } & Page,
): Promise<ShoppingItemRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${shoppingItems.createdAt}, ${shoppingItems.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(shoppingItems)
    .where(
      and(
        eq(shoppingItems.familyId, scope.familyId),
        eq(shoppingItems.listId, scope.listId),
        isNull(shoppingItems.deletedAt),
        scope.openOnly === true ? isNull(shoppingItems.checkedAt) : undefined,
        after,
      ),
    )
    .orderBy(asc(shoppingItems.position), asc(shoppingItems.createdAt), asc(shoppingItems.id))
    .limit(scope.limit + 1);
}

/**
 * Loads one shopping item.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param listId - List id.
 * @param itemId - Item id.
 * @returns The row, or `null`.
 */
export async function getShoppingItem(
  tx: Transaction,
  familyId: string,
  listId: string,
  itemId: string,
): Promise<ShoppingItemRow | null> {
  const [row] = await tx
    .select()
    .from(shoppingItems)
    .where(
      and(
        eq(shoppingItems.familyId, familyId),
        eq(shoppingItems.listId, listId),
        eq(shoppingItems.id, itemId),
        isNull(shoppingItems.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates a shopping item when the version matches.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param listId - List id.
 * @param itemId - Item id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or `null`.
 */
export async function updateShoppingItem(
  tx: Transaction,
  familyId: string,
  listId: string,
  itemId: string,
  expectedVersion: number,
  patch: {
    readonly name?: string | undefined;
    readonly quantity?: string | null | undefined;
    readonly unit?: string | null | undefined;
    readonly aisle?: string | null | undefined;
    readonly position?: number | undefined;
    readonly checkedAt?: Date | null | undefined;
    readonly checkedBy?: string | null | undefined;
    readonly deletedAt?: Date | null | undefined;
    readonly updatedBy: string;
  },
): Promise<ShoppingItemRow | null> {
  const [row] = await tx
    .update(shoppingItems)
    .set({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.quantity === undefined ? {} : { quantity: patch.quantity }),
      ...(patch.unit === undefined ? {} : { unit: patch.unit }),
      ...(patch.aisle === undefined ? {} : { aisle: patch.aisle }),
      ...(patch.position === undefined ? {} : { position: patch.position }),
      ...(patch.checkedAt === undefined ? {} : { checkedAt: patch.checkedAt }),
      ...(patch.checkedBy === undefined ? {} : { checkedBy: patch.checkedBy }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${shoppingItems.version} + 1`,
    })
    .where(
      and(
        eq(shoppingItems.familyId, familyId),
        eq(shoppingItems.listId, listId),
        eq(shoppingItems.id, itemId),
        eq(shoppingItems.version, expectedVersion),
        isNull(shoppingItems.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Confirms a storage unit exists in the house.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param storageUnitId - Storage unit id.
 * @returns The id, or `null`.
 */
export async function findStorageUnitInHouse(
  tx: Transaction,
  familyId: string,
  houseId: string,
  storageUnitId: string,
): Promise<{ id: string } | null> {
  const [row] = await tx
    .select({ id: storageUnits.id })
    .from(storageUnits)
    .where(
      and(
        eq(storageUnits.familyId, familyId),
        eq(storageUnits.houseId, houseId),
        eq(storageUnits.id, storageUnitId),
        isNull(storageUnits.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Inserts a meal plan entry.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertMealPlanEntry(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly houseId: string | null;
    readonly planDate: string;
    readonly slot: MealPlanEntryRow['slot'];
    readonly recipeId: string | null;
    readonly title: string | null;
    readonly servings: number | null;
    readonly notes: string | null;
    readonly createdBy: string;
  },
): Promise<MealPlanEntryRow> {
  const [row] = await tx
    .insert(mealPlanEntries)
    .values({
      familyId: input.familyId,
      houseId: input.houseId,
      planDate: input.planDate,
      slot: input.slot,
      recipeId: input.recipeId,
      title: input.title,
      servings: input.servings,
      notes: input.notes,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Meal plan entry insert returned no row');
  }
  return row;
}

/**
 * Lists meal plan entries in a date range, oldest day first.
 *
 * @param tx - Transaction.
 * @param scope - Family, range, optional house and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listMealPlanEntries(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly from: string;
    readonly to: string;
    readonly houseId?: string | undefined;
  } & Page,
): Promise<MealPlanEntryRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${mealPlanEntries.createdAt}, ${mealPlanEntries.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(mealPlanEntries)
    .where(
      and(
        eq(mealPlanEntries.familyId, scope.familyId),
        isNull(mealPlanEntries.deletedAt),
        gte(mealPlanEntries.planDate, scope.from),
        lte(mealPlanEntries.planDate, scope.to),
        scope.houseId === undefined ? undefined : eq(mealPlanEntries.houseId, scope.houseId),
        after,
      ),
    )
    .orderBy(asc(mealPlanEntries.planDate), asc(mealPlanEntries.slot), asc(mealPlanEntries.id))
    .limit(scope.limit + 1);
}

/**
 * Loads one meal plan entry.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param entryId - Entry id.
 * @returns The row, or `null`.
 */
export async function getMealPlanEntry(
  tx: Transaction,
  familyId: string,
  entryId: string,
): Promise<MealPlanEntryRow | null> {
  const [row] = await tx
    .select()
    .from(mealPlanEntries)
    .where(
      and(
        eq(mealPlanEntries.familyId, familyId),
        eq(mealPlanEntries.id, entryId),
        isNull(mealPlanEntries.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates a meal plan entry when the version matches.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param entryId - Entry id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or `null`.
 */
export async function updateMealPlanEntry(
  tx: Transaction,
  familyId: string,
  entryId: string,
  expectedVersion: number,
  patch: {
    readonly planDate?: string | undefined;
    readonly slot?: MealPlanEntryRow['slot'] | undefined;
    readonly houseId?: string | null | undefined;
    readonly recipeId?: string | null | undefined;
    readonly title?: string | null | undefined;
    readonly servings?: number | null | undefined;
    readonly notes?: string | null | undefined;
    readonly deletedAt?: Date | null | undefined;
    readonly updatedBy: string;
  },
): Promise<MealPlanEntryRow | null> {
  const [row] = await tx
    .update(mealPlanEntries)
    .set({
      ...(patch.planDate === undefined ? {} : { planDate: patch.planDate }),
      ...(patch.slot === undefined ? {} : { slot: patch.slot }),
      ...(patch.houseId === undefined ? {} : { houseId: patch.houseId }),
      ...(patch.recipeId === undefined ? {} : { recipeId: patch.recipeId }),
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.servings === undefined ? {} : { servings: patch.servings }),
      ...(patch.notes === undefined ? {} : { notes: patch.notes }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${mealPlanEntries.version} + 1`,
    })
    .where(
      and(
        eq(mealPlanEntries.familyId, familyId),
        eq(mealPlanEntries.id, entryId),
        eq(mealPlanEntries.version, expectedVersion),
        isNull(mealPlanEntries.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a pantry item.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertPantryItem(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly houseId: string;
    readonly name: string;
    readonly barcode: string | null;
    readonly quantity: string;
    readonly unit: string | null;
    readonly storageUnitId: string | null;
    readonly expiryDate: string | null;
    readonly minQuantity: string | null;
    readonly createdBy: string;
  },
): Promise<PantryItemRow> {
  const [row] = await tx
    .insert(pantryItems)
    .values({
      familyId: input.familyId,
      houseId: input.houseId,
      name: input.name,
      barcode: input.barcode,
      quantity: input.quantity,
      unit: input.unit,
      storageUnitId: input.storageUnitId,
      expiryDate: input.expiryDate,
      minQuantity: input.minQuantity,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Pantry item insert returned no row');
  }
  return row;
}

/**
 * Lists pantry items for a house, newest first.
 *
 * @param tx - Transaction.
 * @param scope - Family, house, optional filters and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listPantryItems(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly houseId: string;
    readonly q?: string | undefined;
    readonly barcode?: string | undefined;
    readonly lowStock?: boolean | undefined;
  } & Page,
): Promise<PantryItemRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${pantryItems.createdAt}, ${pantryItems.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  const search =
    scope.q === undefined
      ? undefined
      : sql`(${pantryItems.name} ilike ${`%${scope.q}%`} or ${pantryItems.barcode} ilike ${`%${scope.q}%`})`;
  const lowStock =
    scope.lowStock === true
      ? sql`${pantryItems.minQuantity} is not null and ${pantryItems.quantity}::numeric <= ${pantryItems.minQuantity}::numeric`
      : undefined;
  return tx
    .select()
    .from(pantryItems)
    .where(
      and(
        eq(pantryItems.familyId, scope.familyId),
        eq(pantryItems.houseId, scope.houseId),
        isNull(pantryItems.deletedAt),
        scope.barcode === undefined ? undefined : eq(pantryItems.barcode, scope.barcode),
        search,
        lowStock,
        after,
      ),
    )
    .orderBy(desc(pantryItems.createdAt), desc(pantryItems.id))
    .limit(scope.limit + 1);
}

/**
 * Loads one pantry item.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param itemId - Item id.
 * @returns The row, or `null`.
 */
export async function getPantryItem(
  tx: Transaction,
  familyId: string,
  houseId: string,
  itemId: string,
): Promise<PantryItemRow | null> {
  const [row] = await tx
    .select()
    .from(pantryItems)
    .where(
      and(
        eq(pantryItems.familyId, familyId),
        eq(pantryItems.houseId, houseId),
        eq(pantryItems.id, itemId),
        isNull(pantryItems.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates a pantry item when the version matches.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param itemId - Item id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or `null`.
 */
export async function updatePantryItem(
  tx: Transaction,
  familyId: string,
  houseId: string,
  itemId: string,
  expectedVersion: number,
  patch: {
    readonly name?: string | undefined;
    readonly barcode?: string | null | undefined;
    readonly quantity?: string | undefined;
    readonly unit?: string | null | undefined;
    readonly storageUnitId?: string | null | undefined;
    readonly expiryDate?: string | null | undefined;
    readonly minQuantity?: string | null | undefined;
    readonly deletedAt?: Date | null | undefined;
    readonly updatedBy: string;
  },
): Promise<PantryItemRow | null> {
  const [row] = await tx
    .update(pantryItems)
    .set({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.barcode === undefined ? {} : { barcode: patch.barcode }),
      ...(patch.quantity === undefined ? {} : { quantity: patch.quantity }),
      ...(patch.unit === undefined ? {} : { unit: patch.unit }),
      ...(patch.storageUnitId === undefined ? {} : { storageUnitId: patch.storageUnitId }),
      ...(patch.expiryDate === undefined ? {} : { expiryDate: patch.expiryDate }),
      ...(patch.minQuantity === undefined ? {} : { minQuantity: patch.minQuantity }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${pantryItems.version} + 1`,
    })
    .where(
      and(
        eq(pantryItems.familyId, familyId),
        eq(pantryItems.houseId, houseId),
        eq(pantryItems.id, itemId),
        eq(pantryItems.version, expectedVersion),
        isNull(pantryItems.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Loads a barcode product by code.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param barcode - Barcode value.
 * @returns The row, or `null`.
 */
export async function getBarcodeProduct(
  tx: Transaction,
  familyId: string,
  barcode: string,
): Promise<BarcodeProductRow | null> {
  const [row] = await tx
    .select()
    .from(barcodeProducts)
    .where(and(eq(barcodeProducts.familyId, familyId), eq(barcodeProducts.barcode, barcode)));
  return row ?? null;
}

/**
 * Inserts or replaces a barcode product for the family.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The upserted row.
 */
export async function upsertBarcodeProduct(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly barcode: string;
    readonly name: string;
    readonly brand: string | null;
    readonly defaultUnit: string | null;
  },
): Promise<BarcodeProductRow> {
  const [row] = await tx
    .insert(barcodeProducts)
    .values({
      familyId: input.familyId,
      barcode: input.barcode,
      name: input.name,
      brand: input.brand,
      defaultUnit: input.defaultUnit,
    })
    .onConflictDoUpdate({
      target: [barcodeProducts.familyId, barcodeProducts.barcode],
      set: {
        name: input.name,
        brand: input.brand,
        defaultUnit: input.defaultUnit,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  if (row === undefined) {
    throw new Error('Barcode product upsert returned no row');
  }
  return row;
}
