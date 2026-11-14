import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import {
  haConnections,
  haDevices,
  haEvents,
  haLockCodes,
  haZones,
  type Database,
  type Transaction,
} from '@domusafe/db';
import type { HaDeviceKind, HaEventKind, HaZoneAlarmState } from '@domusafe/contracts';

type Db = Database | Transaction;

/** Row of `ha_connections`. */
export type HaConnectionRow = typeof haConnections.$inferSelect;
/** Row of `ha_devices`. */
export type HaDeviceRow = typeof haDevices.$inferSelect;
/** Row of `ha_zones`. */
export type HaZoneRow = typeof haZones.$inferSelect;
/** Row of `ha_events`. */
export type HaEventRow = typeof haEvents.$inferSelect;
/** Row of `ha_lock_codes`. */
export type HaLockCodeRow = typeof haLockCodes.$inferSelect;

/**
 * Lists connections of a house, newest first.
 *
 * @param db - Tenant-scoped transaction or database.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param limit - Page size plus one.
 * @param cursor - Optional createdAt/id cursor.
 * @returns Connection rows including sealed columns.
 */
export async function listConnections(
  db: Db,
  familyId: string,
  houseId: string,
  limit: number,
  after: readonly [string, string] | null,
): Promise<HaConnectionRow[]> {
  const afterClause =
    after === null
      ? undefined
      : sql`(${haConnections.createdAt}, ${haConnections.id}) < (${after[0]}::timestamptz, ${after[1]})`;
  return db
    .select()
    .from(haConnections)
    .where(
      and(
        eq(haConnections.familyId, familyId),
        eq(haConnections.houseId, houseId),
        isNull(haConnections.deletedAt),
        afterClause,
      ),
    )
    .orderBy(desc(haConnections.createdAt), desc(haConnections.id))
    .limit(limit);
}

/**
 * Loads one connection of a house.
 *
 * @param db - Tenant-scoped transaction or database.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param connectionId - Connection id.
 * @returns The row, or undefined.
 */
export async function getConnection(
  db: Db,
  familyId: string,
  houseId: string,
  connectionId: string,
): Promise<HaConnectionRow | undefined> {
  const rows = await db
    .select()
    .from(haConnections)
    .where(
      and(
        eq(haConnections.familyId, familyId),
        eq(haConnections.houseId, houseId),
        eq(haConnections.id, connectionId),
        isNull(haConnections.deletedAt),
      ),
    )
    .limit(1);
  return rows[0];
}

/** Identity of a connection resolved without a family session (webhook bootstrap). */
export interface ConnectionIdentity {
  readonly id: string;
  readonly familyId: string;
  readonly houseId: string;
  readonly status: HaConnectionRow['status'];
  readonly deletedAt: Date | null;
}

/**
 * Resolves a connection id without a family session via `app.ha_connection_by_id`.
 *
 * Preconditions: the caller will switch family context before reading sealed columns.
 * Postconditions: returns null when the id is unknown.
 * Data contract: identity and status only; no sealed secrets.
 *
 * @param tx - Transaction. Family context is not required.
 * @param connectionId - Connection id from the webhook address.
 * @returns The identity, or null.
 */
export async function findConnectionIdentity(
  tx: Transaction,
  connectionId: string,
): Promise<ConnectionIdentity | null> {
  const result = await tx.execute<{
    id: string;
    family_id: string;
    house_id: string;
    status: HaConnectionRow['status'];
    deleted_at: Date | string | null;
  }>(
    sql`select id, family_id, house_id, status, deleted_at from app.ha_connection_by_id(${connectionId}::uuid)`,
  );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    familyId: row.family_id,
    houseId: row.house_id,
    status: row.status,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
  };
}

/** Fields accepted when inserting a connection. */
export interface InsertConnectionInput {
  readonly familyId: string;
  readonly houseId: string;
  readonly kind: HaConnectionRow['kind'];
  readonly name: string;
  readonly baseUrl: string | null;
  readonly mqttUrl: string | null;
  readonly mqttTopicPrefix: string | null;
  readonly mqttUsername: string | null;
  readonly credentialsSealed: Uint8Array<ArrayBuffer> | null;
  readonly inboundSecretCurrentSealed: Uint8Array<ArrayBuffer> | null;
  readonly accountId: string;
}

/**
 * Inserts a connection.
 *
 * @param db - Tenant-scoped transaction.
 * @param input - Row fields.
 * @returns The inserted row.
 */
export async function insertConnection(db: Db, input: InsertConnectionInput): Promise<HaConnectionRow> {
  const rows = await db
    .insert(haConnections)
    .values({
      familyId: input.familyId,
      houseId: input.houseId,
      kind: input.kind,
      name: input.name,
      baseUrl: input.baseUrl,
      mqttUrl: input.mqttUrl,
      mqttTopicPrefix: input.mqttTopicPrefix,
      mqttUsername: input.mqttUsername,
      credentialsSealed: input.credentialsSealed,
      inboundSecretCurrentSealed: input.inboundSecretCurrentSealed,
      createdBy: input.accountId,
      updatedBy: input.accountId,
    })
    .returning();
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Insert returned no row');
  }
  return row;
}

/** Patch fields for a connection update. */
export interface UpdateConnectionInput {
  readonly name?: string;
  readonly baseUrl?: string | null;
  readonly mqttUrl?: string | null;
  readonly mqttTopicPrefix?: string | null;
  readonly mqttUsername?: string | null;
  readonly credentialsSealed?: Uint8Array<ArrayBuffer> | null;
  readonly inboundSecretCurrentSealed?: Uint8Array<ArrayBuffer> | null;
  readonly inboundSecretPreviousSealed?: Uint8Array<ArrayBuffer> | null;
  readonly secretRotatedAt?: Date | null;
  readonly status?: HaConnectionRow['status'];
  readonly lastEventAt?: Date | null;
  readonly lastCheckedAt?: Date | null;
  readonly lastErrorCode?: string | null;
  readonly accountId: string | null;
  readonly expectedVersion: number;
}

/**
 * Updates a connection when the version matches.
 *
 * @param db - Tenant-scoped transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param connectionId - Connection id.
 * @param input - Patch and expected version.
 * @returns The updated row, or undefined on version conflict.
 */
export async function updateConnection(
  db: Db,
  familyId: string,
  houseId: string,
  connectionId: string,
  input: UpdateConnectionInput,
): Promise<HaConnectionRow | undefined> {
  const patch: Record<string, unknown> = {
    version: sql`${haConnections.version} + 1`,
    updatedBy: input.accountId,
  };
  if (input.name !== undefined) {
    patch.name = input.name;
  }
  if (input.baseUrl !== undefined) {
    patch.baseUrl = input.baseUrl;
  }
  if (input.mqttUrl !== undefined) {
    patch.mqttUrl = input.mqttUrl;
  }
  if (input.mqttTopicPrefix !== undefined) {
    patch.mqttTopicPrefix = input.mqttTopicPrefix;
  }
  if (input.mqttUsername !== undefined) {
    patch.mqttUsername = input.mqttUsername;
  }
  if (input.credentialsSealed !== undefined) {
    patch.credentialsSealed = input.credentialsSealed;
  }
  if (input.inboundSecretCurrentSealed !== undefined) {
    patch.inboundSecretCurrentSealed = input.inboundSecretCurrentSealed;
  }
  if (input.inboundSecretPreviousSealed !== undefined) {
    patch.inboundSecretPreviousSealed = input.inboundSecretPreviousSealed;
  }
  if (input.secretRotatedAt !== undefined) {
    patch.secretRotatedAt = input.secretRotatedAt;
  }
  if (input.status !== undefined) {
    patch.status = input.status;
  }
  if (input.lastEventAt !== undefined) {
    patch.lastEventAt = input.lastEventAt;
  }
  if (input.lastCheckedAt !== undefined) {
    patch.lastCheckedAt = input.lastCheckedAt;
  }
  if (input.lastErrorCode !== undefined) {
    patch.lastErrorCode = input.lastErrorCode;
  }
  const rows = await db
    .update(haConnections)
    .set(patch)
    .where(
      and(
        eq(haConnections.familyId, familyId),
        eq(haConnections.houseId, houseId),
        eq(haConnections.id, connectionId),
        eq(haConnections.version, input.expectedVersion),
        isNull(haConnections.deletedAt),
      ),
    )
    .returning();
  return rows[0];
}

/**
 * Soft-deletes a connection.
 *
 * @param db - Tenant-scoped transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param connectionId - Connection id.
 * @param expectedVersion - Expected version.
 * @param accountId - Actor.
 * @returns The deleted row, or undefined on conflict.
 */
export async function softDeleteConnection(
  db: Db,
  familyId: string,
  houseId: string,
  connectionId: string,
  expectedVersion: number,
  accountId: string,
): Promise<HaConnectionRow | undefined> {
  const rows = await db
    .update(haConnections)
    .set({
      deletedAt: new Date(),
      version: sql`${haConnections.version} + 1`,
      updatedBy: accountId,
    })
    .where(
      and(
        eq(haConnections.familyId, familyId),
        eq(haConnections.houseId, houseId),
        eq(haConnections.id, connectionId),
        eq(haConnections.version, expectedVersion),
        isNull(haConnections.deletedAt),
      ),
    )
    .returning();
  return rows[0];
}

/**
 * Lists devices of a house.
 *
 * @param db - Tenant-scoped transaction or database.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param limit - Page size plus one.
 * @param cursor - Optional cursor.
 * @param kind - Optional kind filter.
 * @returns Device rows.
 */
export async function listDevices(
  db: Db,
  familyId: string,
  houseId: string,
  limit: number,
  after: readonly [string, string] | null,
  kind: HaDeviceKind | null,
): Promise<HaDeviceRow[]> {
  const afterClause =
    after === null
      ? undefined
      : sql`(${haDevices.createdAt}, ${haDevices.id}) < (${after[0]}::timestamptz, ${after[1]})`;
  return db
    .select()
    .from(haDevices)
    .where(
      and(
        eq(haDevices.familyId, familyId),
        eq(haDevices.houseId, houseId),
        isNull(haDevices.deletedAt),
        kind === null ? undefined : eq(haDevices.kind, kind),
        afterClause,
      ),
    )
    .orderBy(desc(haDevices.createdAt), desc(haDevices.id))
    .limit(limit);
}

/**
 * Loads one device.
 *
 * @param db - Tenant-scoped transaction or database.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param deviceId - Device id.
 * @returns The row, or undefined.
 */
export async function getDevice(
  db: Db,
  familyId: string,
  houseId: string,
  deviceId: string,
): Promise<HaDeviceRow | undefined> {
  const rows = await db
    .select()
    .from(haDevices)
    .where(
      and(
        eq(haDevices.familyId, familyId),
        eq(haDevices.houseId, houseId),
        eq(haDevices.id, deviceId),
        isNull(haDevices.deletedAt),
      ),
    )
    .limit(1);
  return rows[0];
}

/** Upsert payload for a synced entity. */
export interface UpsertDeviceInput {
  readonly familyId: string;
  readonly houseId: string;
  readonly connectionId: string;
  readonly externalId: string;
  readonly kind: HaDeviceKind;
  readonly name: string;
  readonly unit: string | null;
  readonly lastValue: number | null;
  readonly lastState: string | null;
  readonly lastSeenAt: Date;
  readonly accountId: string | null;
}

/**
 * Inserts or updates a device keyed by connection and external id.
 *
 * @param db - Tenant-scoped transaction.
 * @param input - Entity snapshot fields.
 * @returns The upserted row.
 */
export async function upsertDevice(db: Db, input: UpsertDeviceInput): Promise<HaDeviceRow> {
  const existing = await db
    .select()
    .from(haDevices)
    .where(
      and(
        eq(haDevices.connectionId, input.connectionId),
        eq(haDevices.externalId, input.externalId),
        isNull(haDevices.deletedAt),
      ),
    )
    .limit(1);
  const current = existing[0];
  if (current === undefined) {
    const rows = await db
      .insert(haDevices)
      .values({
        familyId: input.familyId,
        houseId: input.houseId,
        connectionId: input.connectionId,
        externalId: input.externalId,
        kind: input.kind,
        name: input.name,
        unit: input.unit,
        lastValue: input.lastValue,
        lastState: input.lastState,
        lastSeenAt: input.lastSeenAt,
        createdBy: input.accountId,
        updatedBy: input.accountId,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Update returned no row');
    }
    return row;
  }
  const rows = await db
    .update(haDevices)
    .set({
      kind: input.kind,
      name: input.name,
      unit: input.unit,
      lastValue: input.lastValue,
      lastState: input.lastState,
      lastSeenAt: input.lastSeenAt,
      version: sql`${haDevices.version} + 1`,
      updatedBy: input.accountId,
    })
    .where(and(eq(haDevices.familyId, input.familyId), eq(haDevices.id, current.id)))
    .returning();
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Insert returned no row');
  }
  return row;
}

/**
 * Updates device metadata (name, room, zone).
 *
 * @param db - Tenant-scoped transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param deviceId - Device id.
 * @param expectedVersion - Expected version.
 * @param accountId - Actor.
 * @param patch - Fields to change.
 * @returns The updated row, or undefined on conflict.
 */
export async function updateDevice(
  db: Db,
  familyId: string,
  houseId: string,
  deviceId: string,
  expectedVersion: number,
  accountId: string,
  patch: { name?: string; zoneId?: string | null; roomId?: string | null },
): Promise<HaDeviceRow | undefined> {
  const set: Record<string, unknown> = {
    version: sql`${haDevices.version} + 1`,
    updatedBy: accountId,
  };
  if (patch.name !== undefined) {
    set.name = patch.name;
  }
  if (patch.zoneId !== undefined) {
    set.zoneId = patch.zoneId;
  }
  if (patch.roomId !== undefined) {
    set.roomId = patch.roomId;
  }
  const rows = await db
    .update(haDevices)
    .set(set)
    .where(
      and(
        eq(haDevices.familyId, familyId),
        eq(haDevices.houseId, houseId),
        eq(haDevices.id, deviceId),
        eq(haDevices.version, expectedVersion),
        isNull(haDevices.deletedAt),
      ),
    )
    .returning();
  return rows[0];
}

/**
 * Lists zones of a house.
 *
 * @param db - Tenant-scoped transaction or database.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param limit - Page size plus one.
 * @param cursor - Optional cursor.
 * @returns Zone rows.
 */
export async function listZones(
  db: Db,
  familyId: string,
  houseId: string,
  limit: number,
  after: readonly [string, string] | null,
): Promise<HaZoneRow[]> {
  const afterClause =
    after === null
      ? undefined
      : sql`(${haZones.createdAt}, ${haZones.id}) < (${after[0]}::timestamptz, ${after[1]})`;
  return db
    .select()
    .from(haZones)
    .where(
      and(
        eq(haZones.familyId, familyId),
        eq(haZones.houseId, houseId),
        isNull(haZones.deletedAt),
        afterClause,
      ),
    )
    .orderBy(desc(haZones.createdAt), desc(haZones.id))
    .limit(limit);
}

/**
 * Loads one zone.
 *
 * @param db - Tenant-scoped transaction or database.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param zoneId - Zone id.
 * @returns The row, or undefined.
 */
export async function getZone(
  db: Db,
  familyId: string,
  houseId: string,
  zoneId: string,
): Promise<HaZoneRow | undefined> {
  const rows = await db
    .select()
    .from(haZones)
    .where(
      and(
        eq(haZones.familyId, familyId),
        eq(haZones.houseId, houseId),
        eq(haZones.id, zoneId),
        isNull(haZones.deletedAt),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Inserts a zone.
 *
 * @param db - Tenant-scoped transaction.
 * @param input - Zone fields.
 * @returns The inserted row.
 */
export async function insertZone(
  db: Db,
  input: {
    readonly familyId: string;
    readonly houseId: string;
    readonly name: string;
    readonly externalId: string | null;
    readonly accountId: string;
  },
): Promise<HaZoneRow> {
  const rows = await db
    .insert(haZones)
    .values({
      familyId: input.familyId,
      houseId: input.houseId,
      name: input.name,
      externalId: input.externalId,
      createdBy: input.accountId,
      updatedBy: input.accountId,
    })
    .returning();
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Insert returned no row');
  }
  return row;
}

/**
 * Updates a zone.
 *
 * @param db - Tenant-scoped transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param zoneId - Zone id.
 * @param expectedVersion - Expected version.
 * @param accountId - Actor.
 * @param patch - Fields to change.
 * @returns The updated row, or undefined on conflict.
 */
export async function updateZone(
  db: Db,
  familyId: string,
  houseId: string,
  zoneId: string,
  expectedVersion: number,
  accountId: string,
  patch: { name?: string; externalId?: string | null; alarmState?: HaZoneAlarmState },
): Promise<HaZoneRow | undefined> {
  const set: Record<string, unknown> = {
    version: sql`${haZones.version} + 1`,
    updatedBy: accountId,
  };
  if (patch.name !== undefined) {
    set.name = patch.name;
  }
  if (patch.externalId !== undefined) {
    set.externalId = patch.externalId;
  }
  if (patch.alarmState !== undefined) {
    set.alarmState = patch.alarmState;
  }
  const rows = await db
    .update(haZones)
    .set(set)
    .where(
      and(
        eq(haZones.familyId, familyId),
        eq(haZones.houseId, houseId),
        eq(haZones.id, zoneId),
        eq(haZones.version, expectedVersion),
        isNull(haZones.deletedAt),
      ),
    )
    .returning();
  return rows[0];
}

/**
 * Soft-deletes a zone.
 *
 * @param db - Tenant-scoped transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param zoneId - Zone id.
 * @param expectedVersion - Expected version.
 * @param accountId - Actor.
 * @returns The deleted row, or undefined on conflict.
 */
export async function softDeleteZone(
  db: Db,
  familyId: string,
  houseId: string,
  zoneId: string,
  expectedVersion: number,
  accountId: string,
): Promise<HaZoneRow | undefined> {
  const rows = await db
    .update(haZones)
    .set({
      deletedAt: new Date(),
      version: sql`${haZones.version} + 1`,
      updatedBy: accountId,
    })
    .where(
      and(
        eq(haZones.familyId, familyId),
        eq(haZones.houseId, houseId),
        eq(haZones.id, zoneId),
        eq(haZones.version, expectedVersion),
        isNull(haZones.deletedAt),
      ),
    )
    .returning();
  return rows[0];
}

/**
 * Lists recent events of a house.
 *
 * @param db - Tenant-scoped transaction or database.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param limit - Page size plus one.
 * @param cursor - Optional occurredAt/id cursor.
 * @returns Event rows.
 */
export async function listEvents(
  db: Db,
  familyId: string,
  houseId: string,
  limit: number,
  after: readonly [string, string] | null,
): Promise<HaEventRow[]> {
  const afterClause =
    after === null
      ? undefined
      : sql`(${haEvents.occurredAt}, ${haEvents.id}) < (${after[0]}::timestamptz, ${after[1]})`;
  return db
    .select()
    .from(haEvents)
    .where(and(eq(haEvents.familyId, familyId), eq(haEvents.houseId, houseId), afterClause))
    .orderBy(desc(haEvents.occurredAt), desc(haEvents.id))
    .limit(limit);
}

/**
 * Inserts an event.
 *
 * @param db - Tenant-scoped transaction.
 * @param input - Event fields.
 * @returns The inserted row.
 */
export async function insertEvent(
  db: Db,
  input: {
    readonly familyId: string;
    readonly houseId: string;
    readonly deviceId: string | null;
    readonly occurredAt: Date;
    readonly kind: HaEventKind;
    readonly state: Record<string, unknown>;
  },
): Promise<HaEventRow> {
  const rows = await db
    .insert(haEvents)
    .values({
      familyId: input.familyId,
      houseId: input.houseId,
      deviceId: input.deviceId,
      occurredAt: input.occurredAt,
      kind: input.kind,
      state: input.state,
    })
    .returning();
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Insert returned no row');
  }
  return row;
}

/**
 * Lists lock codes of a house.
 *
 * @param db - Tenant-scoped transaction or database.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param limit - Page size plus one.
 * @param cursor - Optional cursor.
 * @returns Lock code rows.
 */
export async function listLockCodes(
  db: Db,
  familyId: string,
  houseId: string,
  limit: number,
  after: readonly [string, string] | null,
): Promise<HaLockCodeRow[]> {
  const afterClause =
    after === null
      ? undefined
      : sql`(${haLockCodes.createdAt}, ${haLockCodes.id}) < (${after[0]}::timestamptz, ${after[1]})`;
  return db
    .select()
    .from(haLockCodes)
    .where(
      and(
        eq(haLockCodes.familyId, familyId),
        eq(haLockCodes.houseId, houseId),
        isNull(haLockCodes.deletedAt),
        afterClause,
      ),
    )
    .orderBy(desc(haLockCodes.createdAt), desc(haLockCodes.id))
    .limit(limit);
}

/**
 * Inserts a lock code metadata row.
 *
 * @param db - Tenant-scoped transaction.
 * @param input - Lock code fields.
 * @returns The inserted row.
 */
export async function insertLockCode(
  db: Db,
  input: {
    readonly familyId: string;
    readonly houseId: string;
    readonly deviceId: string;
    readonly label: string;
    readonly validFrom: Date;
    readonly validUntil: Date;
    readonly codeSuffix: string;
    readonly externalSlot: string | null;
    readonly accountId: string;
  },
): Promise<HaLockCodeRow> {
  const rows = await db
    .insert(haLockCodes)
    .values({
      familyId: input.familyId,
      houseId: input.houseId,
      deviceId: input.deviceId,
      label: input.label,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      codeSuffix: input.codeSuffix,
      externalSlot: input.externalSlot,
      createdBy: input.accountId,
      updatedBy: input.accountId,
    })
    .returning();
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Insert returned no row');
  }
  return row;
}

/**
 * Soft-revokes a lock code.
 *
 * @param db - Tenant-scoped transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param lockCodeId - Lock code id.
 * @param expectedVersion - Expected version.
 * @param accountId - Actor.
 * @returns The updated row, or undefined on conflict.
 */
export async function revokeLockCode(
  db: Db,
  familyId: string,
  houseId: string,
  lockCodeId: string,
  expectedVersion: number,
  accountId: string,
): Promise<HaLockCodeRow | undefined> {
  const rows = await db
    .update(haLockCodes)
    .set({
      status: 'revoked',
      version: sql`${haLockCodes.version} + 1`,
      updatedBy: accountId,
    })
    .where(
      and(
        eq(haLockCodes.familyId, familyId),
        eq(haLockCodes.houseId, houseId),
        eq(haLockCodes.id, lockCodeId),
        eq(haLockCodes.version, expectedVersion),
        isNull(haLockCodes.deletedAt),
      ),
    )
    .returning();
  return rows[0];
}

/**
 * Marks expired active lock codes for a house.
 *
 * @param db - Tenant-scoped transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param now - Current instant.
 */
export async function expireLockCodes(db: Db, familyId: string, houseId: string, now: Date): Promise<void> {
  await db
    .update(haLockCodes)
    .set({ status: 'expired', version: sql`${haLockCodes.version} + 1` })
    .where(
      and(
        eq(haLockCodes.familyId, familyId),
        eq(haLockCodes.houseId, houseId),
        eq(haLockCodes.status, 'active'),
        lt(haLockCodes.validUntil, now),
        isNull(haLockCodes.deletedAt),
      ),
    );
}
