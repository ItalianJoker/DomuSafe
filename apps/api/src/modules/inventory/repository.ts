import type { InventoryFilterNode } from '@domusafe/contracts';
import {
  houses,
  inventoryItems,
  rooms,
  savedFilters,
  searchIndex,
  storageUnits,
  type Transaction,
} from '@domusafe/db';
import { and, asc, desc, eq, isNull, or, sql, type SQL } from 'drizzle-orm';

/** Row of `rooms`. */
export type RoomRow = typeof rooms.$inferSelect;
/** Row of `storage_units`. */
export type StorageUnitRow = typeof storageUnits.$inferSelect;
/** Row of `inventory_items`. */
export type InventoryItemRow = typeof inventoryItems.$inferSelect;
/** Row of `search_index`. */
export type SearchIndexRow = typeof searchIndex.$inferSelect;
/** Row of `saved_filters`. */
export type SavedFilterRow = typeof savedFilters.$inferSelect;

interface Page {
  readonly limit: number;
  readonly after: readonly [string, string] | null;
}

/**
 * Reads a house the current principal can see.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: trashed and out-of-scope houses are `null`.
 * Data contract: only the id is returned.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns The house id, or `null`.
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
 * Inserts a room.
 *
 * Preconditions: the house belongs to the family.
 * Postconditions: version is 1.
 * Data contract: name and kind are class C.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertRoom(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly houseId: string;
    readonly name: string;
    readonly kind: RoomRow['kind'];
    readonly floor: number | null;
    readonly sortOrder: number;
    readonly notes: string | null;
    readonly photoDayDataUrl: string | null;
    readonly photoEveningDataUrl: string | null;
    readonly photoLightsOffDataUrl: string | null;
    readonly photoDayStorageRef: string | null;
    readonly photoEveningStorageRef: string | null;
    readonly photoLightsOffStorageRef: string | null;
    readonly createdBy: string;
  },
): Promise<RoomRow> {
  const [row] = await tx
    .insert(rooms)
    .values({ ...input, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Room insert returned no row');
  }
  return row;
}

/**
 * Lists rooms of one house.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: at most `limit + 1` non-deleted rows, ordered by sort then creation.
 * Data contract: guests receive no rows (RLS).
 *
 * @param tx - Transaction.
 * @param scope - Family, house and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listRooms(
  tx: Transaction,
  scope: { readonly familyId: string; readonly houseId: string } & Page,
): Promise<RoomRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${rooms.createdAt}, ${rooms.id}) > (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(rooms)
    .where(
      and(
        eq(rooms.familyId, scope.familyId),
        eq(rooms.houseId, scope.houseId),
        isNull(rooms.deletedAt),
        after,
      ),
    )
    .orderBy(asc(rooms.sortOrder), asc(rooms.createdAt), asc(rooms.id))
    .limit(scope.limit + 1);
}

/**
 * Reads one room.
 *
 * @param tx - Transaction.
 * @param scope - Family, house and room id.
 * @returns The row, or `null`.
 */
export async function findRoom(
  tx: Transaction,
  scope: { readonly familyId: string; readonly houseId: string; readonly roomId: string },
): Promise<RoomRow | null> {
  const [row] = await tx
    .select()
    .from(rooms)
    .where(
      and(
        eq(rooms.familyId, scope.familyId),
        eq(rooms.houseId, scope.houseId),
        eq(rooms.id, scope.roomId),
        isNull(rooms.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates a room when the version matches.
 *
 * @param tx - Transaction.
 * @param target - Family, house, room and expected version.
 * @param patch - Columns to change.
 * @returns The updated row, or `null`.
 */
export async function updateRoom(
  tx: Transaction,
  target: {
    readonly familyId: string;
    readonly houseId: string;
    readonly roomId: string;
    readonly expectedVersion: number;
  },
  patch: {
    readonly name?: string;
    readonly kind?: RoomRow['kind'];
    readonly floor?: number | null;
    readonly sortOrder?: number;
    readonly notes?: string | null;
    readonly photoDayDataUrl?: string | null;
    readonly photoEveningDataUrl?: string | null;
    readonly photoLightsOffDataUrl?: string | null;
    readonly photoDayStorageRef?: string | null;
    readonly photoEveningStorageRef?: string | null;
    readonly photoLightsOffStorageRef?: string | null;
    readonly deletedAt?: Date;
    readonly updatedBy: string;
  },
): Promise<RoomRow | null> {
  const [row] = await tx
    .update(rooms)
    .set({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.kind === undefined ? {} : { kind: patch.kind }),
      ...(patch.floor === undefined ? {} : { floor: patch.floor }),
      ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }),
      ...(patch.notes === undefined ? {} : { notes: patch.notes }),
      ...(patch.photoDayDataUrl === undefined ? {} : { photoDayDataUrl: patch.photoDayDataUrl }),
      ...(patch.photoEveningDataUrl === undefined ? {} : { photoEveningDataUrl: patch.photoEveningDataUrl }),
      ...(patch.photoLightsOffDataUrl === undefined
        ? {}
        : { photoLightsOffDataUrl: patch.photoLightsOffDataUrl }),
      ...(patch.photoDayStorageRef === undefined ? {} : { photoDayStorageRef: patch.photoDayStorageRef }),
      ...(patch.photoEveningStorageRef === undefined
        ? {}
        : { photoEveningStorageRef: patch.photoEveningStorageRef }),
      ...(patch.photoLightsOffStorageRef === undefined
        ? {}
        : { photoLightsOffStorageRef: patch.photoLightsOffStorageRef }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${rooms.version} + 1`,
    })
    .where(
      and(
        eq(rooms.familyId, target.familyId),
        eq(rooms.houseId, target.houseId),
        eq(rooms.id, target.roomId),
        eq(rooms.version, target.expectedVersion),
        isNull(rooms.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a storage unit.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertStorageUnit(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly houseId: string;
    readonly roomId: string;
    readonly parentId: string | null;
    readonly kind: StorageUnitRow['kind'];
    readonly name: string;
    readonly notes: string | null;
    readonly sortOrder: number;
    readonly createdBy: string;
  },
): Promise<StorageUnitRow> {
  const [row] = await tx
    .insert(storageUnits)
    .values({ ...input, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Storage unit insert returned no row');
  }
  return row;
}

/**
 * Lists storage units of one house, optionally filtered by room.
 *
 * @param tx - Transaction.
 * @param scope - Family, house, optional room and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listStorageUnits(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly houseId: string;
    readonly roomId?: string;
  } & Page,
): Promise<StorageUnitRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${storageUnits.createdAt}, ${storageUnits.id}) > (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(storageUnits)
    .where(
      and(
        eq(storageUnits.familyId, scope.familyId),
        eq(storageUnits.houseId, scope.houseId),
        scope.roomId === undefined ? undefined : eq(storageUnits.roomId, scope.roomId),
        isNull(storageUnits.deletedAt),
        after,
      ),
    )
    .orderBy(asc(storageUnits.sortOrder), asc(storageUnits.createdAt), asc(storageUnits.id))
    .limit(scope.limit + 1);
}

/**
 * Reads one storage unit.
 *
 * @param tx - Transaction.
 * @param scope - Family, house and unit id.
 * @returns The row, or `null`.
 */
export async function findStorageUnit(
  tx: Transaction,
  scope: { readonly familyId: string; readonly houseId: string; readonly unitId: string },
): Promise<StorageUnitRow | null> {
  const [row] = await tx
    .select()
    .from(storageUnits)
    .where(
      and(
        eq(storageUnits.familyId, scope.familyId),
        eq(storageUnits.houseId, scope.houseId),
        eq(storageUnits.id, scope.unitId),
        isNull(storageUnits.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates a storage unit when the version matches.
 *
 * @param tx - Transaction.
 * @param target - Family, house, unit and expected version.
 * @param patch - Columns to change.
 * @returns The updated row, or `null`.
 */
export async function updateStorageUnit(
  tx: Transaction,
  target: {
    readonly familyId: string;
    readonly houseId: string;
    readonly unitId: string;
    readonly expectedVersion: number;
  },
  patch: {
    readonly roomId?: string;
    readonly parentId?: string | null;
    readonly kind?: StorageUnitRow['kind'];
    readonly name?: string;
    readonly notes?: string | null;
    readonly sortOrder?: number;
    readonly deletedAt?: Date;
    readonly updatedBy: string;
  },
): Promise<StorageUnitRow | null> {
  const [row] = await tx
    .update(storageUnits)
    .set({
      ...(patch.roomId === undefined ? {} : { roomId: patch.roomId }),
      ...(patch.parentId === undefined ? {} : { parentId: patch.parentId }),
      ...(patch.kind === undefined ? {} : { kind: patch.kind }),
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.notes === undefined ? {} : { notes: patch.notes }),
      ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${storageUnits.version} + 1`,
    })
    .where(
      and(
        eq(storageUnits.familyId, target.familyId),
        eq(storageUnits.houseId, target.houseId),
        eq(storageUnits.id, target.unitId),
        eq(storageUnits.version, target.expectedVersion),
        isNull(storageUnits.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts an inventory item.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertInventoryItem(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly houseId: string;
    readonly roomId: string;
    readonly storageUnitId: string | null;
    readonly name: string;
    readonly category: string | null;
    readonly quantity: string;
    readonly unit: string | null;
    readonly brand: string | null;
    readonly model: string | null;
    readonly serialNumber: string | null;
    readonly barcode: string | null;
    readonly purchaseDate: string | null;
    readonly purchasePriceMinor: number | null;
    readonly currency: string | null;
    readonly warrantyUntil: string | null;
    readonly warrantyNotes: string | null;
    readonly tags: readonly string[];
    readonly notes: string | null;
    readonly photoCaption: string | null;
    readonly photoDataUrl: string | null;
    readonly receiptCaption: string | null;
    readonly receiptDataUrl: string | null;
    readonly createdBy: string;
  },
): Promise<InventoryItemRow> {
  const [row] = await tx
    .insert(inventoryItems)
    .values({
      familyId: input.familyId,
      houseId: input.houseId,
      roomId: input.roomId,
      storageUnitId: input.storageUnitId,
      name: input.name,
      category: input.category,
      quantity: input.quantity,
      unit: input.unit,
      brand: input.brand,
      model: input.model,
      serialNumber: input.serialNumber,
      barcode: input.barcode,
      purchaseDate: input.purchaseDate,
      purchasePriceMinor: input.purchasePriceMinor,
      currency: input.currency,
      warrantyUntil: input.warrantyUntil,
      warrantyNotes: input.warrantyNotes,
      tags: [...input.tags],
      notes: input.notes,
      photoCaption: input.photoCaption,
      photoDataUrl: input.photoDataUrl,
      receiptCaption: input.receiptCaption,
      receiptDataUrl: input.receiptDataUrl,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Inventory item insert returned no row');
  }
  return row;
}

/**
 * Lists inventory items of one house, optionally filtered by room or storage unit.
 *
 * @param tx - Transaction.
 * @param scope - Family, house, filters and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listInventoryItems(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly houseId: string;
    readonly roomId?: string;
    readonly storageUnitId?: string;
  } & Page,
): Promise<InventoryItemRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${inventoryItems.createdAt}, ${inventoryItems.id}) > (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.familyId, scope.familyId),
        eq(inventoryItems.houseId, scope.houseId),
        scope.roomId === undefined ? undefined : eq(inventoryItems.roomId, scope.roomId),
        scope.storageUnitId === undefined ? undefined : eq(inventoryItems.storageUnitId, scope.storageUnitId),
        isNull(inventoryItems.deletedAt),
        after,
      ),
    )
    .orderBy(asc(inventoryItems.createdAt), asc(inventoryItems.id))
    .limit(scope.limit + 1);
}

/**
 * Reads one inventory item.
 *
 * @param tx - Transaction.
 * @param scope - Family, house and item id.
 * @returns The row, or `null`.
 */
export async function findInventoryItem(
  tx: Transaction,
  scope: { readonly familyId: string; readonly houseId: string; readonly itemId: string },
): Promise<InventoryItemRow | null> {
  const [row] = await tx
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.familyId, scope.familyId),
        eq(inventoryItems.houseId, scope.houseId),
        eq(inventoryItems.id, scope.itemId),
        isNull(inventoryItems.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates an inventory item when the version matches.
 *
 * @param tx - Transaction.
 * @param target - Family, house, item and expected version.
 * @param patch - Columns to change.
 * @returns The updated row, or `null`.
 */
export async function updateInventoryItem(
  tx: Transaction,
  target: {
    readonly familyId: string;
    readonly houseId: string;
    readonly itemId: string;
    readonly expectedVersion: number;
  },
  patch: {
    readonly roomId?: string;
    readonly storageUnitId?: string | null;
    readonly name?: string;
    readonly category?: string | null;
    readonly quantity?: string;
    readonly unit?: string | null;
    readonly brand?: string | null;
    readonly model?: string | null;
    readonly serialNumber?: string | null;
    readonly barcode?: string | null;
    readonly purchaseDate?: string | null;
    readonly purchasePriceMinor?: number | null;
    readonly currency?: string | null;
    readonly warrantyUntil?: string | null;
    readonly warrantyNotes?: string | null;
    readonly tags?: readonly string[];
    readonly notes?: string | null;
    readonly photoCaption?: string | null;
    readonly photoDataUrl?: string | null;
    readonly receiptCaption?: string | null;
    readonly receiptDataUrl?: string | null;
    readonly deletedAt?: Date;
    readonly updatedBy: string;
  },
): Promise<InventoryItemRow | null> {
  const [row] = await tx
    .update(inventoryItems)
    .set({
      ...(patch.roomId === undefined ? {} : { roomId: patch.roomId }),
      ...(patch.storageUnitId === undefined ? {} : { storageUnitId: patch.storageUnitId }),
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.category === undefined ? {} : { category: patch.category }),
      ...(patch.quantity === undefined ? {} : { quantity: patch.quantity }),
      ...(patch.unit === undefined ? {} : { unit: patch.unit }),
      ...(patch.brand === undefined ? {} : { brand: patch.brand }),
      ...(patch.model === undefined ? {} : { model: patch.model }),
      ...(patch.serialNumber === undefined ? {} : { serialNumber: patch.serialNumber }),
      ...(patch.barcode === undefined ? {} : { barcode: patch.barcode }),
      ...(patch.purchaseDate === undefined ? {} : { purchaseDate: patch.purchaseDate }),
      ...(patch.purchasePriceMinor === undefined ? {} : { purchasePriceMinor: patch.purchasePriceMinor }),
      ...(patch.currency === undefined ? {} : { currency: patch.currency }),
      ...(patch.warrantyUntil === undefined ? {} : { warrantyUntil: patch.warrantyUntil }),
      ...(patch.warrantyNotes === undefined ? {} : { warrantyNotes: patch.warrantyNotes }),
      ...(patch.tags === undefined ? {} : { tags: [...patch.tags] }),
      ...(patch.notes === undefined ? {} : { notes: patch.notes }),
      ...(patch.photoCaption === undefined ? {} : { photoCaption: patch.photoCaption }),
      ...(patch.photoDataUrl === undefined ? {} : { photoDataUrl: patch.photoDataUrl }),
      ...(patch.receiptCaption === undefined ? {} : { receiptCaption: patch.receiptCaption }),
      ...(patch.receiptDataUrl === undefined ? {} : { receiptDataUrl: patch.receiptDataUrl }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${inventoryItems.version} + 1`,
    })
    .where(
      and(
        eq(inventoryItems.familyId, target.familyId),
        eq(inventoryItems.houseId, target.houseId),
        eq(inventoryItems.id, target.itemId),
        eq(inventoryItems.version, target.expectedVersion),
        isNull(inventoryItems.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Upserts a search index row for a class C resource of the house.
 *
 * Preconditions: the family context is set; title is non-empty.
 * Postconditions: the row is visible to members of the house.
 * Data contract: only class C text is indexed.
 *
 * @param tx - Transaction.
 * @param input - Index columns.
 */
export async function upsertSearchIndex(
  tx: Transaction,
  input: {
    readonly resourceType: 'rooms' | 'storage_units' | 'inventory_items';
    readonly resourceId: string;
    readonly familyId: string;
    readonly houseId: string;
    readonly title: string;
    readonly body: string;
    readonly tags: readonly string[];
  },
): Promise<void> {
  await tx
    .insert(searchIndex)
    .values({
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      familyId: input.familyId,
      houseId: input.houseId,
      title: input.title,
      body: input.body,
      tags: [...input.tags],
      visibility: 'family',
      audienceGuest: false,
      updatedAt: sql`now()`,
    })
    .onConflictDoUpdate({
      target: [searchIndex.resourceType, searchIndex.resourceId],
      set: {
        title: input.title,
        body: input.body,
        tags: [...input.tags],
        houseId: input.houseId,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * Removes a search index row when the resource is trashed.
 *
 * @param tx - Transaction.
 * @param resourceType - Indexed type.
 * @param resourceId - Resource id.
 */
export async function deleteSearchIndex(
  tx: Transaction,
  resourceType: 'rooms' | 'storage_units' | 'inventory_items',
  resourceId: string,
): Promise<void> {
  await tx
    .delete(searchIndex)
    .where(and(eq(searchIndex.resourceType, resourceType), eq(searchIndex.resourceId, resourceId)));
}

function textMatchSql(query: string): SQL {
  return sql`(
    tsv @@ websearch_to_tsquery('public.domusafe_it', ${query})
    or app.f_unaccent(${searchIndex.title}) % app.f_unaccent(${query})
    or ${searchIndex.title} ilike ${'%' + query + '%'}
    or ${searchIndex.body} ilike ${'%' + query + '%'}
  )`;
}

function tagsMatchSql(tags: readonly string[], mode: 'and' | 'or'): SQL {
  const values = sql.join(
    tags.map((tag) => sql`${tag}`),
    sql`, `,
  );
  return mode === 'and'
    ? sql`${searchIndex.tags} @> array[${values}]::text[]`
    : sql`${searchIndex.tags} && array[${values}]::text[]`;
}

/**
 * Compiles one inventory filter node into a SQL predicate over `search_index`.
 *
 * Preconditions: `node` was validated by the contracts schema.
 * Postconditions: returns a parameterised predicate with no raw client SQL.
 * Data contract: text uses `domusafe_it`; tags use containment (`@>`) or overlap (`&&`).
 *
 * @param node - Nested filter tree.
 * @returns Drizzle SQL fragment.
 */
export function compileInventoryFilter(node: InventoryFilterNode): SQL {
  switch (node.kind) {
    case 'text':
      return textMatchSql(node.q);
    case 'tags':
      return tagsMatchSql(node.tags, node.mode);
    case 'types':
      return sql`${searchIndex.resourceType} = any (array[${sql.join(
        node.types.map((type) => sql`${type}`),
        sql`, `,
      )}]::text[])`;
    case 'group': {
      const parts = node.children.map((child) => compileInventoryFilter(child));
      const combined = node.op === 'and' ? and(...parts) : or(...parts);
      if (combined === undefined) {
        throw new Error('Filter group compiled to an empty predicate');
      }
      return combined;
    }
  }
}

/**
 * First full-text leaf in document order, used to rank hits.
 *
 * @param node - Nested filter tree.
 * @returns Query text, or `null` when the tree has no text leaf.
 */
export function firstTextQuery(node: InventoryFilterNode): string | null {
  switch (node.kind) {
    case 'text':
      return node.q;
    case 'tags':
    case 'types':
      return null;
    case 'group':
      for (const child of node.children) {
        const found = firstTextQuery(child);
        if (found !== null) {
          return found;
        }
      }
      return null;
  }
}

/**
 * Full-text search over the house inventory index.
 *
 * Preconditions: either `query` is a non-empty trimmed string, or `filter` is a validated tree.
 * Postconditions: at most `limit` hits, highest rank first.
 * Data contract: only rooms, storage units and inventory items of the house.
 *
 * @param tx - Transaction.
 * @param scope - Family, house, simple query and/or nested filter, optional tags and limit.
 * @returns Ranked hits.
 */
export async function searchInventory(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly houseId: string;
    readonly query?: string;
    readonly tag?: string;
    readonly tags?: readonly string[];
    readonly tagMode?: 'and' | 'or';
    readonly filter?: InventoryFilterNode;
    readonly limit: number;
  },
): Promise<
  readonly {
    readonly resourceType: 'rooms' | 'storage_units' | 'inventory_items';
    readonly resourceId: string;
    readonly title: string;
    readonly body: string;
    readonly tags: string[];
    readonly rank: number;
  }[]
> {
  const filterPredicate = scope.filter === undefined ? undefined : compileInventoryFilter(scope.filter);
  const queryText =
    scope.filter === undefined
      ? (scope.query ?? null)
      : (firstTextQuery(scope.filter) ?? scope.query ?? null);
  const simpleText =
    scope.filter === undefined && scope.query !== undefined ? textMatchSql(scope.query) : undefined;
  const tagPredicate =
    scope.tags !== undefined && scope.tags.length > 0
      ? tagsMatchSql(scope.tags, scope.tagMode ?? 'and')
      : scope.tag === undefined
        ? undefined
        : tagsMatchSql([scope.tag], 'and');

  const rankExpression =
    queryText === null
      ? sql<number>`0::float8`
      : sql<number>`ts_rank_cd(tsv, websearch_to_tsquery('public.domusafe_it', ${queryText}))
          + similarity(app.f_unaccent(${searchIndex.title}), app.f_unaccent(${queryText}))`;

  const rows = await tx
    .select({
      resourceType: searchIndex.resourceType,
      resourceId: searchIndex.resourceId,
      title: searchIndex.title,
      body: searchIndex.body,
      tags: searchIndex.tags,
      rank: rankExpression,
    })
    .from(searchIndex)
    .where(
      and(
        eq(searchIndex.familyId, scope.familyId),
        eq(searchIndex.houseId, scope.houseId),
        sql`${searchIndex.resourceType} = any (array['rooms','storage_units','inventory_items']::text[])`,
        filterPredicate,
        simpleText,
        tagPredicate,
      ),
    )
    .orderBy(
      desc(
        queryText === null
          ? sql`0::float8`
          : sql`ts_rank_cd(tsv, websearch_to_tsquery('public.domusafe_it', ${queryText}))
              + similarity(app.f_unaccent(${searchIndex.title}), app.f_unaccent(${queryText}))`,
      ),
      asc(searchIndex.title),
    )
    .limit(scope.limit);

  return rows.map((row) => ({
    resourceType: row.resourceType as 'rooms' | 'storage_units' | 'inventory_items',
    resourceId: row.resourceId,
    title: row.title,
    body: row.body,
    tags: row.tags,
    rank: row.rank,
  }));
}

/**
 * Lists saved inventory filters of one account in a family, sidebar order.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param accountId - Owner account id.
 * @returns Up to five pinned filters.
 */
export async function listSavedFilters(
  tx: Transaction,
  familyId: string,
  accountId: string,
): Promise<readonly SavedFilterRow[]> {
  return tx
    .select()
    .from(savedFilters)
    .where(and(eq(savedFilters.familyId, familyId), eq(savedFilters.accountId, accountId)))
    .orderBy(asc(savedFilters.pinnedPosition));
}

/**
 * Counts saved inventory filters of one account in a family.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param accountId - Owner account id.
 * @returns Current count under the pin limit.
 */
export async function countSavedFilters(
  tx: Transaction,
  familyId: string,
  accountId: string,
): Promise<number> {
  const rows = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(savedFilters)
    .where(and(eq(savedFilters.familyId, familyId), eq(savedFilters.accountId, accountId)));
  return rows[0]?.value ?? 0;
}

/**
 * Finds the lowest free pin slot from 1 to 5.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param accountId - Owner account id.
 * @returns Free position, or `null` when all five slots are taken.
 */
export async function nextSavedFilterPin(
  tx: Transaction,
  familyId: string,
  accountId: string,
): Promise<number | null> {
  const rows = await listSavedFilters(tx, familyId, accountId);
  const used = new Set(rows.map((row) => row.pinnedPosition));
  for (let position = 1; position <= 5; position += 1) {
    if (!used.has(position)) {
      return position;
    }
  }
  return null;
}

/**
 * Reads one saved filter owned by the current account.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param accountId - Owner account id.
 * @param filterId - Filter id.
 * @returns The row, or `null`.
 */
export async function findSavedFilter(
  tx: Transaction,
  familyId: string,
  accountId: string,
  filterId: string,
): Promise<SavedFilterRow | null> {
  const rows = await tx
    .select()
    .from(savedFilters)
    .where(
      and(
        eq(savedFilters.familyId, familyId),
        eq(savedFilters.accountId, accountId),
        eq(savedFilters.id, filterId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Inserts a saved inventory filter.
 *
 * @param tx - Transaction.
 * @param input - Row fields.
 * @returns The inserted row.
 */
export async function insertSavedFilter(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly accountId: string;
    readonly name: string;
    readonly definition: InventoryFilterNode;
    readonly pinnedPosition: number;
    readonly createdBy: string;
  },
): Promise<SavedFilterRow> {
  const rows = await tx
    .insert(savedFilters)
    .values({
      familyId: input.familyId,
      accountId: input.accountId,
      name: input.name,
      definition: { ...input.definition },
      pinnedPosition: input.pinnedPosition,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Insert of saved_filters returned no row');
  }
  return row;
}

/**
 * Updates a saved inventory filter with optimistic concurrency.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param accountId - Owner account id.
 * @param filterId - Filter id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Fields to change.
 * @returns The updated row, or `null` on version conflict / missing row.
 */
export async function updateSavedFilter(
  tx: Transaction,
  familyId: string,
  accountId: string,
  filterId: string,
  expectedVersion: number,
  patch: {
    readonly name?: string;
    readonly definition?: InventoryFilterNode;
    readonly pinnedPosition?: number;
    readonly updatedBy: string;
  },
): Promise<SavedFilterRow | null> {
  const rows = await tx
    .update(savedFilters)
    .set({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.definition === undefined ? {} : { definition: { ...patch.definition } }),
      ...(patch.pinnedPosition === undefined ? {} : { pinnedPosition: patch.pinnedPosition }),
      updatedBy: patch.updatedBy,
      version: sql`${savedFilters.version} + 1`,
    })
    .where(
      and(
        eq(savedFilters.familyId, familyId),
        eq(savedFilters.accountId, accountId),
        eq(savedFilters.id, filterId),
        eq(savedFilters.version, expectedVersion),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

/**
 * Deletes a saved inventory filter owned by the current account.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param accountId - Owner account id.
 * @param filterId - Filter id.
 * @param expectedVersion - Version the client loaded.
 * @returns Whether a row was deleted.
 */
export async function deleteSavedFilter(
  tx: Transaction,
  familyId: string,
  accountId: string,
  filterId: string,
  expectedVersion: number,
): Promise<boolean> {
  const rows = await tx
    .delete(savedFilters)
    .where(
      and(
        eq(savedFilters.familyId, familyId),
        eq(savedFilters.accountId, accountId),
        eq(savedFilters.id, filterId),
        eq(savedFilters.version, expectedVersion),
      ),
    )
    .returning({ id: savedFilters.id });
  return rows.length > 0;
}
