import {
  choreCompletions,
  chores,
  houses,
  pointEntries,
  residentStreaks,
  residents,
  rewardRedemptions,
  rewards,
  type Transaction,
} from '@domusafe/db';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

/** Row of `chores`. */
export type ChoreRow = typeof chores.$inferSelect;
/** Row of `chore_completions`. */
export type ChoreCompletionRow = typeof choreCompletions.$inferSelect;
/** Row of `point_entries`. */
export type PointEntryRow = typeof pointEntries.$inferSelect;
/** Row of `rewards`. */
export type RewardRow = typeof rewards.$inferSelect;
/** Row of `reward_redemptions`. */
export type RedemptionRow = typeof rewardRedemptions.$inferSelect;
/** Row of `resident_streaks`. */
export type StreakRow = typeof residentStreaks.$inferSelect;

interface Page {
  readonly limit: number;
  readonly after: readonly [string, string] | null;
}

/**
 * Confirms a resident exists in the family.
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
 * Inserts a chore.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertChore(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly houseId: string | null;
    readonly title: string;
    readonly description: string | null;
    readonly rrule: string | null;
    readonly points: number;
    readonly assignment: 'fixed' | 'rotation';
    readonly assignedResidentIds: readonly string[];
    readonly nextDueDate: string | null;
    readonly requiresApproval: boolean;
    readonly active: boolean;
    readonly createdBy: string;
  },
): Promise<ChoreRow> {
  const [row] = await tx
    .insert(chores)
    .values({
      familyId: input.familyId,
      houseId: input.houseId,
      title: input.title,
      description: input.description,
      rrule: input.rrule,
      points: input.points,
      assignment: input.assignment,
      assignedResidentIds: [...input.assignedResidentIds],
      nextDueDate: input.nextDueDate,
      requiresApproval: input.requiresApproval,
      active: input.active,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Chore insert returned no row');
  }
  return row;
}

/**
 * Lists chores for a family, newest first.
 *
 * @param tx - Transaction.
 * @param scope - Family, optional filters and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listChores(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly houseId?: string | undefined;
    readonly active?: boolean | undefined;
  } & Page,
): Promise<ChoreRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${chores.createdAt}, ${chores.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(chores)
    .where(
      and(
        eq(chores.familyId, scope.familyId),
        isNull(chores.deletedAt),
        scope.houseId === undefined ? undefined : eq(chores.houseId, scope.houseId),
        scope.active === undefined ? undefined : eq(chores.active, scope.active),
        after,
      ),
    )
    .orderBy(desc(chores.createdAt), desc(chores.id))
    .limit(scope.limit + 1);
}

/**
 * Loads one chore.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param choreId - Chore id.
 * @returns The row, or `null`.
 */
export async function getChore(tx: Transaction, familyId: string, choreId: string): Promise<ChoreRow | null> {
  const [row] = await tx
    .select()
    .from(chores)
    .where(and(eq(chores.familyId, familyId), eq(chores.id, choreId), isNull(chores.deletedAt)));
  return row ?? null;
}

/**
 * Updates a chore when the version matches.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param choreId - Chore id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or `null` on version conflict / missing.
 */
export async function updateChore(
  tx: Transaction,
  familyId: string,
  choreId: string,
  expectedVersion: number,
  patch: {
    readonly title?: string | undefined;
    readonly description?: string | null | undefined;
    readonly houseId?: string | null | undefined;
    readonly rrule?: string | null | undefined;
    readonly points?: number | undefined;
    readonly assignment?: 'fixed' | 'rotation' | undefined;
    readonly assignedResidentIds?: readonly string[] | undefined;
    readonly nextDueDate?: string | null | undefined;
    readonly requiresApproval?: boolean | undefined;
    readonly active?: boolean | undefined;
    readonly deletedAt?: Date | null | undefined;
    readonly updatedBy: string;
  },
): Promise<ChoreRow | null> {
  const [row] = await tx
    .update(chores)
    .set({
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.description === undefined ? {} : { description: patch.description }),
      ...(patch.houseId === undefined ? {} : { houseId: patch.houseId }),
      ...(patch.rrule === undefined ? {} : { rrule: patch.rrule }),
      ...(patch.points === undefined ? {} : { points: patch.points }),
      ...(patch.assignment === undefined ? {} : { assignment: patch.assignment }),
      ...(patch.assignedResidentIds === undefined
        ? {}
        : { assignedResidentIds: [...patch.assignedResidentIds] }),
      ...(patch.nextDueDate === undefined ? {} : { nextDueDate: patch.nextDueDate }),
      ...(patch.requiresApproval === undefined ? {} : { requiresApproval: patch.requiresApproval }),
      ...(patch.active === undefined ? {} : { active: patch.active }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${chores.version} + 1`,
    })
    .where(
      and(
        eq(chores.familyId, familyId),
        eq(chores.id, choreId),
        eq(chores.version, expectedVersion),
        isNull(chores.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a chore completion.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertCompletion(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly choreId: string;
    readonly residentId: string;
    readonly dueDate: string;
    readonly status: 'pending_approval' | 'approved' | 'rejected';
    readonly pointsAwarded: number;
    readonly proofPhotoDataUrl: string | null;
    readonly note: string | null;
    readonly createdBy: string;
    readonly decidedBy: string | null;
    readonly decidedAt: Date | null;
  },
): Promise<ChoreCompletionRow> {
  const [row] = await tx
    .insert(choreCompletions)
    .values({
      familyId: input.familyId,
      choreId: input.choreId,
      residentId: input.residentId,
      dueDate: input.dueDate,
      status: input.status,
      pointsAwarded: input.pointsAwarded,
      proofPhotoDataUrl: input.proofPhotoDataUrl,
      note: input.note,
      createdBy: input.createdBy,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Chore completion insert returned no row');
  }
  return row;
}

/**
 * Lists chore completions, newest first.
 *
 * @param tx - Transaction.
 * @param scope - Family, optional filters and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listCompletions(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly choreId?: string | undefined;
    readonly residentId?: string | undefined;
    readonly status?: 'pending_approval' | 'approved' | 'rejected' | undefined;
  } & Page,
): Promise<ChoreCompletionRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${choreCompletions.completedAt}, ${choreCompletions.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(choreCompletions)
    .where(
      and(
        eq(choreCompletions.familyId, scope.familyId),
        scope.choreId === undefined ? undefined : eq(choreCompletions.choreId, scope.choreId),
        scope.residentId === undefined ? undefined : eq(choreCompletions.residentId, scope.residentId),
        scope.status === undefined ? undefined : eq(choreCompletions.status, scope.status),
        after,
      ),
    )
    .orderBy(desc(choreCompletions.completedAt), desc(choreCompletions.id))
    .limit(scope.limit + 1);
}

/**
 * Loads one completion.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param completionId - Completion id.
 * @returns The row, or `null`.
 */
export async function getCompletion(
  tx: Transaction,
  familyId: string,
  completionId: string,
): Promise<ChoreCompletionRow | null> {
  const [row] = await tx
    .select()
    .from(choreCompletions)
    .where(and(eq(choreCompletions.familyId, familyId), eq(choreCompletions.id, completionId)));
  return row ?? null;
}

/**
 * Updates the decision fields of a pending completion.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param completionId - Completion id.
 * @param patch - Decision columns.
 * @returns The updated row, or `null`.
 */
export async function decideCompletion(
  tx: Transaction,
  familyId: string,
  completionId: string,
  patch: {
    readonly status: 'approved' | 'rejected';
    readonly decidedBy: string;
    readonly decidedAt: Date;
    readonly pointsAwarded: number;
  },
): Promise<ChoreCompletionRow | null> {
  const [row] = await tx
    .update(choreCompletions)
    .set({
      status: patch.status,
      decidedBy: patch.decidedBy,
      decidedAt: patch.decidedAt,
      pointsAwarded: patch.pointsAwarded,
    })
    .where(
      and(
        eq(choreCompletions.familyId, familyId),
        eq(choreCompletions.id, completionId),
        eq(choreCompletions.status, 'pending_approval'),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a point ledger row.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertPointEntry(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly residentId: string;
    readonly delta: number;
    readonly reason: string;
    readonly source: 'chore' | 'reward' | 'manual' | 'streak_bonus';
    readonly sourceId: string | null;
    readonly createdBy: string | null;
    readonly approvedBy: string | null;
  },
): Promise<PointEntryRow> {
  const [row] = await tx.insert(pointEntries).values(input).returning();
  if (row === undefined) {
    throw new Error('Point entry insert returned no row');
  }
  return row;
}

/**
 * Lists point entries for a resident, newest first.
 *
 * @param tx - Transaction.
 * @param scope - Family, resident and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listPointEntries(
  tx: Transaction,
  scope: { readonly familyId: string; readonly residentId: string } & Page,
): Promise<PointEntryRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${pointEntries.createdAt}, ${pointEntries.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(pointEntries)
    .where(
      and(eq(pointEntries.familyId, scope.familyId), eq(pointEntries.residentId, scope.residentId), after),
    )
    .orderBy(desc(pointEntries.createdAt), desc(pointEntries.id))
    .limit(scope.limit + 1);
}

/**
 * Sums the point balance for a resident without taking locks (safe for child callers).
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentId - Resident id.
 * @returns The balance (0 when empty).
 */
export async function sumBalance(tx: Transaction, familyId: string, residentId: string): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${pointEntries.delta}), 0)::int` })
    .from(pointEntries)
    .where(and(eq(pointEntries.familyId, familyId), eq(pointEntries.residentId, residentId)));
  return row?.total ?? 0;
}

/**
 * Sums the point balance while locking the resident row (parent approve path).
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentId - Resident id.
 * @returns The balance (0 when empty).
 */
export async function sumBalanceForUpdate(
  tx: Transaction,
  familyId: string,
  residentId: string,
): Promise<number> {
  await tx
    .select({ id: residents.id })
    .from(residents)
    .where(and(eq(residents.familyId, familyId), eq(residents.id, residentId), isNull(residents.deletedAt)))
    .for('update');
  return sumBalance(tx, familyId, residentId);
}

/**
 * Loads the streak for a resident, or `null` when never completed.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentId - Resident id.
 * @returns The row, or `null`.
 */
export async function getStreak(
  tx: Transaction,
  familyId: string,
  residentId: string,
): Promise<StreakRow | null> {
  const [row] = await tx
    .select()
    .from(residentStreaks)
    .where(and(eq(residentStreaks.familyId, familyId), eq(residentStreaks.residentId, residentId)));
  return row ?? null;
}

/**
 * Upserts the streak after an approved completion.
 *
 * @param tx - Transaction.
 * @param input - Family, resident and computed streak values.
 * @returns The stored row.
 */
export async function upsertStreak(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly residentId: string;
    readonly currentDays: number;
    readonly bestDays: number;
    readonly lastCompletedOn: string;
  },
): Promise<StreakRow> {
  const [row] = await tx
    .insert(residentStreaks)
    .values(input)
    .onConflictDoUpdate({
      target: [residentStreaks.familyId, residentStreaks.residentId],
      set: {
        currentDays: input.currentDays,
        bestDays: input.bestDays,
        lastCompletedOn: input.lastCompletedOn,
      },
    })
    .returning();
  if (row === undefined) {
    throw new Error('Streak upsert returned no row');
  }
  return row;
}

/**
 * Inserts a reward catalogue item.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertReward(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly title: string;
    readonly description: string | null;
    readonly costPoints: number;
    readonly stock: number | null;
    readonly active: boolean;
    readonly createdBy: string;
  },
): Promise<RewardRow> {
  const [row] = await tx
    .insert(rewards)
    .values({ ...input, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Reward insert returned no row');
  }
  return row;
}

/**
 * Lists rewards, newest first.
 *
 * @param tx - Transaction.
 * @param scope - Family, optional active filter and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listRewards(
  tx: Transaction,
  scope: { readonly familyId: string; readonly active?: boolean | undefined } & Page,
): Promise<RewardRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${rewards.createdAt}, ${rewards.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(rewards)
    .where(
      and(
        eq(rewards.familyId, scope.familyId),
        isNull(rewards.deletedAt),
        scope.active === undefined ? undefined : eq(rewards.active, scope.active),
        after,
      ),
    )
    .orderBy(desc(rewards.createdAt), desc(rewards.id))
    .limit(scope.limit + 1);
}

/**
 * Loads one reward.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param rewardId - Reward id.
 * @returns The row, or `null`.
 */
export async function getReward(
  tx: Transaction,
  familyId: string,
  rewardId: string,
): Promise<RewardRow | null> {
  const [row] = await tx
    .select()
    .from(rewards)
    .where(and(eq(rewards.familyId, familyId), eq(rewards.id, rewardId), isNull(rewards.deletedAt)));
  return row ?? null;
}

/**
 * Locks one reward row for stock changes.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param rewardId - Reward id.
 * @returns The locked row, or `null`.
 */
export async function lockReward(
  tx: Transaction,
  familyId: string,
  rewardId: string,
): Promise<RewardRow | null> {
  const [row] = await tx
    .select()
    .from(rewards)
    .where(and(eq(rewards.familyId, familyId), eq(rewards.id, rewardId), isNull(rewards.deletedAt)))
    .for('update');
  return row ?? null;
}

/**
 * Updates a reward when the version matches.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param rewardId - Reward id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or `null`.
 */
export async function updateReward(
  tx: Transaction,
  familyId: string,
  rewardId: string,
  expectedVersion: number,
  patch: {
    readonly title?: string | undefined;
    readonly description?: string | null | undefined;
    readonly costPoints?: number | undefined;
    readonly stock?: number | null | undefined;
    readonly active?: boolean | undefined;
    readonly deletedAt?: Date | null | undefined;
    readonly updatedBy: string;
  },
): Promise<RewardRow | null> {
  const [row] = await tx
    .update(rewards)
    .set({
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.description === undefined ? {} : { description: patch.description }),
      ...(patch.costPoints === undefined ? {} : { costPoints: patch.costPoints }),
      ...(patch.stock === undefined ? {} : { stock: patch.stock }),
      ...(patch.active === undefined ? {} : { active: patch.active }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${rewards.version} + 1`,
    })
    .where(
      and(
        eq(rewards.familyId, familyId),
        eq(rewards.id, rewardId),
        eq(rewards.version, expectedVersion),
        isNull(rewards.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Decrements reward stock by one when stock is not null.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param rewardId - Reward id.
 * @returns The updated row, or `null` when stock is already zero.
 */
export async function decrementStock(
  tx: Transaction,
  familyId: string,
  rewardId: string,
): Promise<RewardRow | null> {
  const [row] = await tx
    .update(rewards)
    .set({
      stock: sql`${rewards.stock} - 1`,
      version: sql`${rewards.version} + 1`,
    })
    .where(
      and(
        eq(rewards.familyId, familyId),
        eq(rewards.id, rewardId),
        isNull(rewards.deletedAt),
        sql`${rewards.stock} is not null and ${rewards.stock} > 0`,
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a redemption request.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertRedemption(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly residentId: string;
    readonly rewardId: string;
    readonly createdBy: string;
  },
): Promise<RedemptionRow> {
  const [row] = await tx
    .insert(rewardRedemptions)
    .values({ ...input, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Redemption insert returned no row');
  }
  return row;
}

/**
 * Lists redemptions, newest first.
 *
 * @param tx - Transaction.
 * @param scope - Family, optional filters and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listRedemptions(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly residentId?: string | undefined;
    readonly status?: 'requested' | 'approved' | 'rejected' | 'fulfilled' | undefined;
  } & Page,
): Promise<RedemptionRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${rewardRedemptions.createdAt}, ${rewardRedemptions.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(rewardRedemptions)
    .where(
      and(
        eq(rewardRedemptions.familyId, scope.familyId),
        scope.residentId === undefined ? undefined : eq(rewardRedemptions.residentId, scope.residentId),
        scope.status === undefined ? undefined : eq(rewardRedemptions.status, scope.status),
        after,
      ),
    )
    .orderBy(desc(rewardRedemptions.createdAt), desc(rewardRedemptions.id))
    .limit(scope.limit + 1);
}

/**
 * Loads one redemption.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param redemptionId - Redemption id.
 * @returns The row, or `null`.
 */
export async function getRedemption(
  tx: Transaction,
  familyId: string,
  redemptionId: string,
): Promise<RedemptionRow | null> {
  const [row] = await tx
    .select()
    .from(rewardRedemptions)
    .where(and(eq(rewardRedemptions.familyId, familyId), eq(rewardRedemptions.id, redemptionId)));
  return row ?? null;
}

/**
 * Updates a redemption decision when still requested (or approved for fulfill).
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param redemptionId - Redemption id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or `null`.
 */
export async function updateRedemption(
  tx: Transaction,
  familyId: string,
  redemptionId: string,
  expectedVersion: number,
  patch: {
    readonly status: 'approved' | 'rejected' | 'fulfilled';
    readonly decidedBy: string;
    readonly decidedAt: Date;
    readonly pointEntryId?: string | null | undefined;
    readonly updatedBy: string;
  },
): Promise<RedemptionRow | null> {
  const [row] = await tx
    .update(rewardRedemptions)
    .set({
      status: patch.status,
      decidedBy: patch.decidedBy,
      decidedAt: patch.decidedAt,
      ...(patch.pointEntryId === undefined ? {} : { pointEntryId: patch.pointEntryId }),
      updatedBy: patch.updatedBy,
      version: sql`${rewardRedemptions.version} + 1`,
    })
    .where(
      and(
        eq(rewardRedemptions.familyId, familyId),
        eq(rewardRedemptions.id, redemptionId),
        eq(rewardRedemptions.version, expectedVersion),
      ),
    )
    .returning();
  return row ?? null;
}
