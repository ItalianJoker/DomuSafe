import { z } from 'zod';
import { instantSchema, pageSchema, uuidSchema } from './common.js';

/** Lifecycle of a recipe URL import. */
export const RECIPE_IMPORT_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const;
/** Lifecycle of a recipe URL import. */
export type RecipeImportStatus = (typeof RECIPE_IMPORT_STATUSES)[number];

const titleSchema = z.string().trim().min(1).max(160);
const listNameSchema = z.string().trim().min(1).max(140);
const storeNameSchema = z.string().trim().min(1).max(140);
const descriptionSchema = z.string().trim().max(4000);
const noteSchema = z.string().trim().max(200);
const unitSchema = z.string().trim().min(1).max(40);
const aisleSchema = z.string().trim().min(1).max(80);
const tagSchema = z.string().trim().min(1).max(40);
const tagsSchema = z.array(tagSchema).max(32);
const sourceUrlSchema = z.url().max(2048);
const sourceNameSchema = z.string().trim().min(1).max(160);
const quantitySchema = z.number().gt(0).lte(1_000_000_000);
const minutesSchema = z
  .int()
  .min(0)
  .max(24 * 60);
const servingsSchema = z.int().min(1).max(99);
const positionSchema = z.int().min(0).max(100_000);
const limitField = z.coerce.number().int().min(1).max(200).default(50);
const cursorField = z.string().max(512).optional();
const importStatusSchema = z.enum(RECIPE_IMPORT_STATUSES);

function atLeastOneField(value: object): boolean {
  return Object.keys(value).length > 0;
}

/** One ingredient line of a recipe. */
export const recipeIngredientSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    quantity: quantitySchema.nullable(),
    unit: unitSchema.nullable(),
    note: noteSchema.nullable(),
  })
  .strict()
  .meta({ id: 'RecipeIngredient' });
/** One ingredient line of a recipe. */
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;

/** One recipe as returned by the API. */
export const recipeSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    title: titleSchema,
    description: descriptionSchema.nullable(),
    servings: servingsSchema.nullable(),
    prepMinutes: minutesSchema.nullable(),
    cookMinutes: minutesSchema.nullable(),
    ingredients: z.array(recipeIngredientSchema).max(200),
    steps: z.array(z.string().trim().min(1).max(2000)).max(200),
    tags: tagsSchema,
    sourceUrl: sourceUrlSchema.nullable(),
    sourceName: sourceNameSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Recipe' });
/** One recipe as returned by the API. */
export type Recipe = z.infer<typeof recipeSchema>;

/** Page of recipes. */
export const recipePageSchema = pageSchema(recipeSchema).meta({ id: 'RecipePage' });
/** Page of recipes. */
export type RecipePage = z.infer<typeof recipePageSchema>;

/** Body to create a recipe by hand. */
export const createRecipeRequestSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.nullable().optional(),
    servings: servingsSchema.nullable().optional(),
    prepMinutes: minutesSchema.nullable().optional(),
    cookMinutes: minutesSchema.nullable().optional(),
    ingredients: z.array(recipeIngredientSchema).max(200).optional(),
    steps: z.array(z.string().trim().min(1).max(2000)).max(200).optional(),
    tags: tagsSchema.optional(),
    sourceUrl: sourceUrlSchema.nullable().optional(),
    sourceName: sourceNameSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateRecipeRequest' });
/** Body to create a recipe by hand. */
export type CreateRecipeRequest = z.infer<typeof createRecipeRequestSchema>;

/** Body to update a recipe. */
export const updateRecipeRequestSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    servings: servingsSchema.nullable().optional(),
    prepMinutes: minutesSchema.nullable().optional(),
    cookMinutes: minutesSchema.nullable().optional(),
    ingredients: z.array(recipeIngredientSchema).max(200).optional(),
    steps: z.array(z.string().trim().min(1).max(2000)).max(200).optional(),
    tags: tagsSchema.optional(),
    sourceUrl: sourceUrlSchema.nullable().optional(),
    sourceName: sourceNameSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .meta({ id: 'UpdateRecipeRequest' });
/** Body to update a recipe. */
export type UpdateRecipeRequest = z.infer<typeof updateRecipeRequestSchema>;

/** Path parameters of one recipe. */
export const recipeParamsSchema = z.object({ familyId: uuidSchema, recipeId: uuidSchema }).strict();
/** Path parameters of one recipe. */
export type RecipeParams = z.infer<typeof recipeParamsSchema>;

/** Query of the recipe list. */
export const recipeListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    q: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
/** Query of the recipe list. */
export type RecipeListQuery = z.infer<typeof recipeListQuerySchema>;

/** One recipe import job. */
export const recipeImportSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    url: sourceUrlSchema,
    status: importStatusSchema,
    errorCode: z.string().min(1).max(80).nullable(),
    recipeId: uuidSchema.nullable(),
    createdAt: instantSchema,
    finishedAt: instantSchema.nullable(),
  })
  .strict()
  .meta({ id: 'RecipeImport' });
/** One recipe import job. */
export type RecipeImport = z.infer<typeof recipeImportSchema>;

/** Body to start a recipe import from a URL. */
export const createRecipeImportRequestSchema = z
  .object({ url: sourceUrlSchema })
  .strict()
  .meta({ id: 'CreateRecipeImportRequest' });
/** Body to start a recipe import from a URL. */
export type CreateRecipeImportRequest = z.infer<typeof createRecipeImportRequestSchema>;

/** Path parameters of one recipe import. */
export const recipeImportParamsSchema = z.object({ familyId: uuidSchema, importId: uuidSchema }).strict();
/** Path parameters of one recipe import. */
export type RecipeImportParams = z.infer<typeof recipeImportParamsSchema>;

/** One store with aisle order. */
export const storeSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    name: storeNameSchema,
    aisleOrder: z.array(aisleSchema).max(64),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Store' });
/** One store with aisle order. */
export type Store = z.infer<typeof storeSchema>;

/** Page of stores. */
export const storePageSchema = pageSchema(storeSchema).meta({ id: 'StorePage' });
/** Page of stores. */
export type StorePage = z.infer<typeof storePageSchema>;

/** Body to create a store. */
export const createStoreRequestSchema = z
  .object({
    name: storeNameSchema,
    aisleOrder: z.array(aisleSchema).max(64).optional(),
  })
  .strict()
  .meta({ id: 'CreateStoreRequest' });
/** Body to create a store. */
export type CreateStoreRequest = z.infer<typeof createStoreRequestSchema>;

/** Body to update a store. */
export const updateStoreRequestSchema = z
  .object({
    name: storeNameSchema.optional(),
    aisleOrder: z.array(aisleSchema).max(64).optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .meta({ id: 'UpdateStoreRequest' });
/** Body to update a store. */
export type UpdateStoreRequest = z.infer<typeof updateStoreRequestSchema>;

/** Path parameters of one store. */
export const storeParamsSchema = z.object({ familyId: uuidSchema, storeId: uuidSchema }).strict();
/** Path parameters of one store. */
export type StoreParams = z.infer<typeof storeParamsSchema>;

/** Query of the store list. */
export const storeListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
  })
  .strict();
/** Query of the store list. */
export type StoreListQuery = z.infer<typeof storeListQuerySchema>;

/** One shopping list. */
export const shoppingListSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema.nullable(),
    storeId: uuidSchema.nullable(),
    name: listNameSchema,
    archivedAt: instantSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'ShoppingList' });
/** One shopping list. */
export type ShoppingList = z.infer<typeof shoppingListSchema>;

/** Page of shopping lists. */
export const shoppingListPageSchema = pageSchema(shoppingListSchema).meta({ id: 'ShoppingListPage' });
/** Page of shopping lists. */
export type ShoppingListPage = z.infer<typeof shoppingListPageSchema>;

/** Body to create a shopping list. */
export const createShoppingListRequestSchema = z
  .object({
    name: listNameSchema,
    houseId: uuidSchema.nullable().optional(),
    storeId: uuidSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateShoppingListRequest' });
/** Body to create a shopping list. */
export type CreateShoppingListRequest = z.infer<typeof createShoppingListRequestSchema>;

/** Body to update a shopping list. */
export const updateShoppingListRequestSchema = z
  .object({
    name: listNameSchema.optional(),
    houseId: uuidSchema.nullable().optional(),
    storeId: uuidSchema.nullable().optional(),
    archivedAt: instantSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .meta({ id: 'UpdateShoppingListRequest' });
/** Body to update a shopping list. */
export type UpdateShoppingListRequest = z.infer<typeof updateShoppingListRequestSchema>;

/** Path parameters of one shopping list. */
export const shoppingListParamsSchema = z.object({ familyId: uuidSchema, listId: uuidSchema }).strict();
/** Path parameters of one shopping list. */
export type ShoppingListParams = z.infer<typeof shoppingListParamsSchema>;

/** Query of the shopping list collection. */
export const shoppingListListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    houseId: uuidSchema.optional(),
    storeId: uuidSchema.optional(),
    archived: z.coerce.boolean().optional(),
  })
  .strict();
/** Query of the shopping list collection. */
export type ShoppingListListQuery = z.infer<typeof shoppingListListQuerySchema>;

/** One shopping list line. */
export const shoppingItemSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    listId: uuidSchema,
    name: z.string().trim().min(1).max(160),
    quantity: quantitySchema.nullable(),
    unit: unitSchema.nullable(),
    aisle: aisleSchema.nullable(),
    position: positionSchema,
    checkedAt: instantSchema.nullable(),
    checkedBy: uuidSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'ShoppingItem' });
/** One shopping list line. */
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;

/** Page of shopping items. */
export const shoppingItemPageSchema = pageSchema(shoppingItemSchema).meta({ id: 'ShoppingItemPage' });
/** Page of shopping items. */
export type ShoppingItemPage = z.infer<typeof shoppingItemPageSchema>;

/** Body to create a shopping item. */
export const createShoppingItemRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    quantity: quantitySchema.nullable().optional(),
    unit: unitSchema.nullable().optional(),
    aisle: aisleSchema.nullable().optional(),
    position: positionSchema.optional(),
  })
  .strict()
  .meta({ id: 'CreateShoppingItemRequest' });
/** Body to create a shopping item. */
export type CreateShoppingItemRequest = z.infer<typeof createShoppingItemRequestSchema>;

/** Body to update a shopping item. */
export const updateShoppingItemRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    quantity: quantitySchema.nullable().optional(),
    unit: unitSchema.nullable().optional(),
    aisle: aisleSchema.nullable().optional(),
    position: positionSchema.optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .meta({ id: 'UpdateShoppingItemRequest' });
/** Body to update a shopping item. */
export type UpdateShoppingItemRequest = z.infer<typeof updateShoppingItemRequestSchema>;

/** Body to check or uncheck a shopping item. */
export const checkShoppingItemRequestSchema = z
  .object({ checked: z.boolean() })
  .strict()
  .meta({ id: 'CheckShoppingItemRequest' });
/** Body to check or uncheck a shopping item. */
export type CheckShoppingItemRequest = z.infer<typeof checkShoppingItemRequestSchema>;

/** Path parameters of one shopping item. */
export const shoppingItemParamsSchema = z
  .object({ familyId: uuidSchema, listId: uuidSchema, itemId: uuidSchema })
  .strict();
/** Path parameters of one shopping item. */
export type ShoppingItemParams = z.infer<typeof shoppingItemParamsSchema>;

/** Query of shopping items on one list. */
export const shoppingItemListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    openOnly: z.coerce.boolean().optional(),
  })
  .strict();
/** Query of shopping items on one list. */
export type ShoppingItemListQuery = z.infer<typeof shoppingItemListQuerySchema>;
