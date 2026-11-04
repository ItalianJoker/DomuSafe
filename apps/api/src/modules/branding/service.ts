import {
  sheetMarkFor,
  type FamilyBranding,
  type PutFamilyBrandingRequest,
  type SheetMark,
} from '@domusafe/contracts';
import { recordAudit, recordRevision, withContext, type Database, type Transaction } from '@domusafe/db';
import { hasFeature } from '@domusafe/plans';
import { ProblemError, classifyDatabaseError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import type { TenancyService } from '../tenancy/service.js';
import * as repo from './repository.js';

/** Result of a save that left a row in place. */
export interface SavedBranding {
  readonly branding: FamilyBranding;
  readonly created: boolean;
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

function isEmpty(body: PutFamilyBrandingRequest): boolean {
  return (
    body.displayName === null && body.color === null && body.welcome === null && body.logoDataUrl === null
  );
}

function view(row: repo.BrandingRow): FamilyBranding {
  return {
    familyId: row.familyId,
    displayName: row.displayName,
    color: row.accentColor === null ? null : row.accentColor.trim().toLowerCase(),
    welcome: row.welcome,
    logoDataUrl: row.logoDataUrl,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function writeOf(body: PutFamilyBrandingRequest): repo.BrandingWrite {
  return {
    displayName: body.displayName,
    accentColor: body.color?.toLowerCase() ?? null,
    welcome: body.welcome,
    logoDataUrl: body.logoDataUrl,
  };
}

/**
 * Host-mark use cases.
 *
 * The public mark is chosen from the effective plan: Free and Basic keep the product mark,
 * Advanced shows nothing, and Premium (including the trial) shows the stored values.
 * Vault envelopes are never read here.
 */
export interface BrandingService {
  /**
   * Reads the stored host mark.
   *
   * Preconditions: the route already required a plan that includes branding.
   * Postconditions: null when the family has not saved a mark.
   * Data contract: name, color, welcome sentence, logo address and version. No vault fields.
   *
   * @param tenant - Resolved tenant.
   * @returns The stored mark, or null.
   */
  get(tenant: TenantContext): Promise<FamilyBranding | null>;
  /**
   * Replaces the host mark, or removes it when every field is null.
   *
   * Preconditions: the route already required `branding.manage` and the branding feature.
   * Postconditions: a missing `If-Match` is accepted only when no row exists.
   * Data contract: the stored logo is the same small data address the client sent.
   *
   * @param tenant - Resolved tenant.
   * @param expectedVersion - Version from `If-Match`, or null when the header is absent.
   * @param body - The whole mark. All null clears it.
   * @returns The stored mark and whether this call inserted it, or null when cleared.
   */
  save(
    tenant: TenantContext,
    expectedVersion: number | null,
    body: PutFamilyBrandingRequest,
  ): Promise<SavedBranding | null>;
  /**
   * Mark to draw on a public page.
   *
   * Preconditions: `tx` already has the family context of the printed code.
   * Postconditions: a leftover row is ignored unless the effective plan includes branding.
   * Data contract: product, none, or the host fields. No vault fields.
   *
   * @param tx - Open transaction.
   * @param familyId - Family that owns the printed code.
   * @returns The mark.
   */
  markForFamily(tx: Transaction, familyId: string): Promise<SheetMark>;
}

/**
 * Builds the branding service.
 *
 * @param db - Database bound to the application role.
 * @param tenancy - Plan reader. The trial of the owner counts as Premium.
 * @returns The service.
 */
export function createBrandingService(db: Database, tenancy: TenancyService): BrandingService {
  function inFamily<T>(tenant: TenantContext, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, work);
  }

  return {
    async get(tenant) {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const row = await repo.findBranding(tx, tenant.familyId);
          return row === null ? null : view(row);
        }),
      );
    },

    async save(tenant, expectedVersion, body) {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findBranding(tx, tenant.familyId);
          const empty = isEmpty(body);
          if (current === null) {
            if (empty) {
              return null;
            }
            const inserted = await repo.insertBranding(tx, tenant.familyId, tenant.accountId, writeOf(body));
            await trace(tx, tenant, inserted, 'create');
            return { branding: view(inserted), created: true };
          }
          if (expectedVersion === null) {
            throw new ProblemError('precondition_required');
          }
          if (current.version !== expectedVersion) {
            throw new ProblemError('version_conflict', { currentVersion: current.version });
          }
          if (empty) {
            const removed = await repo.deleteBranding(tx, tenant.familyId, expectedVersion);
            if (!removed) {
              const again = await repo.findBranding(tx, tenant.familyId);
              throw new ProblemError('version_conflict', {
                currentVersion: again?.version ?? current.version,
              });
            }
            await traceCleared(tx, tenant, current.version + 1);
            return null;
          }
          const updated = await repo.updateBranding(
            tx,
            tenant.familyId,
            expectedVersion,
            tenant.accountId,
            writeOf(body),
          );
          if (updated === null) {
            const again = await repo.findBranding(tx, tenant.familyId);
            throw new ProblemError('version_conflict', { currentVersion: again?.version ?? current.version });
          }
          await trace(tx, tenant, updated, 'update');
          return { branding: view(updated), created: false };
        }),
      );
    },

    async markForFamily(tx, familyId) {
      const plan = await tenancy.planOfFamily(tx, familyId);
      const tier = plan?.tier ?? 'free';
      const row = hasFeature(tier, 'branding') ? await repo.findBranding(tx, familyId) : null;
      return sheetMarkFor(tier, row === null ? null : view(row));
    },
  };
}

async function trace(
  tx: Transaction,
  tenant: TenantContext,
  row: repo.BrandingRow,
  op: 'create' | 'update',
): Promise<void> {
  const actor = { kind: 'account' as const, id: tenant.accountId };
  await recordRevision(tx, {
    familyId: tenant.familyId,
    resourceType: 'family_branding',
    resourceId: tenant.familyId,
    version: row.version,
    op,
    actor,
    data: {
      displayName: row.displayName,
      color: row.accentColor,
      welcome: row.welcome,
      hasLogo: row.logoDataUrl !== null,
    },
  });
  await recordAudit(tx, {
    familyId: tenant.familyId,
    actor,
    action: 'branding.host.saved',
    resourceType: 'family_branding',
    resourceId: tenant.familyId,
    outcome: 'success',
    metadata: { hasLogo: row.logoDataUrl !== null, version: row.version },
  });
}

async function traceCleared(tx: Transaction, tenant: TenantContext, version: number): Promise<void> {
  const actor = { kind: 'account' as const, id: tenant.accountId };
  await recordRevision(tx, {
    familyId: tenant.familyId,
    resourceType: 'family_branding',
    resourceId: tenant.familyId,
    version,
    op: 'delete',
    actor,
    data: { cleared: true },
  });
  await recordAudit(tx, {
    familyId: tenant.familyId,
    actor,
    action: 'branding.host.cleared',
    resourceType: 'family_branding',
    resourceId: tenant.familyId,
    outcome: 'success',
    metadata: { cleared: true, version },
  });
}
