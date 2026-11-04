import {
  MAX_SUCCESSION_ITEMS,
  STANDARD_SUCCESSION_KINDS,
  type CreateSuccessionItemRequest,
  type SuccessionItem,
  type SuccessionList,
  type UpdateSuccessionItemRequest,
} from '@domusafe/contracts';
import { recordAudit, recordRevision, withContext, type Database, type Transaction } from '@domusafe/db';
import { ProblemError, classifyDatabaseError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import * as repo from './repository.js';

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

function view(row: repo.SuccessionRow): SuccessionItem {
  return {
    id: row.id,
    familyId: row.familyId,
    kind: row.kind,
    title: row.title,
    notes: row.notes,
    deadlineNote: row.deadlineNote,
    done: row.done,
    completedAt: row.completedAt === null ? null : row.completedAt.toISOString(),
    sortOrder: row.sortOrder,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Family succession checklist. Editing and export are Premium, including the thirty-day trial.
 * The stored fields are the checklist itself. Vault documents are not read or written here.
 *
 * @param db - Database bound to the `domusafe_app` pool.
 * @returns The service.
 */
export function createSuccessionService(db: Database) {
  async function inFamily<T>(tenant: TenantContext, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, work);
  }

  async function trace(
    tx: Transaction,
    tenant: TenantContext,
    input: {
      readonly action: string;
      readonly resourceId: string;
      readonly version: number;
      readonly op: 'create' | 'update' | 'delete';
      readonly kind: string;
      readonly done: boolean;
    },
  ): Promise<void> {
    const actor = { kind: 'account' as const, id: tenant.accountId };
    await recordRevision(tx, {
      familyId: tenant.familyId,
      resourceType: 'succession_items',
      resourceId: input.resourceId,
      version: input.version,
      op: input.op,
      actor,
      data: { kind: input.kind, done: input.done },
    });
    await recordAudit(tx, {
      familyId: tenant.familyId,
      actor,
      action: input.action,
      resourceType: 'succession_items',
      resourceId: input.resourceId,
      outcome: 'success',
      metadata: { kind: input.kind, done: input.done },
    });
  }

  return {
    /**
     * Lists the active succession activities of the family.
     *
     * Preconditions: the route has already required Premium and `vault.family.read`.
     * Postconditions: trashed activities are omitted.
     * Data contract: each item is a checklist row. No vault envelope is included.
     *
     * @param tenant - Resolved tenant.
     * @returns The checklist, which may still be empty.
     */
    async list(tenant: TenantContext): Promise<SuccessionList> {
      const items = await inFamily(tenant, (tx) => repo.listItems(tx, tenant.familyId));
      return { items: items.map(view) };
    },

    /**
     * Creates the six standard activities that are missing.
     *
     * Preconditions: the caller may write the family vault and the plan includes succession.
     * Postconditions: activities already present stay as they are, including a done mark.
     * Data contract: standard rows have no title of their own; the interface names them.
     *
     * @param tenant - Resolved tenant.
     * @returns The full checklist after the missing activities are added.
     */
    async prepare(tenant: TenantContext): Promise<SuccessionList> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const existing = await repo.listItems(tx, tenant.familyId);
          const have = new Set(existing.map((item) => item.kind));
          const missing = STANDARD_SUCCESSION_KINDS.filter((kind) => !have.has(kind));
          if (existing.length + missing.length > MAX_SUCCESSION_ITEMS) {
            throw new ProblemError('domain_rule_violated', { detail: 'Too many succession activities' });
          }
          await repo.insertStandard(tx, {
            familyId: tenant.familyId,
            kinds: missing,
            createdBy: tenant.accountId,
          });
          const items = await repo.listItems(tx, tenant.familyId);
          if (missing.length > 0) {
            await trace(tx, tenant, {
              action: 'succession.checklist.prepared',
              resourceId: tenant.familyId,
              version: items.length,
              op: 'create',
              kind: 'standard',
              done: false,
            });
          }
          return { items: items.map(view) };
        }),
      );
    },

    /**
     * Adds one activity written by the family.
     *
     * Preconditions: the title is present and contains no run of eight digits.
     * Postconditions: the activity is `custom` and not done.
     * Data contract: notes are optional checklist text, not a vault secret.
     *
     * @param tenant - Resolved tenant.
     * @param body - Title and optional notes.
     * @returns The activity.
     */
    async create(tenant: TenantContext, body: CreateSuccessionItemRequest): Promise<SuccessionItem> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const existing = await repo.listItems(tx, tenant.familyId);
          if (existing.length >= MAX_SUCCESSION_ITEMS) {
            throw new ProblemError('domain_rule_violated', { detail: 'Too many succession activities' });
          }
          const sortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), 5) + 1;
          const row = await repo.insertCustom(tx, {
            familyId: tenant.familyId,
            title: body.title,
            notes: body.notes ?? null,
            deadlineNote: body.deadlineNote ?? null,
            sortOrder,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            action: 'succession.item.created',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            kind: row.kind,
            done: row.done,
          });
          return view(row);
        }),
      );
    },

    /**
     * Edits the title, the notes or the done mark of one activity.
     *
     * Preconditions: `expectedVersion` is the version the form loaded.
     * Postconditions: marking done records the instant; clearing it removes that instant.
     * Data contract: a custom activity keeps a title. Notes stay free of eight-digit runs.
     *
     * @param tenant - Resolved tenant.
     * @param itemId - Activity id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Fields to change.
     * @returns The activity.
     * @throws ProblemError `version_conflict` when the version is stale.
     */
    async update(
      tenant: TenantContext,
      itemId: string,
      expectedVersion: number,
      patch: UpdateSuccessionItemRequest,
    ): Promise<SuccessionItem> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findItem(tx, tenant.familyId, itemId);
          if (current?.deletedAt !== null) {
            throw new ProblemError('not_found');
          }
          if (current.kind === 'custom' && patch.title === null) {
            throw new ProblemError('domain_rule_violated', { detail: 'A custom activity needs a title' });
          }
          const completedAt =
            patch.done === undefined ? undefined : patch.done ? (current.completedAt ?? new Date()) : null;
          const updated = await repo.updateItem(
            tx,
            { familyId: tenant.familyId, itemId, expectedVersion },
            {
              ...(patch.title === undefined ? {} : { title: patch.title }),
              ...(patch.notes === undefined ? {} : { notes: patch.notes }),
              ...(patch.deadlineNote === undefined ? {} : { deadlineNote: patch.deadlineNote }),
              ...(patch.done === undefined ? {} : { done: patch.done }),
              ...(completedAt === undefined ? {} : { completedAt }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'succession.item.updated',
            resourceId: itemId,
            version: updated.version,
            op: 'update',
            kind: updated.kind,
            done: updated.done,
          });
          return view(updated);
        }),
      );
    },

    /**
     * Moves one activity to the trash.
     *
     * Preconditions: `expectedVersion` matches the stored version.
     * Postconditions: the activity no longer appears in the list. Preparing again can restore a standard kind.
     *
     * @param tenant - Resolved tenant.
     * @param itemId - Activity id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async remove(tenant: TenantContext, itemId: string, expectedVersion: number): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findItem(tx, tenant.familyId, itemId);
          if (current?.deletedAt !== null) {
            throw new ProblemError('not_found');
          }
          const trashed = await repo.trashItem(tx, {
            familyId: tenant.familyId,
            itemId,
            expectedVersion,
            updatedBy: tenant.accountId,
          });
          if (trashed === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'succession.item.deleted',
            resourceId: itemId,
            version: trashed.version,
            op: 'delete',
            kind: trashed.kind,
            done: trashed.done,
          });
        }),
      );
    },
  };
}

/** Succession service. */
export type SuccessionService = ReturnType<typeof createSuccessionService>;
