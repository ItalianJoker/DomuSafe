import {
  encodeCursor,
  type Chore,
  type ChoreCompletion,
  type CreateChoreCompletionRequest,
  type CreateChoreRequest,
  type CreatePointEntryRequest,
  type CreateRedemptionRequest,
  type CreateRewardRequest,
  type PointEntry,
  type PointsView,
  type ResidentStreak,
  type Reward,
  type RewardRedemption,
  type UpdateChoreRequest,
  type UpdateRewardRequest,
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

function pageOfCompleted<TRow extends { completedAt: Date; id: string }, TView>(
  rows: TRow[],
  limit: number,
  view: (row: TRow) => TView,
): Page<TView> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice.at(-1);
  return {
    items: slice.map(view),
    nextCursor:
      hasMore && last !== undefined ? encodeCursor([last.completedAt.toISOString(), last.id]) : null,
  };
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function addCalendarDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T00:00:00.000Z`);
  const b = Date.parse(`${later}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Advances the next due date from a simple FREQ recurrence, or clears it when one-shot.
 *
 * @param dueDate - Due date that was just completed.
 * @param rrule - Optional recurrence.
 * @returns The next due date, or `null`.
 */
function nextDueAfter(dueDate: string, rrule: string | null): string | null {
  if (rrule === null) {
    return null;
  }
  if (rrule.startsWith('FREQ=DAILY')) {
    return addCalendarDays(dueDate, 1);
  }
  if (rrule.startsWith('FREQ=WEEKLY')) {
    return addCalendarDays(dueDate, 7);
  }
  if (rrule.startsWith('FREQ=MONTHLY')) {
    const date = new Date(`${dueDate}T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toISOString().slice(0, 10);
  }
  if (rrule.startsWith('FREQ=YEARLY')) {
    const date = new Date(`${dueDate}T00:00:00.000Z`);
    date.setUTCFullYear(date.getUTCFullYear() + 1);
    return date.toISOString().slice(0, 10);
  }
  return addCalendarDays(dueDate, 7);
}

function choreView(row: repo.ChoreRow): Chore {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    title: row.title,
    description: row.description,
    rrule: row.rrule,
    points: row.points,
    assignment: row.assignment,
    assignedResidentIds: row.assignedResidentIds,
    nextDueDate: row.nextDueDate,
    requiresApproval: row.requiresApproval,
    active: row.active,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function completionView(row: repo.ChoreCompletionRow): ChoreCompletion {
  return {
    id: row.id,
    familyId: row.familyId,
    choreId: row.choreId,
    residentId: row.residentId,
    dueDate: row.dueDate,
    completedAt: row.completedAt.toISOString(),
    status: row.status,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    pointsAwarded: row.pointsAwarded,
    proofPhotoDataUrl: row.proofPhotoDataUrl,
    note: row.note,
  };
}

function pointView(row: repo.PointEntryRow): PointEntry {
  return {
    id: row.id,
    familyId: row.familyId,
    residentId: row.residentId,
    delta: row.delta,
    reason: row.reason,
    source: row.source,
    sourceId: row.sourceId,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function streakView(residentId: string, row: repo.StreakRow | null): ResidentStreak {
  if (row === null) {
    return { residentId, currentDays: 0, bestDays: 0, lastCompletedOn: null };
  }
  return {
    residentId,
    currentDays: row.currentDays,
    bestDays: row.bestDays,
    lastCompletedOn: row.lastCompletedOn,
  };
}

function rewardView(row: repo.RewardRow): Reward {
  return {
    id: row.id,
    familyId: row.familyId,
    title: row.title,
    description: row.description,
    costPoints: row.costPoints,
    stock: row.stock,
    active: row.active,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function redemptionView(row: repo.RedemptionRow): RewardRedemption {
  return {
    id: row.id,
    familyId: row.familyId,
    residentId: row.residentId,
    rewardId: row.rewardId,
    status: row.status,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    pointEntryId: row.pointEntryId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireResident(tx: Transaction, familyId: string, residentId: string): Promise<void> {
  const row = await repo.findResident(tx, familyId, residentId);
  if (row === null) {
    throw new ProblemError('not_found');
  }
}

async function requireHouse(tx: Transaction, familyId: string, houseId: string): Promise<void> {
  const row = await repo.findHouse(tx, familyId, houseId);
  if (row === null) {
    throw new ProblemError('not_found');
  }
}

async function applyApprovedCompletion(
  tx: Transaction,
  tenant: TenantContext,
  chore: repo.ChoreRow,
  completion: repo.ChoreCompletionRow,
  approvedBy: string,
): Promise<void> {
  if (chore.points > 0) {
    await repo.insertPointEntry(tx, {
      familyId: tenant.familyId,
      residentId: completion.residentId,
      delta: chore.points,
      reason: chore.title,
      source: 'chore',
      sourceId: completion.id,
      createdBy: completion.createdBy,
      approvedBy,
    });
  }

  const onDate = completion.dueDate;
  const previous = await repo.getStreak(tx, tenant.familyId, completion.residentId);
  let currentDays = 1;
  if (previous?.lastCompletedOn !== null && previous?.lastCompletedOn !== undefined) {
    const gap = daysBetween(previous.lastCompletedOn, onDate);
    if (gap === 0) {
      currentDays = previous.currentDays;
    } else if (gap === 1) {
      currentDays = previous.currentDays + 1;
    }
  }
  const bestDays = Math.max(previous?.bestDays ?? 0, currentDays);
  await repo.upsertStreak(tx, {
    familyId: tenant.familyId,
    residentId: completion.residentId,
    currentDays,
    bestDays,
    lastCompletedOn: onDate,
  });

  if (currentDays > 0 && currentDays % 7 === 0 && (previous?.lastCompletedOn ?? null) !== onDate) {
    await repo.insertPointEntry(tx, {
      familyId: tenant.familyId,
      residentId: completion.residentId,
      delta: 1,
      reason: 'Serie di sette giorni',
      source: 'streak_bonus',
      sourceId: completion.id,
      createdBy: approvedBy,
      approvedBy,
    });
  }

  const nextDue = nextDueAfter(completion.dueDate, chore.rrule);
  let assignees = chore.assignedResidentIds;
  const head = assignees[0];
  if (chore.assignment === 'rotation' && assignees.length > 1 && head !== undefined) {
    assignees = [...assignees.slice(1), head];
  }
  await repo.updateChore(tx, tenant.familyId, chore.id, chore.version, {
    nextDueDate: nextDue,
    assignedResidentIds: assignees,
    updatedBy: approvedBy,
  });
}

/**
 * Family chores, points, streaks and the rewards store.
 * Available on every plan; no plan feature gate (resident limits still apply elsewhere).
 *
 * @param db - Database handle.
 * @returns The service.
 */
export function createRewardsService(db: Database) {
  async function inFamily<T>(tenant: TenantContext, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return withContext(
      db,
      { principal: { kind: 'account', accountId: tenant.accountId }, familyId: tenant.familyId },
      work,
    );
  }

  async function trace(
    tx: Transaction,
    tenant: TenantContext,
    input: {
      readonly resourceType: string;
      readonly resourceId: string;
      readonly version: number;
      readonly op: 'create' | 'update' | 'delete';
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

  function auditActor(tenant: TenantContext): { kind: 'account'; id: string } {
    return { kind: 'account', id: tenant.accountId };
  }

  return {
    listChores(
      tenant: TenantContext,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly houseId?: string | undefined;
        readonly active?: boolean | undefined;
      },
    ): Promise<Page<Chore>> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const rows = await repo.listChores(tx, {
            familyId: tenant.familyId,
            limit: query.limit,
            after: query.after,
            houseId: query.houseId,
            active: query.active,
          });
          return pageOfCreated(rows, query.limit, choreView);
        }),
      );
    },

    createChore(tenant: TenantContext, input: CreateChoreRequest): Promise<Chore> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          if (input.houseId !== undefined && input.houseId !== null) {
            await requireHouse(tx, tenant.familyId, input.houseId);
          }
          for (const residentId of input.assignedResidentIds) {
            await requireResident(tx, tenant.familyId, residentId);
          }
          const row = await repo.insertChore(tx, {
            familyId: tenant.familyId,
            houseId: input.houseId ?? null,
            title: input.title,
            description: input.description ?? null,
            rrule: input.rrule ?? null,
            points: input.points,
            assignment: input.assignment,
            assignedResidentIds: input.assignedResidentIds,
            nextDueDate: input.nextDueDate ?? null,
            requiresApproval: input.requiresApproval,
            active: input.active,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            resourceType: 'chores',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            action: 'rewards.chore.created',
            data: { title: row.title, points: row.points },
          });
          return choreView(row);
        }),
      );
    },

    getChore(tenant: TenantContext, choreId: string): Promise<Chore> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const row = await repo.getChore(tx, tenant.familyId, choreId);
          if (row === null) {
            throw new ProblemError('not_found');
          }
          return choreView(row);
        }),
      );
    },

    updateChore(
      tenant: TenantContext,
      choreId: string,
      expectedVersion: number,
      patch: UpdateChoreRequest,
    ): Promise<Chore> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const existing = await repo.getChore(tx, tenant.familyId, choreId);
          if (existing === null) {
            throw new ProblemError('not_found');
          }
          if (existing.version !== expectedVersion) {
            conflict(existing.version);
          }
          if (patch.houseId !== undefined && patch.houseId !== null) {
            await requireHouse(tx, tenant.familyId, patch.houseId);
          }
          if (patch.assignedResidentIds !== undefined) {
            for (const residentId of patch.assignedResidentIds) {
              await requireResident(tx, tenant.familyId, residentId);
            }
          }
          const updated = await repo.updateChore(tx, tenant.familyId, choreId, expectedVersion, {
            ...patch,
            updatedBy: tenant.accountId,
          });
          if (updated === null) {
            conflict(existing.version);
          }
          await trace(tx, tenant, {
            resourceType: 'chores',
            resourceId: updated.id,
            version: updated.version,
            op: 'update',
            action: 'rewards.chore.updated',
            data: { title: updated.title },
          });
          return choreView(updated);
        }),
      );
    },

    deleteChore(tenant: TenantContext, choreId: string, expectedVersion: number): Promise<void> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const existing = await repo.getChore(tx, tenant.familyId, choreId);
          if (existing === null) {
            throw new ProblemError('not_found');
          }
          if (existing.version !== expectedVersion) {
            conflict(existing.version);
          }
          const updated = await repo.updateChore(tx, tenant.familyId, choreId, expectedVersion, {
            deletedAt: new Date(),
            active: false,
            updatedBy: tenant.accountId,
          });
          if (updated === null) {
            conflict(existing.version);
          }
          await trace(tx, tenant, {
            resourceType: 'chores',
            resourceId: updated.id,
            version: updated.version,
            op: 'delete',
            action: 'rewards.chore.deleted',
            data: { title: updated.title },
          });
        }),
      );
    },

    listCompletions(
      tenant: TenantContext,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly choreId?: string | undefined;
        readonly residentId?: string | undefined;
        readonly status?: 'pending_approval' | 'approved' | 'rejected' | undefined;
      },
    ): Promise<Page<ChoreCompletion>> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const rows = await repo.listCompletions(tx, {
            familyId: tenant.familyId,
            limit: query.limit,
            after: query.after,
            choreId: query.choreId,
            residentId: query.residentId,
            status: query.status,
          });
          return pageOfCompleted(rows, query.limit, completionView);
        }),
      );
    },

    completeChore(
      tenant: TenantContext,
      choreId: string,
      input: CreateChoreCompletionRequest,
    ): Promise<ChoreCompletion> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const chore = await repo.getChore(tx, tenant.familyId, choreId);
          if (chore?.active !== true) {
            throw new ProblemError('not_found');
          }
          await requireResident(tx, tenant.familyId, input.residentId);
          if (chore.assignedResidentIds.length > 0 && !chore.assignedResidentIds.includes(input.residentId)) {
            throw new ProblemError('forbidden');
          }
          const dueDate = input.dueDate ?? chore.nextDueDate ?? todayUtc();
          const approvedImmediately = !chore.requiresApproval;
          const row = await repo.insertCompletion(tx, {
            familyId: tenant.familyId,
            choreId,
            residentId: input.residentId,
            dueDate,
            status: approvedImmediately ? 'approved' : 'pending_approval',
            pointsAwarded: approvedImmediately ? chore.points : 0,
            proofPhotoDataUrl: input.proofPhotoDataUrl ?? null,
            note: input.note ?? null,
            createdBy: tenant.accountId,
            decidedBy: approvedImmediately ? tenant.accountId : null,
            decidedAt: approvedImmediately ? new Date() : null,
          });
          if (approvedImmediately) {
            await applyApprovedCompletion(tx, tenant, chore, row, tenant.accountId);
          }
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: auditActor(tenant),
            action: approvedImmediately
              ? 'rewards.chore.completed_approved'
              : 'rewards.chore.completed_pending',
            resourceType: 'chore_completions',
            resourceId: row.id,
            outcome: 'success',
          });
          return completionView(row);
        }),
      );
    },

    approveCompletion(tenant: TenantContext, completionId: string): Promise<ChoreCompletion> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const existing = await repo.getCompletion(tx, tenant.familyId, completionId);
          if (existing === null) {
            throw new ProblemError('not_found');
          }
          if (existing.status !== 'pending_approval') {
            throw new ProblemError('domain_rule_violated', {
              detail: 'Only pending completions can be approved',
            });
          }
          const chore = await repo.getChore(tx, tenant.familyId, existing.choreId);
          if (chore === null) {
            throw new ProblemError('not_found');
          }
          const decidedAt = new Date();
          const updated = await repo.decideCompletion(tx, tenant.familyId, completionId, {
            status: 'approved',
            decidedBy: tenant.accountId,
            decidedAt,
            pointsAwarded: chore.points,
          });
          if (updated === null) {
            throw new ProblemError('domain_rule_violated', {
              detail: 'Only pending completions can be approved',
            });
          }
          await applyApprovedCompletion(tx, tenant, chore, updated, tenant.accountId);
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: auditActor(tenant),
            action: 'rewards.chore.approved',
            resourceType: 'chore_completions',
            resourceId: updated.id,
            outcome: 'success',
          });
          return completionView(updated);
        }),
      );
    },

    rejectCompletion(tenant: TenantContext, completionId: string): Promise<ChoreCompletion> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const existing = await repo.getCompletion(tx, tenant.familyId, completionId);
          if (existing === null) {
            throw new ProblemError('not_found');
          }
          if (existing.status !== 'pending_approval') {
            throw new ProblemError('domain_rule_violated', {
              detail: 'Only pending completions can be rejected',
            });
          }
          const updated = await repo.decideCompletion(tx, tenant.familyId, completionId, {
            status: 'rejected',
            decidedBy: tenant.accountId,
            decidedAt: new Date(),
            pointsAwarded: 0,
          });
          if (updated === null) {
            throw new ProblemError('domain_rule_violated', {
              detail: 'Only pending completions can be rejected',
            });
          }
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: auditActor(tenant),
            action: 'rewards.chore.rejected',
            resourceType: 'chore_completions',
            resourceId: updated.id,
            outcome: 'success',
          });
          return completionView(updated);
        }),
      );
    },

    getPoints(
      tenant: TenantContext,
      query: {
        readonly residentId: string;
        readonly limit: number;
        readonly after: readonly [string, string] | null;
      },
    ): Promise<PointsView> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          await requireResident(tx, tenant.familyId, query.residentId);
          const [balance, streak, entries] = await Promise.all([
            repo.sumBalance(tx, tenant.familyId, query.residentId),
            repo.getStreak(tx, tenant.familyId, query.residentId),
            repo.listPointEntries(tx, {
              familyId: tenant.familyId,
              residentId: query.residentId,
              limit: query.limit,
              after: query.after,
            }),
          ]);
          const page = pageOfCreated(entries, query.limit, pointView);
          return {
            residentId: query.residentId,
            balance,
            streak: streakView(query.residentId, streak),
            items: page.items,
            nextCursor: page.nextCursor,
          };
        }),
      );
    },

    adjustPoints(tenant: TenantContext, input: CreatePointEntryRequest): Promise<PointEntry> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          await requireResident(tx, tenant.familyId, input.residentId);
          const row = await repo.insertPointEntry(tx, {
            familyId: tenant.familyId,
            residentId: input.residentId,
            delta: input.delta,
            reason: input.reason,
            source: 'manual',
            sourceId: null,
            createdBy: tenant.accountId,
            approvedBy: tenant.accountId,
          });
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: auditActor(tenant),
            action: 'rewards.points.adjusted',
            resourceType: 'point_entries',
            resourceId: row.id,
            outcome: 'success',
          });
          return pointView(row);
        }),
      );
    },

    listRewards(
      tenant: TenantContext,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly active?: boolean | undefined;
      },
    ): Promise<Page<Reward>> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const rows = await repo.listRewards(tx, {
            familyId: tenant.familyId,
            limit: query.limit,
            after: query.after,
            active: query.active,
          });
          return pageOfCreated(rows, query.limit, rewardView);
        }),
      );
    },

    createReward(tenant: TenantContext, input: CreateRewardRequest): Promise<Reward> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const row = await repo.insertReward(tx, {
            familyId: tenant.familyId,
            title: input.title,
            description: input.description ?? null,
            costPoints: input.costPoints,
            stock: input.stock ?? null,
            active: input.active,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            resourceType: 'rewards',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            action: 'rewards.reward.created',
            data: { title: row.title, costPoints: row.costPoints },
          });
          return rewardView(row);
        }),
      );
    },

    updateReward(
      tenant: TenantContext,
      rewardId: string,
      expectedVersion: number,
      patch: UpdateRewardRequest,
    ): Promise<Reward> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const existing = await repo.getReward(tx, tenant.familyId, rewardId);
          if (existing === null) {
            throw new ProblemError('not_found');
          }
          if (existing.version !== expectedVersion) {
            conflict(existing.version);
          }
          const updated = await repo.updateReward(tx, tenant.familyId, rewardId, expectedVersion, {
            ...patch,
            updatedBy: tenant.accountId,
          });
          if (updated === null) {
            conflict(existing.version);
          }
          await trace(tx, tenant, {
            resourceType: 'rewards',
            resourceId: updated.id,
            version: updated.version,
            op: 'update',
            action: 'rewards.reward.updated',
            data: { title: updated.title },
          });
          return rewardView(updated);
        }),
      );
    },

    deleteReward(tenant: TenantContext, rewardId: string, expectedVersion: number): Promise<void> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const existing = await repo.getReward(tx, tenant.familyId, rewardId);
          if (existing === null) {
            throw new ProblemError('not_found');
          }
          if (existing.version !== expectedVersion) {
            conflict(existing.version);
          }
          const updated = await repo.updateReward(tx, tenant.familyId, rewardId, expectedVersion, {
            deletedAt: new Date(),
            active: false,
            updatedBy: tenant.accountId,
          });
          if (updated === null) {
            conflict(existing.version);
          }
          await trace(tx, tenant, {
            resourceType: 'rewards',
            resourceId: updated.id,
            version: updated.version,
            op: 'delete',
            action: 'rewards.reward.deleted',
            data: { title: updated.title },
          });
        }),
      );
    },

    listRedemptions(
      tenant: TenantContext,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly residentId?: string | undefined;
        readonly status?: 'requested' | 'approved' | 'rejected' | 'fulfilled' | undefined;
      },
    ): Promise<Page<RewardRedemption>> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const rows = await repo.listRedemptions(tx, {
            familyId: tenant.familyId,
            limit: query.limit,
            after: query.after,
            residentId: query.residentId,
            status: query.status,
          });
          return pageOfCreated(rows, query.limit, redemptionView);
        }),
      );
    },

    requestRedemption(
      tenant: TenantContext,
      rewardId: string,
      input: CreateRedemptionRequest,
    ): Promise<RewardRedemption> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          // Plain read: children cannot take UPDATE locks on the catalogue (RLS).
          // Stock and balance are enforced again under parent locks on approve.
          const reward = await repo.getReward(tx, tenant.familyId, rewardId);
          if (reward?.active !== true) {
            throw new ProblemError('not_found');
          }
          if (reward.stock !== null && reward.stock <= 0) {
            throw new ProblemError('domain_rule_violated', { detail: 'This reward is out of stock' });
          }
          await requireResident(tx, tenant.familyId, input.residentId);
          const balance = await repo.sumBalance(tx, tenant.familyId, input.residentId);
          if (balance < reward.costPoints) {
            throw new ProblemError('domain_rule_violated', {
              detail: 'Not enough points for this reward',
            });
          }
          const row = await repo.insertRedemption(tx, {
            familyId: tenant.familyId,
            residentId: input.residentId,
            rewardId,
            createdBy: tenant.accountId,
          });
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: auditActor(tenant),
            action: 'rewards.redemption.requested',
            resourceType: 'reward_redemptions',
            resourceId: row.id,
            outcome: 'success',
          });
          return redemptionView(row);
        }),
      );
    },

    approveRedemption(
      tenant: TenantContext,
      redemptionId: string,
      expectedVersion: number,
    ): Promise<RewardRedemption> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const existing = await repo.getRedemption(tx, tenant.familyId, redemptionId);
          if (existing === null) {
            throw new ProblemError('not_found');
          }
          if (existing.status !== 'requested') {
            throw new ProblemError('domain_rule_violated', {
              detail: 'Only requested redemptions can be approved',
            });
          }
          if (existing.version !== expectedVersion) {
            conflict(existing.version);
          }
          const reward = await repo.lockReward(tx, tenant.familyId, existing.rewardId);
          if (reward?.active !== true) {
            throw new ProblemError('not_found');
          }
          if (reward.stock !== null && reward.stock <= 0) {
            throw new ProblemError('domain_rule_violated', { detail: 'This reward is out of stock' });
          }
          const balance = await repo.sumBalanceForUpdate(tx, tenant.familyId, existing.residentId);
          if (balance < reward.costPoints) {
            throw new ProblemError('domain_rule_violated', {
              detail: 'Not enough points for this reward',
            });
          }
          const entry = await repo.insertPointEntry(tx, {
            familyId: tenant.familyId,
            residentId: existing.residentId,
            delta: -reward.costPoints,
            reason: reward.title,
            source: 'reward',
            sourceId: existing.id,
            createdBy: existing.createdBy,
            approvedBy: tenant.accountId,
          });
          if (reward.stock !== null) {
            const stocked = await repo.decrementStock(tx, tenant.familyId, reward.id);
            if (stocked === null) {
              throw new ProblemError('domain_rule_violated', { detail: 'This reward is out of stock' });
            }
          }
          const decidedAt = new Date();
          const updated = await repo.updateRedemption(tx, tenant.familyId, redemptionId, expectedVersion, {
            status: 'approved',
            decidedBy: tenant.accountId,
            decidedAt,
            pointEntryId: entry.id,
            updatedBy: tenant.accountId,
          });
          if (updated === null) {
            conflict(existing.version);
          }
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: auditActor(tenant),
            action: 'rewards.redemption.approved',
            resourceType: 'reward_redemptions',
            resourceId: updated.id,
            outcome: 'success',
          });
          return redemptionView(updated);
        }),
      );
    },

    rejectRedemption(
      tenant: TenantContext,
      redemptionId: string,
      expectedVersion: number,
    ): Promise<RewardRedemption> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const existing = await repo.getRedemption(tx, tenant.familyId, redemptionId);
          if (existing === null) {
            throw new ProblemError('not_found');
          }
          if (existing.status !== 'requested') {
            throw new ProblemError('domain_rule_violated', {
              detail: 'Only requested redemptions can be rejected',
            });
          }
          if (existing.version !== expectedVersion) {
            conflict(existing.version);
          }
          const updated = await repo.updateRedemption(tx, tenant.familyId, redemptionId, expectedVersion, {
            status: 'rejected',
            decidedBy: tenant.accountId,
            decidedAt: new Date(),
            updatedBy: tenant.accountId,
          });
          if (updated === null) {
            conflict(existing.version);
          }
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: auditActor(tenant),
            action: 'rewards.redemption.rejected',
            resourceType: 'reward_redemptions',
            resourceId: updated.id,
            outcome: 'success',
          });
          return redemptionView(updated);
        }),
      );
    },

    fulfillRedemption(
      tenant: TenantContext,
      redemptionId: string,
      expectedVersion: number,
    ): Promise<RewardRedemption> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const existing = await repo.getRedemption(tx, tenant.familyId, redemptionId);
          if (existing === null) {
            throw new ProblemError('not_found');
          }
          if (existing.status !== 'approved') {
            throw new ProblemError('domain_rule_violated', {
              detail: 'Only approved redemptions can be fulfilled',
            });
          }
          if (existing.version !== expectedVersion) {
            conflict(existing.version);
          }
          const updated = await repo.updateRedemption(tx, tenant.familyId, redemptionId, expectedVersion, {
            status: 'fulfilled',
            decidedBy: tenant.accountId,
            decidedAt: new Date(),
            updatedBy: tenant.accountId,
          });
          if (updated === null) {
            conflict(existing.version);
          }
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: auditActor(tenant),
            action: 'rewards.redemption.fulfilled',
            resourceType: 'reward_redemptions',
            resourceId: updated.id,
            outcome: 'success',
          });
          return redemptionView(updated);
        }),
      );
    },
  };
}

/** Service of family chores, points and rewards. */
export type RewardsService = ReturnType<typeof createRewardsService>;
