import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { successionItems, type Transaction } from '@domusafe/db';
import type { StandardSuccessionKind } from '@domusafe/contracts';

/** A succession activity row. */
export type SuccessionRow = typeof successionItems.$inferSelect;

/**
 * Lists the active succession activities of a family, in checklist order.
 *
 * @param tx - Transaction in the family.
 * @param familyId - Family id.
 * @returns The rows that are not in the trash.
 */
export async function listItems(tx: Transaction, familyId: string): Promise<SuccessionRow[]> {
  return tx
    .select()
    .from(successionItems)
    .where(and(eq(successionItems.familyId, familyId), isNull(successionItems.deletedAt)))
    .orderBy(asc(successionItems.sortOrder), asc(successionItems.id));
}

/**
 * Reads one activity, including a trashed row.
 *
 * @param tx - Transaction in the family.
 * @param familyId - Family id.
 * @param itemId - Activity id.
 * @returns The row, or `null`.
 */
export async function findItem(
  tx: Transaction,
  familyId: string,
  itemId: string,
): Promise<SuccessionRow | null> {
  const [row] = await tx
    .select()
    .from(successionItems)
    .where(and(eq(successionItems.familyId, familyId), eq(successionItems.id, itemId)));
  return row ?? null;
}

/**
 * Inserts the standard activities that are not already active.
 *
 * Preconditions: `kinds` is a subset of the standard catalogue.
 * Postconditions: a kind that is already active is left as it is.
 *
 * @param tx - Transaction in the family.
 * @param input - Family, missing kinds and the actor.
 */
export async function insertStandard(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly kinds: readonly StandardSuccessionKind[];
    readonly createdBy: string;
  },
): Promise<void> {
  if (input.kinds.length === 0) {
    return;
  }
  await tx
    .insert(successionItems)
    .values(
      input.kinds.map((kind) => ({
        familyId: input.familyId,
        kind,
        sortOrder: standardSort(kind),
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      })),
    )
    .onConflictDoNothing();
}

/**
 * Inserts one custom activity.
 *
 * @param tx - Transaction in the family.
 * @param input - Title, optional notes and the actor.
 * @returns The new row.
 */
export async function insertCustom(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly title: string;
    readonly notes: string | null;
    readonly deadlineNote: string | null;
    readonly sortOrder: number;
    readonly createdBy: string;
  },
): Promise<SuccessionRow> {
  const [row] = await tx
    .insert(successionItems)
    .values({
      familyId: input.familyId,
      kind: 'custom',
      title: input.title,
      notes: input.notes,
      deadlineNote: input.deadlineNote,
      sortOrder: input.sortOrder,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Succession activity missing after insert');
  }
  return row;
}

/** Columns a patch may change. Undefined leaves the column as it is. */
export interface SuccessionPatch {
  readonly title?: string | null;
  readonly notes?: string | null;
  readonly deadlineNote?: string | null;
  readonly done?: boolean;
  readonly completedAt?: Date | null;
  readonly updatedBy: string;
}

/**
 * Updates one activity when the version matches.
 *
 * @param tx - Transaction in the family.
 * @param scope - Family, activity and expected version.
 * @param patch - Columns to write.
 * @returns The row, or `null` when the version does not match.
 */
export async function updateItem(
  tx: Transaction,
  scope: { readonly familyId: string; readonly itemId: string; readonly expectedVersion: number },
  patch: SuccessionPatch,
): Promise<SuccessionRow | null> {
  const [row] = await tx
    .update(successionItems)
    .set({ ...patch, version: sql`${successionItems.version} + 1` })
    .where(
      and(
        eq(successionItems.familyId, scope.familyId),
        eq(successionItems.id, scope.itemId),
        eq(successionItems.version, scope.expectedVersion),
        isNull(successionItems.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Moves one activity to the trash when the version matches.
 *
 * @param tx - Transaction in the family.
 * @param scope - Family, activity, expected version and actor.
 * @returns The row, or `null` when the version does not match.
 */
export async function trashItem(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly itemId: string;
    readonly expectedVersion: number;
    readonly updatedBy: string;
  },
): Promise<SuccessionRow | null> {
  const [row] = await tx
    .update(successionItems)
    .set({
      deletedAt: new Date(),
      updatedBy: scope.updatedBy,
      version: sql`${successionItems.version} + 1`,
    })
    .where(
      and(
        eq(successionItems.familyId, scope.familyId),
        eq(successionItems.id, scope.itemId),
        eq(successionItems.version, scope.expectedVersion),
        isNull(successionItems.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Checklist position of a standard activity.
 *
 * @param kind - Standard kind.
 * @returns A stable sort order from 0.
 */
function standardSort(kind: StandardSuccessionKind): number {
  const order: Record<StandardSuccessionKind, number> = {
    documents: 0,
    will: 1,
    notary: 2,
    titles: 3,
    declaration: 4,
    utility_transfers: 5,
  };
  return order[kind];
}
