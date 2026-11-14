import {
  currencySchema,
  encodeCursor,
  type CreateInventoryItemRequest,
  type CreateRoomRequest,
  type CreateStorageUnitRequest,
  type InventoryItem,
  type InventorySearchHit,
  type InventorySearchResponse,
  type Room,
  type StorageUnit,
  type UpdateInventoryItemRequest,
  type UpdateRoomRequest,
  type UpdateStorageUnitRequest,
} from '@domusafe/contracts';
import { recordAudit, recordRevision, withContext, type Database, type Transaction } from '@domusafe/db';
import { ProblemError, classifyDatabaseError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
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

function pageOf<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
  view: (row: T) => unknown,
): Page<never> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice.at(-1);
  return {
    items: slice.map(view) as never[],
    nextCursor: hasMore && last !== undefined ? encodeCursor([last.createdAt.toISOString(), last.id]) : null,
  };
}

function money(amount: number | null, currency: string | null): InventoryItem['purchasePrice'] {
  if (amount === null || currency === null) {
    return null;
  }
  const parsed = currencySchema.safeParse(currency);
  if (!parsed.success) {
    throw new Error('Stored currency is not in the catalogue');
  }
  return { amountMinor: amount, currency: parsed.data };
}

function quantityOf(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Stored quantity is invalid');
  }
  return parsed;
}

function roomView(row: repo.RoomRow): Room {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    name: row.name,
    kind: row.kind,
    floor: row.floor,
    sortOrder: row.sortOrder,
    notes: row.notes,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function storageView(row: repo.StorageUnitRow): StorageUnit {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    roomId: row.roomId,
    parentId: row.parentId,
    kind: row.kind,
    name: row.name,
    notes: row.notes,
    sortOrder: row.sortOrder,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function itemView(row: repo.InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    roomId: row.roomId,
    storageUnitId: row.storageUnitId,
    name: row.name,
    category: row.category,
    quantity: quantityOf(row.quantity),
    unit: row.unit,
    brand: row.brand,
    model: row.model,
    serialNumber: row.serialNumber,
    barcode: row.barcode,
    purchaseDate: row.purchaseDate,
    purchasePrice: money(row.purchasePriceMinor, row.currency),
    warrantyUntil: row.warrantyUntil,
    warrantyNotes: row.warrantyNotes,
    tags: row.tags,
    notes: row.notes,
    photoCaption: row.photoCaption,
    photoDataUrl: row.photoDataUrl,
    receiptCaption: row.receiptCaption,
    receiptDataUrl: row.receiptDataUrl,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function roomSearchBody(row: repo.RoomRow): string {
  return [row.kind, row.notes ?? ''].filter((part) => part.length > 0).join('\n');
}

function storageSearchBody(row: repo.StorageUnitRow): string {
  return [row.kind, row.notes ?? ''].filter((part) => part.length > 0).join('\n');
}

function itemSearchBody(row: repo.InventoryItemRow): string {
  return [
    row.category ?? '',
    row.brand ?? '',
    row.model ?? '',
    row.serialNumber ?? '',
    row.barcode ?? '',
    row.notes ?? '',
    row.warrantyNotes ?? '',
    row.photoCaption ?? '',
    row.receiptCaption ?? '',
    row.tags.join(' '),
  ]
    .filter((part) => part.length > 0)
    .join('\n');
}

/**
 * Inventory service: rooms, storage units, items and full-text search.
 *
 * Preconditions: callers pass a resolved family tenant.
 * Postconditions: every write records a revision and an audit event in the same transaction.
 * Data contract: inventory is class C and available on every plan; custom fields stay out of this slice.
 *
 * @param db - Application database.
 * @param now - Clock, injectable for tests.
 * @returns The service.
 */
export function createInventoryService(db: Database, now: () => Date = () => new Date()) {
  async function inFamily<T>(tenant: TenantContext, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, work);
  }

  async function requireHouse(tx: Transaction, familyId: string, houseId: string): Promise<void> {
    const house = await repo.findHouse(tx, familyId, houseId);
    if (house === null) {
      throw new ProblemError('not_found');
    }
  }

  async function trace(
    tx: Transaction,
    tenant: TenantContext,
    input: {
      readonly action: string;
      readonly resourceType: string;
      readonly resourceId: string;
      readonly version: number;
      readonly op: 'create' | 'update' | 'delete';
      readonly data: Record<string, unknown>;
      readonly houseId: string;
    },
  ): Promise<void> {
    await recordRevision(tx, {
      familyId: tenant.familyId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      version: input.version,
      op: input.op,
      actor: { kind: 'account', id: tenant.accountId },
      data: input.data,
      houseId: input.houseId,
    });
    await recordAudit(tx, {
      familyId: tenant.familyId,
      actor: { kind: 'account', id: tenant.accountId },
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      outcome: 'success',
      metadata: { version: input.version },
    });
  }

  return {
    /**
     * Lists rooms of one house.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param page - Limit and cursor.
     * @returns One page.
     */
    async listRooms(
      tenant: TenantContext,
      houseId: string,
      page: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<Room>> {
      return inFamily(tenant, async (tx) => {
        await requireHouse(tx, tenant.familyId, houseId);
        const rows = await repo.listRooms(tx, {
          familyId: tenant.familyId,
          houseId,
          limit: page.limit,
          after: page.after,
        });
        return pageOf(rows, page.limit, roomView);
      });
    },

    /**
     * Creates a room.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param input - Validated body.
     * @returns The room.
     */
    async createRoom(tenant: TenantContext, houseId: string, input: CreateRoomRequest): Promise<Room> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          await requireHouse(tx, tenant.familyId, houseId);
          const row = await repo.insertRoom(tx, {
            familyId: tenant.familyId,
            houseId,
            name: input.name,
            kind: input.kind,
            floor: input.floor ?? null,
            sortOrder: input.sortOrder,
            notes: input.notes ?? null,
            createdBy: tenant.accountId,
          });
          await repo.upsertSearchIndex(tx, {
            resourceType: 'rooms',
            resourceId: row.id,
            familyId: tenant.familyId,
            houseId,
            title: row.name,
            body: roomSearchBody(row),
            tags: [],
          });
          await trace(tx, tenant, {
            action: 'inventory.room.created',
            resourceType: 'rooms',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            houseId,
            data: { name: row.name, kind: row.kind },
          });
          return roomView(row);
        }),
      );
    },

    /**
     * Reads one room.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param roomId - Room id.
     * @returns The room.
     */
    async getRoom(tenant: TenantContext, houseId: string, roomId: string): Promise<Room> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.findRoom(tx, { familyId: tenant.familyId, houseId, roomId });
        if (row === null) {
          throw new ProblemError('not_found');
        }
        return roomView(row);
      });
    },

    /**
     * Updates a room.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param roomId - Room id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Validated body.
     * @returns The room.
     */
    async updateRoom(
      tenant: TenantContext,
      houseId: string,
      roomId: string,
      expectedVersion: number,
      patch: UpdateRoomRequest,
    ): Promise<Room> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findRoom(tx, { familyId: tenant.familyId, houseId, roomId });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const updated = await repo.updateRoom(
            tx,
            { familyId: tenant.familyId, houseId, roomId, expectedVersion },
            {
              ...(patch.name === undefined ? {} : { name: patch.name }),
              ...(patch.kind === undefined ? {} : { kind: patch.kind }),
              ...(patch.floor === undefined ? {} : { floor: patch.floor }),
              ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }),
              ...(patch.notes === undefined ? {} : { notes: patch.notes }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await repo.upsertSearchIndex(tx, {
            resourceType: 'rooms',
            resourceId: updated.id,
            familyId: tenant.familyId,
            houseId,
            title: updated.name,
            body: roomSearchBody(updated),
            tags: [],
          });
          await trace(tx, tenant, {
            action: 'inventory.room.updated',
            resourceType: 'rooms',
            resourceId: roomId,
            version: updated.version,
            op: 'update',
            houseId,
            data: { name: updated.name, kind: updated.kind },
          });
          return roomView(updated);
        }),
      );
    },

    /**
     * Moves a room to the trash.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param roomId - Room id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deleteRoom(
      tenant: TenantContext,
      houseId: string,
      roomId: string,
      expectedVersion: number,
    ): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findRoom(tx, { familyId: tenant.familyId, houseId, roomId });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const deleted = await repo.updateRoom(
            tx,
            { familyId: tenant.familyId, houseId, roomId, expectedVersion },
            { deletedAt: now(), updatedBy: tenant.accountId },
          );
          if (deleted === null) {
            conflict(current.version);
          }
          await repo.deleteSearchIndex(tx, 'rooms', roomId);
          await trace(tx, tenant, {
            action: 'inventory.room.deleted',
            resourceType: 'rooms',
            resourceId: roomId,
            version: deleted.version,
            op: 'delete',
            houseId,
            data: { name: deleted.name, deletedAt: deleted.deletedAt?.toISOString() ?? null },
          });
        }),
      );
    },

    /**
     * Lists storage units of one house.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param page - Limit, cursor and optional room filter.
     * @returns One page.
     */
    async listStorageUnits(
      tenant: TenantContext,
      houseId: string,
      page: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly roomId?: string;
      },
    ): Promise<Page<StorageUnit>> {
      return inFamily(tenant, async (tx) => {
        await requireHouse(tx, tenant.familyId, houseId);
        const rows = await repo.listStorageUnits(tx, {
          familyId: tenant.familyId,
          houseId,
          limit: page.limit,
          after: page.after,
          ...(page.roomId === undefined ? {} : { roomId: page.roomId }),
        });
        return pageOf(rows, page.limit, storageView);
      });
    },

    /**
     * Creates a storage unit under a room.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param input - Validated body.
     * @returns The unit.
     */
    async createStorageUnit(
      tenant: TenantContext,
      houseId: string,
      input: CreateStorageUnitRequest,
    ): Promise<StorageUnit> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          await requireHouse(tx, tenant.familyId, houseId);
          const room = await repo.findRoom(tx, {
            familyId: tenant.familyId,
            houseId,
            roomId: input.roomId,
          });
          if (room === null) {
            throw new ProblemError('not_found');
          }
          if (input.parentId !== undefined && input.parentId !== null) {
            const parent = await repo.findStorageUnit(tx, {
              familyId: tenant.familyId,
              houseId,
              unitId: input.parentId,
            });
            if (parent?.roomId !== input.roomId) {
              throw new ProblemError('validation_failed', {
                detail: 'The parent storage unit must exist in the same room',
              });
            }
          }
          const row = await repo.insertStorageUnit(tx, {
            familyId: tenant.familyId,
            houseId,
            roomId: input.roomId,
            parentId: input.parentId ?? null,
            kind: input.kind,
            name: input.name,
            notes: input.notes ?? null,
            sortOrder: input.sortOrder,
            createdBy: tenant.accountId,
          });
          await repo.upsertSearchIndex(tx, {
            resourceType: 'storage_units',
            resourceId: row.id,
            familyId: tenant.familyId,
            houseId,
            title: row.name,
            body: storageSearchBody(row),
            tags: [],
          });
          await trace(tx, tenant, {
            action: 'inventory.storage.created',
            resourceType: 'storage_units',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            houseId,
            data: { name: row.name, kind: row.kind, roomId: row.roomId, parentId: row.parentId },
          });
          return storageView(row);
        }),
      );
    },

    /**
     * Reads one storage unit.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param unitId - Unit id.
     * @returns The unit.
     */
    async getStorageUnit(tenant: TenantContext, houseId: string, unitId: string): Promise<StorageUnit> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.findStorageUnit(tx, { familyId: tenant.familyId, houseId, unitId });
        if (row === null) {
          throw new ProblemError('not_found');
        }
        return storageView(row);
      });
    },

    /**
     * Updates a storage unit.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param unitId - Unit id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Validated body.
     * @returns The unit.
     */
    async updateStorageUnit(
      tenant: TenantContext,
      houseId: string,
      unitId: string,
      expectedVersion: number,
      patch: UpdateStorageUnitRequest,
    ): Promise<StorageUnit> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findStorageUnit(tx, {
            familyId: tenant.familyId,
            houseId,
            unitId,
          });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const nextRoomId = patch.roomId ?? current.roomId;
          if (patch.roomId !== undefined) {
            const room = await repo.findRoom(tx, {
              familyId: tenant.familyId,
              houseId,
              roomId: patch.roomId,
            });
            if (room === null) {
              throw new ProblemError('not_found');
            }
          }
          if (patch.parentId !== undefined && patch.parentId !== null) {
            if (patch.parentId === unitId) {
              throw new ProblemError('domain_rule_violated', {
                detail: 'A storage unit cannot be its own parent',
              });
            }
            const parent = await repo.findStorageUnit(tx, {
              familyId: tenant.familyId,
              houseId,
              unitId: patch.parentId,
            });
            if (parent?.roomId !== nextRoomId) {
              throw new ProblemError('validation_failed', {
                detail: 'The parent storage unit must exist in the same room',
              });
            }
          }
          const updated = await repo.updateStorageUnit(
            tx,
            { familyId: tenant.familyId, houseId, unitId, expectedVersion },
            {
              ...(patch.roomId === undefined ? {} : { roomId: patch.roomId }),
              ...(patch.parentId === undefined ? {} : { parentId: patch.parentId }),
              ...(patch.kind === undefined ? {} : { kind: patch.kind }),
              ...(patch.name === undefined ? {} : { name: patch.name }),
              ...(patch.notes === undefined ? {} : { notes: patch.notes }),
              ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await repo.upsertSearchIndex(tx, {
            resourceType: 'storage_units',
            resourceId: updated.id,
            familyId: tenant.familyId,
            houseId,
            title: updated.name,
            body: storageSearchBody(updated),
            tags: [],
          });
          await trace(tx, tenant, {
            action: 'inventory.storage.updated',
            resourceType: 'storage_units',
            resourceId: unitId,
            version: updated.version,
            op: 'update',
            houseId,
            data: { name: updated.name, kind: updated.kind, roomId: updated.roomId },
          });
          return storageView(updated);
        }),
      );
    },

    /**
     * Moves a storage unit to the trash.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param unitId - Unit id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deleteStorageUnit(
      tenant: TenantContext,
      houseId: string,
      unitId: string,
      expectedVersion: number,
    ): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findStorageUnit(tx, {
            familyId: tenant.familyId,
            houseId,
            unitId,
          });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const deleted = await repo.updateStorageUnit(
            tx,
            { familyId: tenant.familyId, houseId, unitId, expectedVersion },
            { deletedAt: now(), updatedBy: tenant.accountId },
          );
          if (deleted === null) {
            conflict(current.version);
          }
          await repo.deleteSearchIndex(tx, 'storage_units', unitId);
          await trace(tx, tenant, {
            action: 'inventory.storage.deleted',
            resourceType: 'storage_units',
            resourceId: unitId,
            version: deleted.version,
            op: 'delete',
            houseId,
            data: { name: deleted.name, deletedAt: deleted.deletedAt?.toISOString() ?? null },
          });
        }),
      );
    },

    /**
     * Lists inventory items of one house.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param page - Limit, cursor and optional filters.
     * @returns One page.
     */
    async listItems(
      tenant: TenantContext,
      houseId: string,
      page: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly roomId?: string;
        readonly storageUnitId?: string;
      },
    ): Promise<Page<InventoryItem>> {
      return inFamily(tenant, async (tx) => {
        await requireHouse(tx, tenant.familyId, houseId);
        const rows = await repo.listInventoryItems(tx, {
          familyId: tenant.familyId,
          houseId,
          limit: page.limit,
          after: page.after,
          ...(page.roomId === undefined ? {} : { roomId: page.roomId }),
          ...(page.storageUnitId === undefined ? {} : { storageUnitId: page.storageUnitId }),
        });
        return pageOf(rows, page.limit, itemView);
      });
    },

    /**
     * Creates an inventory item.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param input - Validated body.
     * @returns The item.
     */
    async createItem(
      tenant: TenantContext,
      houseId: string,
      input: CreateInventoryItemRequest,
    ): Promise<InventoryItem> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          await requireHouse(tx, tenant.familyId, houseId);
          const room = await repo.findRoom(tx, {
            familyId: tenant.familyId,
            houseId,
            roomId: input.roomId,
          });
          if (room === null) {
            throw new ProblemError('not_found');
          }
          if (input.storageUnitId !== undefined && input.storageUnitId !== null) {
            const unit = await repo.findStorageUnit(tx, {
              familyId: tenant.familyId,
              houseId,
              unitId: input.storageUnitId,
            });
            if (unit?.roomId !== input.roomId) {
              throw new ProblemError('validation_failed', {
                detail: 'The storage unit must exist in the same room',
              });
            }
          }
          const price = input.purchasePrice ?? null;
          const row = await repo.insertInventoryItem(tx, {
            familyId: tenant.familyId,
            houseId,
            roomId: input.roomId,
            storageUnitId: input.storageUnitId ?? null,
            name: input.name,
            category: input.category ?? null,
            quantity: String(input.quantity),
            unit: input.unit ?? null,
            brand: input.brand ?? null,
            model: input.model ?? null,
            serialNumber: input.serialNumber ?? null,
            barcode: input.barcode ?? null,
            purchaseDate: input.purchaseDate ?? null,
            purchasePriceMinor: price?.amountMinor ?? null,
            currency: price?.currency ?? null,
            warrantyUntil: input.warrantyUntil ?? null,
            warrantyNotes: input.warrantyNotes ?? null,
            tags: input.tags,
            notes: input.notes ?? null,
            photoCaption: input.photoCaption ?? null,
            photoDataUrl: input.photoDataUrl ?? null,
            receiptCaption: input.receiptCaption ?? null,
            receiptDataUrl: input.receiptDataUrl ?? null,
            createdBy: tenant.accountId,
          });
          await repo.upsertSearchIndex(tx, {
            resourceType: 'inventory_items',
            resourceId: row.id,
            familyId: tenant.familyId,
            houseId,
            title: row.name,
            body: itemSearchBody(row),
            tags: row.tags,
          });
          await trace(tx, tenant, {
            action: 'inventory.item.created',
            resourceType: 'inventory_items',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            houseId,
            data: {
              name: row.name,
              roomId: row.roomId,
              storageUnitId: row.storageUnitId,
              tags: row.tags,
            },
          });
          return itemView(row);
        }),
      );
    },

    /**
     * Reads one inventory item.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param itemId - Item id.
     * @returns The item.
     */
    async getItem(tenant: TenantContext, houseId: string, itemId: string): Promise<InventoryItem> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.findInventoryItem(tx, { familyId: tenant.familyId, houseId, itemId });
        if (row === null) {
          throw new ProblemError('not_found');
        }
        return itemView(row);
      });
    },

    /**
     * Updates an inventory item.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param itemId - Item id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Validated body.
     * @returns The item.
     */
    async updateItem(
      tenant: TenantContext,
      houseId: string,
      itemId: string,
      expectedVersion: number,
      patch: UpdateInventoryItemRequest,
    ): Promise<InventoryItem> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findInventoryItem(tx, {
            familyId: tenant.familyId,
            houseId,
            itemId,
          });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const nextRoomId = patch.roomId ?? current.roomId;
          if (patch.roomId !== undefined) {
            const room = await repo.findRoom(tx, {
              familyId: tenant.familyId,
              houseId,
              roomId: patch.roomId,
            });
            if (room === null) {
              throw new ProblemError('not_found');
            }
          }
          const nextStorage = patch.storageUnitId === undefined ? current.storageUnitId : patch.storageUnitId;
          if (nextStorage !== null) {
            const unit = await repo.findStorageUnit(tx, {
              familyId: tenant.familyId,
              houseId,
              unitId: nextStorage,
            });
            if (unit?.roomId !== nextRoomId) {
              throw new ProblemError('validation_failed', {
                detail: 'The storage unit must exist in the same room',
              });
            }
          }
          const pricePatch =
            patch.purchasePrice === undefined
              ? {}
              : patch.purchasePrice === null
                ? { purchasePriceMinor: null, currency: null }
                : {
                    purchasePriceMinor: patch.purchasePrice.amountMinor,
                    currency: patch.purchasePrice.currency,
                  };
          const updated = await repo.updateInventoryItem(
            tx,
            { familyId: tenant.familyId, houseId, itemId, expectedVersion },
            {
              ...(patch.roomId === undefined ? {} : { roomId: patch.roomId }),
              ...(patch.storageUnitId === undefined ? {} : { storageUnitId: patch.storageUnitId }),
              ...(patch.name === undefined ? {} : { name: patch.name }),
              ...(patch.category === undefined ? {} : { category: patch.category }),
              ...(patch.quantity === undefined ? {} : { quantity: String(patch.quantity) }),
              ...(patch.unit === undefined ? {} : { unit: patch.unit }),
              ...(patch.brand === undefined ? {} : { brand: patch.brand }),
              ...(patch.model === undefined ? {} : { model: patch.model }),
              ...(patch.serialNumber === undefined ? {} : { serialNumber: patch.serialNumber }),
              ...(patch.barcode === undefined ? {} : { barcode: patch.barcode }),
              ...(patch.purchaseDate === undefined ? {} : { purchaseDate: patch.purchaseDate }),
              ...pricePatch,
              ...(patch.warrantyUntil === undefined ? {} : { warrantyUntil: patch.warrantyUntil }),
              ...(patch.warrantyNotes === undefined ? {} : { warrantyNotes: patch.warrantyNotes }),
              ...(patch.tags === undefined ? {} : { tags: patch.tags }),
              ...(patch.notes === undefined ? {} : { notes: patch.notes }),
              ...(patch.photoCaption === undefined ? {} : { photoCaption: patch.photoCaption }),
              ...(patch.photoDataUrl === undefined ? {} : { photoDataUrl: patch.photoDataUrl }),
              ...(patch.receiptCaption === undefined ? {} : { receiptCaption: patch.receiptCaption }),
              ...(patch.receiptDataUrl === undefined ? {} : { receiptDataUrl: patch.receiptDataUrl }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await repo.upsertSearchIndex(tx, {
            resourceType: 'inventory_items',
            resourceId: updated.id,
            familyId: tenant.familyId,
            houseId,
            title: updated.name,
            body: itemSearchBody(updated),
            tags: updated.tags,
          });
          await trace(tx, tenant, {
            action: 'inventory.item.updated',
            resourceType: 'inventory_items',
            resourceId: itemId,
            version: updated.version,
            op: 'update',
            houseId,
            data: {
              name: updated.name,
              roomId: updated.roomId,
              storageUnitId: updated.storageUnitId,
              tags: updated.tags,
            },
          });
          return itemView(updated);
        }),
      );
    },

    /**
     * Moves an inventory item to the trash.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param itemId - Item id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deleteItem(
      tenant: TenantContext,
      houseId: string,
      itemId: string,
      expectedVersion: number,
    ): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findInventoryItem(tx, {
            familyId: tenant.familyId,
            houseId,
            itemId,
          });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const deleted = await repo.updateInventoryItem(
            tx,
            { familyId: tenant.familyId, houseId, itemId, expectedVersion },
            { deletedAt: now(), updatedBy: tenant.accountId },
          );
          if (deleted === null) {
            conflict(current.version);
          }
          await repo.deleteSearchIndex(tx, 'inventory_items', itemId);
          await trace(tx, tenant, {
            action: 'inventory.item.deleted',
            resourceType: 'inventory_items',
            resourceId: itemId,
            version: deleted.version,
            op: 'delete',
            houseId,
            data: { name: deleted.name, deletedAt: deleted.deletedAt?.toISOString() ?? null },
          });
        }),
      );
    },

    /**
     * Full-text search over rooms, storage units and inventory items of one house.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param input - Query text, optional tag and limit.
     * @returns Ranked hits.
     */
    async search(
      tenant: TenantContext,
      houseId: string,
      input: { readonly query: string; readonly tag?: string; readonly limit: number },
    ): Promise<InventorySearchResponse> {
      return inFamily(tenant, async (tx) => {
        await requireHouse(tx, tenant.familyId, houseId);
        const items = await repo.searchInventory(tx, {
          familyId: tenant.familyId,
          houseId,
          query: input.query,
          limit: input.limit,
          ...(input.tag === undefined ? {} : { tag: input.tag }),
        });
        return { items: items as InventorySearchHit[] };
      });
    },
  };
}

/** Inventory use-case service. */
export type InventoryService = ReturnType<typeof createInventoryService>;
