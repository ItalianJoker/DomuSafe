import { createHash, randomBytes } from 'node:crypto';
import {
  parseDeviceLabel,
  type DeviceLabel,
  type PublicHousePage,
  type PublicRescueSheet,
  type Publication,
  type PublicationKind,
  type PublicationReading,
} from '@domusafe/contracts';
import {
  recordAudit,
  recordRevision,
  setFamilyContext,
  withContext,
  type Database,
  type Transaction,
} from '@domusafe/db';
import { ProblemError, classifyDatabaseError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import type { BrandingService } from '../branding/service.js';
import * as repo from './repository.js';

/** Outcome of preparing a code: created now, or the one already hanging on the wall. */
export interface PreparedPublication {
  readonly publication: Publication;
  readonly created: boolean;
}

const account = (accountId: string): { kind: 'account'; accountId: string } => ({
  kind: 'account',
  accountId,
});
const system = { kind: 'system' } as const;

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

function readingView(row: repo.PublicationReadingRow): PublicationReading {
  return {
    occurredAt: row.occurredAt.toISOString(),
    kind: row.kind,
    deviceLabel: parseDeviceLabel(row.deviceLabel ?? undefined),
  };
}

function view(row: repo.PublicationRow): Publication {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    kind: row.kind,
    token: row.token,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastScannedAt: row.lastScannedAt?.toISOString() ?? null,
    scanCount: row.scanCount,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function newToken(): { readonly token: string; readonly tokenHash: Uint8Array<ArrayBuffer> } {
  const token = randomBytes(16).toString('base64url');
  const digest = createHash('sha256').update(token).digest();
  const tokenHash = new Uint8Array(digest.byteLength);
  tokenHash.set(digest);
  return { token, tokenHash };
}

function hashToken(token: string): Uint8Array<ArrayBuffer> {
  const digest = createHash('sha256').update(token).digest();
  const tokenHash = new Uint8Array(digest.byteLength);
  tokenHash.set(digest);
  return tokenHash;
}

/**
 * Print and public-code use cases.
 *
 * The public pages read a fixed projection. Utilities, the house manual, vault items and bank
 * columns are never selected. Health data is returned only for the rescue code.
 */
export interface PrintService {
  /**
   * Lists the codes of one house, including revoked ones, so the last reading stays visible.
   *
   * @param tenant - Resolved tenant. The route already required `qr.manage`.
   * @param houseId - House id.
   * @returns Newest codes first.
   */
  list(tenant: TenantContext, houseId: string): Promise<Publication[]>;
  /**
   * Prepares a code, or returns the active one.
   *
   * @param tenant - Resolved tenant.
   * @param houseId - House id.
   * @param kind - House page or rescue sheet.
   * @returns The code and whether this call stored a new token.
   */
  create(tenant: TenantContext, houseId: string, kind: PublicationKind): Promise<PreparedPublication>;
  /**
   * Revokes a code. Printed sheets that use it stop opening.
   *
   * @param tenant - Resolved tenant.
   * @param houseId - House id.
   * @param publicationId - Code id.
   * @param expectedVersion - Version from `If-Match`.
   * @returns The revoked code. The token is null.
   */
  revoke(
    tenant: TenantContext,
    houseId: string,
    publicationId: string,
    expectedVersion: number,
  ): Promise<Publication>;
  /**
   * Lists readings of the public codes, newest first.
   *
   * Preconditions: the route already required `house.write` and the Premium plan or the trial.
   * Postconditions: an unknown house is `not_found`.
   * Data contract: each item is the time, the code kind and the device label.
   *
   * @param tenant - Resolved tenant.
   * @param houseId - House id.
   * @returns Newest readings first.
   */
  listReadings(tenant: TenantContext, houseId: string): Promise<readonly PublicationReading[]>;
  /**
   * Opens the public house page and records the reading.
   *
   * @param token - Token from the printed address.
   * @param deviceLabel - Label the browser sent, or null.
   * @returns The page.
   */
  openHousePage(token: string, deviceLabel: DeviceLabel | null): Promise<PublicHousePage>;
  /**
   * Opens the public rescue sheet and records the reading.
   *
   * @param token - Token from the printed address.
   * @param deviceLabel - Label the browser sent, or null.
   * @returns The rescue sheet.
   */
  openRescueSheet(token: string, deviceLabel: DeviceLabel | null): Promise<PublicRescueSheet>;
}

/**
 * Builds the print service.
 *
 * @param db - Database bound to the application role.
 * @param branding - Host mark used by the public pages. The sheets themselves are drawn in the browser.
 * @returns The service.
 */
export function createPrintService(db: Database, branding: BrandingService): PrintService {
  function inFamily<T>(tenant: TenantContext, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, work);
  }

  async function trace(
    tx: Transaction,
    tenant: TenantContext,
    input: {
      readonly action: string;
      readonly publicationId: string;
      readonly houseId: string;
      readonly version: number;
      readonly op: 'create' | 'update';
      readonly kind: PublicationKind;
      readonly active: boolean;
    },
  ): Promise<void> {
    const actor = { kind: 'account' as const, id: tenant.accountId };
    await recordRevision(tx, {
      familyId: tenant.familyId,
      houseId: input.houseId,
      resourceType: 'publications',
      resourceId: input.publicationId,
      version: input.version,
      op: input.op,
      actor,
      data: { kind: input.kind, active: input.active },
    });
    await recordAudit(tx, {
      familyId: tenant.familyId,
      actor,
      action: input.action,
      resourceType: 'publications',
      resourceId: input.publicationId,
      outcome: 'success',
      metadata: { kind: input.kind },
    });
  }

  return {
    async list(tenant, houseId) {
      return inFamily(tenant, async (tx) => {
        if ((await repo.findHouse(tx, tenant.familyId, houseId)) === null) {
          throw new ProblemError('not_found');
        }
        const rows = await repo.listPublications(tx, tenant.familyId, houseId);
        return rows.map(view);
      });
    },

    async listReadings(tenant, houseId) {
      return inFamily(tenant, async (tx) => {
        if ((await repo.findHouse(tx, tenant.familyId, houseId)) === null) {
          throw new ProblemError('not_found');
        }
        const rows = await repo.listReadings(tx, tenant.familyId, houseId);
        return rows.map(readingView);
      });
    },

    async create(tenant, houseId, kind) {
      const prepare = () =>
        guarded(() =>
          inFamily(tenant, async (tx) => {
            if ((await repo.findHouse(tx, tenant.familyId, houseId)) === null) {
              throw new ProblemError('not_found');
            }
            const existing = await repo.findActive(tx, tenant.familyId, houseId, kind);
            if (existing !== null) {
              return { publication: view(existing), created: false };
            }
            const minted = newToken();
            const row = await repo.insertPublication(tx, {
              familyId: tenant.familyId,
              houseId,
              kind,
              token: minted.token,
              tokenHash: minted.tokenHash,
              createdBy: tenant.accountId,
            });
            await trace(tx, tenant, {
              action: 'print.publication.created',
              publicationId: row.id,
              houseId,
              version: row.version,
              op: 'create',
              kind,
              active: true,
            });
            return { publication: view(row), created: true };
          }),
        );
      try {
        return await prepare();
      } catch (error) {
        if (!(error instanceof ProblemError) || error.code !== 'duplicate') {
          throw error;
        }
        const existing = await inFamily(tenant, (tx) => repo.findActive(tx, tenant.familyId, houseId, kind));
        if (existing === null) {
          throw error;
        }
        return { publication: view(existing), created: false };
      }
    },

    async revoke(tenant, houseId, publicationId, expectedVersion) {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findPublication(tx, tenant.familyId, houseId, publicationId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          if (current.version !== expectedVersion) {
            throw new ProblemError('version_conflict', { currentVersion: current.version });
          }
          if (current.revokedAt !== null) {
            return view(current);
          }
          const revoked = await repo.revokePublication(
            tx,
            { familyId: tenant.familyId, houseId, publicationId, expectedVersion },
            tenant.accountId,
          );
          if (revoked === null) {
            const again = await repo.findPublication(tx, tenant.familyId, houseId, publicationId);
            throw new ProblemError('version_conflict', { currentVersion: again?.version ?? current.version });
          }
          await trace(tx, tenant, {
            action: 'print.publication.revoked',
            publicationId: revoked.id,
            houseId,
            version: revoked.version,
            op: 'update',
            kind: revoked.kind,
            active: false,
          });
          return view(revoked);
        }),
      );
    },

    async openHousePage(token, deviceLabel) {
      const opened = await open(token, 'house_page', deviceLabel, async (tx, familyId, houseId) => {
        const page = await repo.loadHousePage(tx, familyId, houseId);
        if (page === null) {
          return null;
        }
        return { ...page, mark: await branding.markForFamily(tx, familyId) };
      });
      if (opened === null) {
        throw new ProblemError('not_found');
      }
      return opened;
    },

    async openRescueSheet(token, deviceLabel) {
      const opened = await open(token, 'rescue_sheet', deviceLabel, async (tx, familyId, houseId) => {
        const page = await repo.loadRescueSheet(tx, familyId, houseId);
        if (page === null) {
          return null;
        }
        return { ...page, mark: await branding.markForFamily(tx, familyId) };
      });
      if (opened === null) {
        throw new ProblemError('not_found');
      }
      return opened;
    },
  };

  /**
   * Opens a public page. The reading is committed even when the code is revoked,
   * so the family still sees that someone tried.
   */
  async function open<T>(
    token: string,
    kind: PublicationKind,
    deviceLabel: DeviceLabel | null,
    load: (tx: Transaction, familyId: string, houseId: string) => Promise<T | null>,
  ): Promise<T | null> {
    const result = await withContext(db, { principal: system }, async (tx) => {
      const hit = await repo.findByToken(tx, hashToken(token));
      if (hit === null) {
        return { state: 'missing' as const };
      }
      if (hit.kind !== kind) {
        return { state: 'missing' as const };
      }
      await setFamilyContext(tx, system, hit.familyId);
      await repo.recordReading(tx, {
        familyId: hit.familyId,
        houseId: hit.houseId,
        kind: hit.kind,
        deviceLabel,
      });
      await repo.markScanned(tx, hit.familyId, hit.id);
      if (hit.revokedAt !== null) {
        return { state: 'revoked' as const };
      }
      const body = await load(tx, hit.familyId, hit.houseId);
      if (body === null) {
        return { state: 'missing' as const };
      }
      return { state: 'ok' as const, body };
    });
    if (result.state === 'revoked') {
      throw new ProblemError('gone');
    }
    return result.state === 'ok' ? result.body : null;
  }
}
