import { z } from 'zod';
import { currencySchema, instantSchema, localDateSchema, pageSchema, uuidSchema } from './common.js';

/** Kind of a room. */
export const ROOM_KINDS = [
  'kitchen',
  'living',
  'bedroom',
  'bathroom',
  'office',
  'laundry',
  'garage',
  'cellar',
  'attic',
  'garden',
  'balcony',
  'other',
] as const;
/** Kind of a room. */
export type RoomKind = (typeof ROOM_KINDS)[number];

/** Kind of a storage unit under a room. */
export const STORAGE_UNIT_KINDS = [
  'furniture',
  'wardrobe',
  'shelf',
  'drawer',
  'box',
  'container',
  'other',
] as const;
/** Kind of a storage unit. */
export type StorageUnitKind = (typeof STORAGE_UNIT_KINDS)[number];

const roomKindSchema = z.enum(ROOM_KINDS);
const storageUnitKindSchema = z.enum(STORAGE_UNIT_KINDS);
const nameSchema = z.string().trim().min(1).max(140);
const itemNameSchema = z.string().trim().min(1).max(160);
const notesSchema = z.string().trim().max(2000);
const longNotesSchema = z.string().trim().max(4000);
const categorySchema = z.string().trim().min(1).max(80);
const unitSchema = z.string().trim().min(1).max(40);
const shortLabelSchema = z.string().trim().min(1).max(80);
const barcodeSchema = z.string().trim().min(1).max(64);
const captionSchema = z.string().trim().min(1).max(200);
const tagSchema = z.string().trim().min(1).max(40);
const tagsSchema = z.array(tagSchema).max(32);
const quantitySchema = z.number().gt(0).lte(1_000_000_000);
const dataUrlSchema = z
  .string()
  .min(32)
  .max(24_576)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
const costSchema = z
  .object({ amountMinor: z.int().min(0).max(1_000_000_000_000), currency: currencySchema })
  .strict();
const limitField = z.coerce.number().int().min(1).max(200).default(50);
const cursorField = z.string().max(512).optional();

function atLeastOneField(value: object): boolean {
  return Object.keys(value).length > 0;
}

/** One room as returned by the API. */
export const roomSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    name: nameSchema,
    kind: roomKindSchema,
    floor: z.int().min(-5).max(200).nullable(),
    sortOrder: z.int().min(0).max(32_767),
    notes: notesSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Room' });
/** One room. */
export type Room = z.infer<typeof roomSchema>;

/** Body of `POST …/rooms`. */
export const createRoomRequestSchema = z
  .object({
    name: nameSchema,
    kind: roomKindSchema.default('other'),
    floor: z.int().min(-5).max(200).nullable().optional(),
    sortOrder: z.int().min(0).max(32_767).default(0),
    notes: notesSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateRoomRequest' });
/** Body of `POST …/rooms`. */
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;

/** Body of `PATCH …/rooms/{roomId}`. */
export const updateRoomRequestSchema = z
  .object({
    name: nameSchema.optional(),
    kind: roomKindSchema.optional(),
    floor: z.int().min(-5).max(200).nullable().optional(),
    sortOrder: z.int().min(0).max(32_767).optional(),
    notes: notesSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateRoomRequest' });
/** Body of `PATCH …/rooms/{roomId}`. */
export type UpdateRoomRequest = z.infer<typeof updateRoomRequestSchema>;

/** Query of `GET …/rooms`. */
export const roomListQuerySchema = z.object({ limit: limitField, cursor: cursorField }).strict();

/** Response of `GET …/rooms`. */
export const roomPageSchema = pageSchema(roomSchema).meta({ id: 'RoomPage' });

/** Path params of a room. */
export const roomParamsSchema = z
  .object({ familyId: uuidSchema, houseId: uuidSchema, roomId: uuidSchema })
  .strict();

/** One storage unit (closet, shelf, box, …). */
export const storageUnitSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    roomId: uuidSchema,
    parentId: uuidSchema.nullable(),
    kind: storageUnitKindSchema,
    name: nameSchema,
    notes: notesSchema.nullable(),
    sortOrder: z.int().min(0).max(32_767),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'StorageUnit' });
/** One storage unit. */
export type StorageUnit = z.infer<typeof storageUnitSchema>;

/** Body of `POST …/storage-units`. */
export const createStorageUnitRequestSchema = z
  .object({
    roomId: uuidSchema,
    parentId: uuidSchema.nullable().optional(),
    kind: storageUnitKindSchema.default('container'),
    name: nameSchema,
    notes: notesSchema.nullable().optional(),
    sortOrder: z.int().min(0).max(32_767).default(0),
  })
  .strict()
  .meta({ id: 'CreateStorageUnitRequest' });
/** Body of `POST …/storage-units`. */
export type CreateStorageUnitRequest = z.infer<typeof createStorageUnitRequestSchema>;

/** Body of `PATCH …/storage-units/{unitId}`. */
export const updateStorageUnitRequestSchema = z
  .object({
    roomId: uuidSchema.optional(),
    parentId: uuidSchema.nullable().optional(),
    kind: storageUnitKindSchema.optional(),
    name: nameSchema.optional(),
    notes: notesSchema.nullable().optional(),
    sortOrder: z.int().min(0).max(32_767).optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateStorageUnitRequest' });
/** Body of `PATCH …/storage-units/{unitId}`. */
export type UpdateStorageUnitRequest = z.infer<typeof updateStorageUnitRequestSchema>;

/** Query of `GET …/storage-units`. */
export const storageUnitListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    roomId: uuidSchema.optional(),
  })
  .strict();

/** Response of `GET …/storage-units`. */
export const storageUnitPageSchema = pageSchema(storageUnitSchema).meta({ id: 'StorageUnitPage' });

/** Path params of a storage unit. */
export const storageUnitParamsSchema = z
  .object({ familyId: uuidSchema, houseId: uuidSchema, unitId: uuidSchema })
  .strict();

/** One inventory item with optional photo, receipt and warranty metadata. */
export const inventoryItemSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    roomId: uuidSchema,
    storageUnitId: uuidSchema.nullable(),
    name: itemNameSchema,
    category: categorySchema.nullable(),
    quantity: quantitySchema,
    unit: unitSchema.nullable(),
    brand: shortLabelSchema.nullable(),
    model: shortLabelSchema.nullable(),
    serialNumber: shortLabelSchema.nullable(),
    barcode: barcodeSchema.nullable(),
    purchaseDate: localDateSchema.nullable(),
    purchasePrice: costSchema.nullable(),
    warrantyUntil: localDateSchema.nullable(),
    warrantyNotes: notesSchema.nullable(),
    tags: tagsSchema,
    notes: longNotesSchema.nullable(),
    photoCaption: captionSchema.nullable(),
    photoDataUrl: dataUrlSchema.nullable(),
    receiptCaption: captionSchema.nullable(),
    receiptDataUrl: dataUrlSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'InventoryItem' });
/** One inventory item. */
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

/** Body of `POST …/inventory-items`. */
export const createInventoryItemRequestSchema = z
  .object({
    roomId: uuidSchema,
    storageUnitId: uuidSchema.nullable().optional(),
    name: itemNameSchema,
    category: categorySchema.nullable().optional(),
    quantity: quantitySchema.default(1),
    unit: unitSchema.nullable().optional(),
    brand: shortLabelSchema.nullable().optional(),
    model: shortLabelSchema.nullable().optional(),
    serialNumber: shortLabelSchema.nullable().optional(),
    barcode: barcodeSchema.nullable().optional(),
    purchaseDate: localDateSchema.nullable().optional(),
    purchasePrice: costSchema.nullable().optional(),
    warrantyUntil: localDateSchema.nullable().optional(),
    warrantyNotes: notesSchema.nullable().optional(),
    tags: tagsSchema.default([]),
    notes: longNotesSchema.nullable().optional(),
    photoCaption: captionSchema.nullable().optional(),
    photoDataUrl: dataUrlSchema.nullable().optional(),
    receiptCaption: captionSchema.nullable().optional(),
    receiptDataUrl: dataUrlSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateInventoryItemRequest' });
/** Body of `POST …/inventory-items`. */
export type CreateInventoryItemRequest = z.infer<typeof createInventoryItemRequestSchema>;

/** Body of `PATCH …/inventory-items/{itemId}`. */
export const updateInventoryItemRequestSchema = z
  .object({
    roomId: uuidSchema.optional(),
    storageUnitId: uuidSchema.nullable().optional(),
    name: itemNameSchema.optional(),
    category: categorySchema.nullable().optional(),
    quantity: quantitySchema.optional(),
    unit: unitSchema.nullable().optional(),
    brand: shortLabelSchema.nullable().optional(),
    model: shortLabelSchema.nullable().optional(),
    serialNumber: shortLabelSchema.nullable().optional(),
    barcode: barcodeSchema.nullable().optional(),
    purchaseDate: localDateSchema.nullable().optional(),
    purchasePrice: costSchema.nullable().optional(),
    warrantyUntil: localDateSchema.nullable().optional(),
    warrantyNotes: notesSchema.nullable().optional(),
    tags: tagsSchema.optional(),
    notes: longNotesSchema.nullable().optional(),
    photoCaption: captionSchema.nullable().optional(),
    photoDataUrl: dataUrlSchema.nullable().optional(),
    receiptCaption: captionSchema.nullable().optional(),
    receiptDataUrl: dataUrlSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateInventoryItemRequest' });
/** Body of `PATCH …/inventory-items/{itemId}`. */
export type UpdateInventoryItemRequest = z.infer<typeof updateInventoryItemRequestSchema>;

/** Query of `GET …/inventory-items`. */
export const inventoryItemListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    roomId: uuidSchema.optional(),
    storageUnitId: uuidSchema.optional(),
  })
  .strict();

/** Response of `GET …/inventory-items`. */
export const inventoryItemPageSchema = pageSchema(inventoryItemSchema).meta({ id: 'InventoryItemPage' });

/** Path params of an inventory item. */
export const inventoryItemParamsSchema = z
  .object({ familyId: uuidSchema, houseId: uuidSchema, itemId: uuidSchema })
  .strict();

/** One hit of the house inventory search. */
export const inventorySearchHitSchema = z
  .object({
    resourceType: z.enum(['rooms', 'storage_units', 'inventory_items']),
    resourceId: uuidSchema,
    title: z.string().min(1).max(300),
    body: z.string().max(20000),
    tags: tagsSchema,
    rank: z.number(),
  })
  .strict()
  .meta({ id: 'InventorySearchHit' });
/** One search hit. */
export type InventorySearchHit = z.infer<typeof inventorySearchHitSchema>;

/** Query of `GET …/inventory/search`. */
export const inventorySearchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    tag: tagSchema.optional(),
  })
  .strict();

/** Response of `GET …/inventory/search`. */
export const inventorySearchResponseSchema = z
  .object({ items: z.array(inventorySearchHitSchema) })
  .strict()
  .meta({ id: 'InventorySearchResponse' });
/** Response of inventory search. */
export type InventorySearchResponse = z.infer<typeof inventorySearchResponseSchema>;
