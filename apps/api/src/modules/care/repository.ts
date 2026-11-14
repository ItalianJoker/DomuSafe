import {
  handovers,
  houses,
  residentAboutCards,
  residents,
  vitalEntries,
  type Transaction,
} from '@domusafe/db';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

/** Row of `vital_entries`. */
export type VitalEntryRow = typeof vitalEntries.$inferSelect;
/** Row of `resident_about_cards`. */
export type AboutCardRow = typeof residentAboutCards.$inferSelect;
/** Row of `handovers`. */
export type HandoverRow = typeof handovers.$inferSelect;

interface Page {
  readonly limit: number;
  readonly after: readonly [string, string] | null;
}

/**
 * Confirms a resident exists in the family and is visible to the principal.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param residentId - Resident id.
 * @returns The id, or `null`.
 */
export async function findResident(
  tx: Transaction,
  familyId: string,
  residentId: string,
): Promise<{ id: string } | null> {
  const [row] = await tx
    .select({ id: residents.id })
    .from(residents)
    .where(and(eq(residents.familyId, familyId), eq(residents.id, residentId), isNull(residents.deletedAt)));
  return row ?? null;
}

/**
 * Confirms a house exists in the family and is visible to the principal.
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
 * Inserts a vital diary row.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertVitalEntry(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly residentId: string;
    readonly measuredAt: Date;
    readonly systolicMmhg: number | null;
    readonly diastolicMmhg: number | null;
    readonly heartRateBpm: number | null;
    readonly temperatureCelsius: string | null;
    readonly bloodGlucoseMgDl: number | null;
    readonly weightKg: string | null;
    readonly oxygenSaturationPercent: number | null;
    readonly notes: string | null;
    readonly createdBy: string;
  },
): Promise<VitalEntryRow> {
  const [row] = await tx
    .insert(vitalEntries)
    .values({ ...input, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Vital entry insert returned no row');
  }
  return row;
}

/**
 * Lists vital diary rows for one resident, newest measurement first.
 *
 * @param tx - Transaction.
 * @param scope - Family, resident and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listVitalEntries(
  tx: Transaction,
  scope: { readonly familyId: string; readonly residentId: string } & Page,
): Promise<VitalEntryRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${vitalEntries.measuredAt}, ${vitalEntries.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(vitalEntries)
    .where(
      and(
        eq(vitalEntries.familyId, scope.familyId),
        eq(vitalEntries.residentId, scope.residentId),
        isNull(vitalEntries.deletedAt),
        after,
      ),
    )
    .orderBy(desc(vitalEntries.measuredAt), desc(vitalEntries.id))
    .limit(scope.limit + 1);
}

/**
 * Loads one vital diary row.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentId - Resident id.
 * @param entryId - Entry id.
 * @returns The row, or `null`.
 */
export async function getVitalEntry(
  tx: Transaction,
  familyId: string,
  residentId: string,
  entryId: string,
): Promise<VitalEntryRow | null> {
  const [row] = await tx
    .select()
    .from(vitalEntries)
    .where(
      and(
        eq(vitalEntries.familyId, familyId),
        eq(vitalEntries.residentId, residentId),
        eq(vitalEntries.id, entryId),
        isNull(vitalEntries.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates a vital diary row when the version matches.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param entryId - Entry id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to change.
 * @returns The updated row, or `null` when missing or conflicting.
 */
export async function updateVitalEntry(
  tx: Transaction,
  familyId: string,
  entryId: string,
  expectedVersion: number,
  patch: {
    readonly measuredAt?: Date;
    readonly systolicMmhg?: number | null;
    readonly diastolicMmhg?: number | null;
    readonly heartRateBpm?: number | null;
    readonly temperatureCelsius?: string | null;
    readonly bloodGlucoseMgDl?: number | null;
    readonly weightKg?: string | null;
    readonly oxygenSaturationPercent?: number | null;
    readonly notes?: string | null;
    readonly updatedBy: string;
  },
): Promise<VitalEntryRow | null> {
  const [row] = await tx
    .update(vitalEntries)
    .set({
      ...patch,
      version: sql`${vitalEntries.version} + 1`,
    })
    .where(
      and(
        eq(vitalEntries.familyId, familyId),
        eq(vitalEntries.id, entryId),
        eq(vitalEntries.version, expectedVersion),
        isNull(vitalEntries.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes a vital diary row when the version matches.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param entryId - Entry id.
 * @param expectedVersion - Version the client loaded.
 * @param updatedBy - Actor.
 * @returns The deleted row, or `null`.
 */
export async function softDeleteVitalEntry(
  tx: Transaction,
  familyId: string,
  entryId: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<VitalEntryRow | null> {
  const [row] = await tx
    .update(vitalEntries)
    .set({
      deletedAt: sql`now()`,
      updatedBy,
      version: sql`${vitalEntries.version} + 1`,
    })
    .where(
      and(
        eq(vitalEntries.familyId, familyId),
        eq(vitalEntries.id, entryId),
        eq(vitalEntries.version, expectedVersion),
        isNull(vitalEntries.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Loads the «Chi sono» card, or `null` when never written.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentId - Resident id.
 * @returns The card, or `null`.
 */
export async function getAboutCard(
  tx: Transaction,
  familyId: string,
  residentId: string,
): Promise<AboutCardRow | null> {
  const [row] = await tx
    .select()
    .from(residentAboutCards)
    .where(and(eq(residentAboutCards.familyId, familyId), eq(residentAboutCards.residentId, residentId)));
  return row ?? null;
}

/**
 * Inserts or replaces the «Chi sono» card.
 *
 * @param tx - Transaction.
 * @param input - Columns including expected version for updates (`null` on first write).
 * @returns The stored row, or `null` on version conflict.
 */
export async function upsertAboutCard(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly residentId: string;
    readonly preferredName: string | null;
    readonly howToAddress: string | null;
    readonly likes: readonly string[];
    readonly dislikes: readonly string[];
    readonly dailyRoutine: string | null;
    readonly calmingTips: string | null;
    readonly communicationTips: string | null;
    readonly importantNotes: string | null;
    readonly expectedVersion: number;
    readonly actorId: string;
  },
): Promise<AboutCardRow | null> {
  const existing = await getAboutCard(tx, input.familyId, input.residentId);
  if (existing === null) {
    if (input.expectedVersion !== 1) {
      return null;
    }
    const [row] = await tx
      .insert(residentAboutCards)
      .values({
        familyId: input.familyId,
        residentId: input.residentId,
        preferredName: input.preferredName,
        howToAddress: input.howToAddress,
        likes: [...input.likes],
        dislikes: [...input.dislikes],
        dailyRoutine: input.dailyRoutine,
        calmingTips: input.calmingTips,
        communicationTips: input.communicationTips,
        importantNotes: input.importantNotes,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      })
      .returning();
    return row ?? null;
  }
  if (existing.version !== input.expectedVersion) {
    return null;
  }
  const [row] = await tx
    .update(residentAboutCards)
    .set({
      preferredName: input.preferredName,
      howToAddress: input.howToAddress,
      likes: [...input.likes],
      dislikes: [...input.dislikes],
      dailyRoutine: input.dailyRoutine,
      calmingTips: input.calmingTips,
      communicationTips: input.communicationTips,
      importantNotes: input.importantNotes,
      updatedBy: input.actorId,
      version: sql`${residentAboutCards.version} + 1`,
    })
    .where(
      and(
        eq(residentAboutCards.familyId, input.familyId),
        eq(residentAboutCards.residentId, input.residentId),
        eq(residentAboutCards.version, input.expectedVersion),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a handover note.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertHandover(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly houseId: string | null;
    readonly residentId: string | null;
    readonly audience: HandoverRow['audience'];
    readonly body: string;
    readonly postedAt: Date;
    readonly createdBy: string;
  },
): Promise<HandoverRow> {
  const [row] = await tx
    .insert(handovers)
    .values({ ...input, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Handover insert returned no row');
  }
  return row;
}

/**
 * Lists handover notes, newest first.
 *
 * @param tx - Transaction.
 * @param scope - Family, optional filters and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listHandovers(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly houseId: string | null;
    readonly residentId: string | null;
    readonly audience: HandoverRow['audience'] | null;
  } & Page,
): Promise<HandoverRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${handovers.postedAt}, ${handovers.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(handovers)
    .where(
      and(
        eq(handovers.familyId, scope.familyId),
        scope.houseId === null ? undefined : eq(handovers.houseId, scope.houseId),
        scope.residentId === null ? undefined : eq(handovers.residentId, scope.residentId),
        scope.audience === null ? undefined : eq(handovers.audience, scope.audience),
        isNull(handovers.deletedAt),
        after,
      ),
    )
    .orderBy(desc(handovers.postedAt), desc(handovers.id))
    .limit(scope.limit + 1);
}

/**
 * Loads one handover note.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param handoverId - Handover id.
 * @returns The row, or `null`.
 */
export async function getHandover(
  tx: Transaction,
  familyId: string,
  handoverId: string,
): Promise<HandoverRow | null> {
  const [row] = await tx
    .select()
    .from(handovers)
    .where(and(eq(handovers.familyId, familyId), eq(handovers.id, handoverId), isNull(handovers.deletedAt)));
  return row ?? null;
}

/**
 * Updates a handover note when the version matches.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param handoverId - Handover id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to change.
 * @returns The updated row, or `null`.
 */
export async function updateHandover(
  tx: Transaction,
  familyId: string,
  handoverId: string,
  expectedVersion: number,
  patch: {
    readonly body?: string;
    readonly audience?: HandoverRow['audience'];
    readonly houseId?: string | null;
    readonly residentId?: string | null;
    readonly updatedBy: string;
  },
): Promise<HandoverRow | null> {
  const [row] = await tx
    .update(handovers)
    .set({
      ...patch,
      version: sql`${handovers.version} + 1`,
    })
    .where(
      and(
        eq(handovers.familyId, familyId),
        eq(handovers.id, handoverId),
        eq(handovers.version, expectedVersion),
        isNull(handovers.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Marks a handover as read when it is still open.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param handoverId - Handover id.
 * @param expectedVersion - Version the client loaded.
 * @param actorId - Who acknowledges.
 * @returns The updated row, or `null`.
 */
export async function acknowledgeHandover(
  tx: Transaction,
  familyId: string,
  handoverId: string,
  expectedVersion: number,
  actorId: string,
): Promise<HandoverRow | null> {
  const [row] = await tx
    .update(handovers)
    .set({
      acknowledgedAt: sql`now()`,
      acknowledgedBy: actorId,
      updatedBy: actorId,
      version: sql`${handovers.version} + 1`,
    })
    .where(
      and(
        eq(handovers.familyId, familyId),
        eq(handovers.id, handoverId),
        eq(handovers.version, expectedVersion),
        isNull(handovers.deletedAt),
        isNull(handovers.acknowledgedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes a handover when the version matches.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param handoverId - Handover id.
 * @param expectedVersion - Version the client loaded.
 * @param updatedBy - Actor.
 * @returns The deleted row, or `null`.
 */
export async function softDeleteHandover(
  tx: Transaction,
  familyId: string,
  handoverId: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<HandoverRow | null> {
  const [row] = await tx
    .update(handovers)
    .set({
      deletedAt: sql`now()`,
      updatedBy,
      version: sql`${handovers.version} + 1`,
    })
    .where(
      and(
        eq(handovers.familyId, familyId),
        eq(handovers.id, handoverId),
        eq(handovers.version, expectedVersion),
        isNull(handovers.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}
