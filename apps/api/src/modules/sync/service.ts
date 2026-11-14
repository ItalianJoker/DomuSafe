import {
  decide,
  encodeCursor,
  GUIDE_AUDIENCES,
  GUIDE_TOPICS,
  type AuditEvent,
  type AuditEventListQuery,
  type Permission,
  type RestoreRevisionRequest,
  type Revision,
  type Sealed,
} from '@domusafe/contracts';
import { withContext, type Database, type Transaction } from '@domusafe/db';
import { ProblemError, classifyDatabaseError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import type { HouseService } from '../house/service.js';
import * as repo from './repository.js';
import { readPermissionFor, RESTORABLE_RESOURCE_TYPES, writePermissionFor } from './resources.js';

/** One page of a list. */
export interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

const account = (accountId: string): { kind: 'account'; accountId: string } => ({
  kind: 'account',
  accountId,
});

function allows(tenant: TenantContext, permission: Permission): boolean {
  return decide(
    { role: tenant.role, isOwner: tenant.isOwner, vaultFamilyConcession: tenant.vaultFamily },
    permission,
  ).allowed;
}

function assertAllowed(tenant: TenantContext, permission: Permission): void {
  if (!allows(tenant, permission)) {
    throw new ProblemError('forbidden');
  }
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

function revisionView(row: repo.RevisionRow, includeData: boolean): Revision {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    residentId: row.residentId,
    visibility: row.visibility,
    ownerAccountId: row.ownerAccountId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    version: row.version,
    op: row.op,
    actorKind: row.actorKind,
    actorId: row.actorId,
    createdAt: row.createdAt.toISOString(),
    ...(includeData
      ? {
          data: row.data as Revision['data'],
        }
      : {}),
  };
}

function auditView(row: repo.AuditEventRow): AuditEvent {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    familyId: row.familyId,
    actorKind: row.actorKind,
    actorId: row.actorId,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    outcome: row.outcome,
    metadata: row.metadata,
  };
}

function pageOf<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => readonly [string | number, string],
): Page<T> {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  if (last === undefined) {
    return { items: [], nextCursor: null };
  }
  return { items, nextCursor: encodeCursor(cursorOf(last)) };
}

function isGuideAudience(value: unknown): value is (typeof GUIDE_AUDIENCES)[number] {
  return typeof value === 'string' && (GUIDE_AUDIENCES as readonly string[]).includes(value);
}

function isGuideTopic(value: unknown): value is (typeof GUIDE_TOPICS)[number] {
  return typeof value === 'string' && (GUIDE_TOPICS as readonly string[]).includes(value);
}

/**
 * Sync use cases: revision history, restore of supported class C resources, and audit listing.
 *
 * Preconditions: callers pass a resolved tenant; plan features are enforced on the routes.
 * Postconditions: restores append a new revision with `op: restore` and emit a realtime event.
 * Data contract: list and detail never invent contents; restore reuses the stored class C snapshot.
 *
 * @param db - Database bound to the `domusafe_app` pool.
 * @param house - House service used for guide restore.
 * @returns The service.
 */
export function createSyncService(db: Database, house: HouseService) {
  async function inFamily<T>(tenant: TenantContext, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, work);
  }

  return {
    /**
     * Lists revisions of one resource, newest first.
     *
     * @param tenant - Resolved tenant.
     * @param input - Resource, limit and optional cursor.
     * @returns One page including class C snapshots.
     */
    async listRevisionsPage(
      tenant: TenantContext,
      input: {
        readonly resourceType: string;
        readonly resourceId: string;
        readonly limit: number;
        readonly after: readonly [number, string] | null;
      },
    ): Promise<Page<Revision>> {
      assertAllowed(tenant, readPermissionFor(input.resourceType));
      return inFamily(tenant, async (tx) => {
        const rows = await repo.listRevisions(tx, {
          familyId: tenant.familyId,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          limit: input.limit + 1,
          after: input.after,
        });
        return pageOf(
          rows.map((row) => revisionView(row, true)),
          input.limit,
          (row) => [row.version, row.id] as const,
        );
      });
    },

    /**
     * Reads one revision by id.
     *
     * @param tenant - Resolved tenant.
     * @param revisionId - Revision id.
     * @returns The revision with class C snapshot.
     */
    async getRevision(tenant: TenantContext, revisionId: string): Promise<Revision> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.findRevision(tx, tenant.familyId, revisionId);
        if (row === null) {
          throw new ProblemError('not_found');
        }
        assertAllowed(tenant, readPermissionFor(row.resourceType));
        return revisionView(row, true);
      });
    },

    /**
     * Restores a supported resource from a revision snapshot.
     *
     * @param tenant - Resolved tenant.
     * @param revisionId - Revision to restore from.
     * @param body - Optional sealed envelope for class A/B.
     * @returns The newly appended restore revision.
     */
    async restoreRevision(
      tenant: TenantContext,
      revisionId: string,
      body: RestoreRevisionRequest,
    ): Promise<Revision> {
      return guarded(async () => {
        const source = await inFamily(tenant, async (tx) => {
          const row = await repo.findRevision(tx, tenant.familyId, revisionId);
          if (row === null) {
            throw new ProblemError('not_found');
          }
          return row;
        });
        const writePermission = writePermissionFor(source.resourceType);
        if (writePermission === null || !RESTORABLE_RESOURCE_TYPES.has(source.resourceType)) {
          throw new ProblemError('domain_rule_violated', {
            detail: 'This resource type cannot be restored in this release',
          });
        }
        assertAllowed(tenant, writePermission);
        if (source.houseId === null || source.data === null) {
          throw new ProblemError('domain_rule_violated', {
            detail: 'The revision has no restorable class C snapshot',
          });
        }
        const snapshot = source.data;
        const audience = snapshot.audience;
        const topic = snapshot.topic;
        const title = snapshot.title;
        const bodyText = snapshot.body;
        const sortOrder = snapshot.sortOrder;
        if (
          !isGuideAudience(audience) ||
          !isGuideTopic(topic) ||
          typeof title !== 'string' ||
          typeof bodyText !== 'string' ||
          typeof sortOrder !== 'number'
        ) {
          throw new ProblemError('domain_rule_violated', {
            detail: 'The revision snapshot is incomplete',
          });
        }
        const sealed: Sealed | undefined = body.sealed;
        const restored = await house.restoreGuideEntry(tenant, {
          houseId: source.houseId,
          entryId: source.resourceId,
          audience,
          topic,
          title,
          body: bodyText,
          sortOrder,
          ...(sealed === undefined ? {} : { sealed }),
          sourceRevisionId: source.id,
          sourceVersion: source.version,
        });
        return inFamily(tenant, async (tx) => {
          const rows = await repo.listRevisions(tx, {
            familyId: tenant.familyId,
            resourceType: 'house_guide_entries',
            resourceId: restored.id,
            limit: 1,
            after: null,
          });
          const newest = rows[0];
          if (newest === undefined) {
            throw new ProblemError('internal_error');
          }
          return revisionView(newest, true);
        });
      });
    },

    /**
     * Lists audit events for administrators.
     *
     * @param tenant - Resolved tenant.
     * @param query - Validated query.
     * @param after - Decoded cursor.
     * @returns One page.
     */
    listAuditEvents(
      tenant: TenantContext,
      query: AuditEventListQuery,
      after: readonly [string, string] | null,
    ): Promise<Page<AuditEvent>> {
      assertAllowed(tenant, 'audit.read');
      return inFamily(tenant, async (tx) => {
        const rows = await repo.listAuditEvents(tx, {
          familyId: tenant.familyId,
          limit: query.limit + 1,
          after,
          ...(query.from === undefined ? {} : { from: new Date(query.from) }),
          ...(query.to === undefined ? {} : { to: new Date(query.to) }),
          ...(query.action === undefined ? {} : { action: query.action }),
          ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
        });
        return pageOf(rows.map(auditView), query.limit, (row) => [row.occurredAt, row.id] as const);
      });
    },
  };
}

/** Sync service interface. */
export type SyncService = ReturnType<typeof createSyncService>;
