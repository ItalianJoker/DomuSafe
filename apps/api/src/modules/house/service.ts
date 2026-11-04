import {
  currencySchema,
  decide,
  encodeCursor,
  type Contact,
  type CreateContactRequest,
  type CreateGuideEntryRequest,
  type CreateMaintenanceTaskRequest,
  type CreateShutoffRequest,
  type CreateUtilityRequest,
  type CreateWasteCollectionRequest,
  type GuideEntry,
  type GuestView,
  type MaintenanceTask,
  type Permission,
  type Sealed,
  type Shutoff,
  type UpdateContactRequest,
  type UpdateGuideEntryRequest,
  type UpdateMaintenanceTaskRequest,
  type UpdateShutoffRequest,
  type UpdateUtilityRequest,
  type UpdateWasteCollectionRequest,
  type Utility,
  type WasteCollection,
} from '@domusafe/contracts';
import { fromBase64Url, toBase64Url } from '@domusafe/crypto';
import { recordAudit, recordRevision, withContext, type Database, type Transaction } from '@domusafe/db';
import { ProblemError, classifyDatabaseError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import * as repo from './repository.js';

/** One page of a list. */
export interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

interface Envelope {
  readonly scopeId: string;
  readonly keyVersion: number;
  readonly dek: Uint8Array<ArrayBuffer>;
  readonly payload: Uint8Array<ArrayBuffer>;
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

function guideWritePermission(audience: GuideEntry['audience']): Permission {
  return audience === 'guest' ? 'house.guest_view.write' : 'house.technical.write';
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
      throw new ProblemError(
        failure.constraint === 'guide_envelope_scope' || failure.constraint === 'utility_envelope_scope'
          ? 'envelope_invalid'
          : 'domain_rule_violated',
        { detail: `Constraint ${failure.constraint ?? 'check'} violated` },
      );
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

function money(
  amount: number | null,
  currency: string | null,
): { amountMinor: number; currency: NonNullable<Utility['estimatedCost']>['currency'] } | null {
  if (amount === null || currency === null) {
    return null;
  }
  const parsed = currencySchema.safeParse(currency);
  if (!parsed.success) {
    throw new Error('Stored currency is not in the catalogue');
  }
  return { amountMinor: amount, currency: parsed.data };
}

function sealedOf(row: {
  readonly encScopeId: string | null;
  readonly encKeyVersion: number | null;
  readonly encDek: Uint8Array<ArrayBuffer> | null;
  readonly encPayload: Uint8Array<ArrayBuffer> | null;
}): Sealed | null {
  if (
    row.encScopeId === null ||
    row.encKeyVersion === null ||
    row.encDek === null ||
    row.encPayload === null
  ) {
    return null;
  }
  return {
    scopeId: row.encScopeId,
    keyVersion: row.encKeyVersion,
    dek: toBase64Url(row.encDek),
    payload: toBase64Url(row.encPayload),
  };
}

function envelopeOf(row: {
  readonly encScopeId: string | null;
  readonly encKeyVersion: number | null;
  readonly encDek: Uint8Array<ArrayBuffer> | null;
  readonly encPayload: Uint8Array<ArrayBuffer> | null;
}): Envelope | undefined {
  if (
    row.encScopeId === null ||
    row.encKeyVersion === null ||
    row.encDek === null ||
    row.encPayload === null
  ) {
    return undefined;
  }
  return {
    scopeId: row.encScopeId,
    keyVersion: row.encKeyVersion,
    dek: row.encDek,
    payload: row.encPayload,
  };
}

function guideView(row: repo.GuideEntryRow): GuideEntry {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    audience: row.audience,
    topic: row.topic,
    title: row.title,
    body: row.body,
    sortOrder: row.sortOrder,
    sealed: sealedOf(row),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function shutoffView(row: repo.ShutoffRow): Shutoff {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    kind: row.kind,
    location: row.location,
    instructions: row.instructions,
    visibleToGuests: row.visibleToGuests,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function wasteView(row: repo.WasteRow): WasteCollection {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    fraction: row.fraction,
    rrule: row.rrule,
    collectionTime: row.collectionTime,
    instructions: row.instructions,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function contactView(row: repo.ContactRow): Contact {
  return {
    id: row.id,
    familyId: row.familyId,
    visibility: row.visibility,
    houseId: row.houseId,
    kind: row.kind,
    trade: row.trade,
    displayName: row.displayName,
    company: row.company,
    phone: row.phone,
    email: row.email,
    website: row.website,
    address: row.address,
    notes: row.notes,
    rating: row.rating,
    visibleToGuests: row.visibleToGuests,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function utilityView(row: repo.UtilityRow): Utility {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    kind: row.kind,
    providerName: row.providerName,
    customerCode: row.customerCode,
    contractCode: row.contractCode,
    supplyPointCode: row.supplyPointCode,
    tariffName: row.tariffName,
    startDate: row.startDate,
    renewalDate: row.renewalDate,
    billingFrequency: row.billingFrequency,
    estimatedCost: money(row.estimatedCostMinor, row.currency),
    autopay: row.autopay,
    notes: row.notes,
    sealed: sealedOf(row),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function maintenanceView(row: repo.MaintenanceRow): MaintenanceTask {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    contactId: row.contactId,
    category: row.category,
    priority: row.priority,
    title: row.title,
    description: row.description,
    rrule: row.rrule,
    nextDueDate: row.nextDueDate,
    lastDoneOn: row.lastDoneOn,
    estimatedCost: money(row.estimatedCostMinor, row.currency),
    active: row.active,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function pageOf<T extends { readonly id: string }>(
  rows: readonly T[],
  limit: number,
  cursorOf: (row: T) => readonly [string | number, string],
): Page<T> {
  const items = [...rows.slice(0, limit)];
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last !== undefined ? encodeCursor(cursorOf(last)) : null,
  };
}

async function requireHouse(tx: Transaction, familyId: string, houseId: string): Promise<void> {
  if ((await repo.findHouse(tx, familyId, houseId)) === null) {
    throw new ProblemError('not_found');
  }
}

async function bindEnvelope(
  tx: Transaction,
  familyId: string,
  expected: { readonly kind: 'house_guest' | 'house_technical' | 'family'; readonly houseId: string | null },
  sealed: Sealed | null,
): Promise<Envelope | null> {
  if (sealed === null) {
    return null;
  }
  const scope = await repo.findKeyScope(tx, familyId, sealed.scopeId);
  if (scope?.kind !== expected.kind || scope.houseId !== expected.houseId) {
    throw new ProblemError('envelope_invalid');
  }
  if (scope.currentVersion !== sealed.keyVersion) {
    throw new ProblemError('key_version_stale', { currentKeyVersion: scope.currentVersion });
  }
  let dek: Uint8Array<ArrayBuffer>;
  let payload: Uint8Array<ArrayBuffer>;
  try {
    dek = fromBase64Url(sealed.dek);
    payload = fromBase64Url(sealed.payload);
  } catch {
    throw new ProblemError('envelope_invalid');
  }
  if (dek.length < 29 || payload.length < 29 || payload.length > 262_144) {
    throw new ProblemError('envelope_invalid');
  }
  return { scopeId: sealed.scopeId, keyVersion: sealed.keyVersion, dek, payload };
}

function costColumns(cost: { readonly amountMinor: number; readonly currency: string } | null | undefined): {
  estimatedCostMinor?: number | null;
  currency?: string | null;
} {
  if (cost === undefined) {
    return {};
  }
  if (cost === null) {
    return { estimatedCostMinor: null, currency: null };
  }
  return { estimatedCostMinor: cost.amountMinor, currency: cost.currency };
}

/**
 * Casa use cases: guest manual, cutoffs, waste, artisans, utilities and the boiler deadline.
 * This is the only place that opens transactions for those tables.
 *
 * Preconditions: the caller is already a resolved tenant.
 * Postconditions: writes append an audit event and a class C revision in the same transaction.
 * Data contract: Wi-Fi passwords and payment secrets are accepted only as sealed envelopes.
 *
 * @param db - Database bound to the `domusafe_app` pool.
 * @param now - Clock, injectable for tests.
 * @returns The service.
 */
export function createHouseService(db: Database, now: () => Date = () => new Date()) {
  async function inFamily<T>(tenant: TenantContext, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, work);
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
      readonly houseId?: string | null;
      readonly ownerAccountId?: string | null;
      readonly envelope?: Envelope;
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
      ...(input.houseId === undefined ? {} : { houseId: input.houseId }),
      ...(input.ownerAccountId === undefined ? {} : { ownerAccountId: input.ownerAccountId }),
      ...(input.envelope === undefined ? {} : { envelope: input.envelope }),
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

  async function projectGuestView(tenant: TenantContext, houseId: string): Promise<GuestView> {
    return inFamily(tenant, async (tx) => {
      await requireHouse(tx, tenant.familyId, houseId);
      const entries = await repo.listGuestGuides(tx, tenant.familyId, houseId);
      const waste = await repo.listGuestWaste(tx, tenant.familyId, houseId);
      return {
        houseId,
        entries: entries.map(guideView),
        wasteCollections: waste.map(wasteView),
      };
    });
  }

  return {
    /**
     * Lists manual entries. Callers without the technical permission only receive the guest audience.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param query - Page and optional audience.
     * @returns One page.
     */
    async listGuideEntries(
      tenant: TenantContext,
      houseId: string,
      query: {
        readonly limit: number;
        readonly after: readonly [number, string] | null;
        readonly audience?: GuideEntry['audience'];
      },
    ): Promise<Page<GuideEntry>> {
      if (query.audience === 'technical') {
        assertAllowed(tenant, 'house.technical.read');
      }
      const audience =
        query.audience === undefined && !allows(tenant, 'house.technical.read') ? 'guest' : query.audience;
      return inFamily(tenant, async (tx) => {
        await requireHouse(tx, tenant.familyId, houseId);
        const rows = await repo.listGuides(tx, {
          familyId: tenant.familyId,
          houseId,
          limit: query.limit,
          after: query.after,
          ...(audience === undefined ? {} : { audience }),
        });
        return pageOf(rows.map(guideView), query.limit, (row) => [row.sortOrder, row.id] as const);
      });
    },

    /**
     * Creates a manual entry. A secret is stored only when a matching scope envelope is sent.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param input - Validated body.
     * @returns The entry.
     */
    async createGuideEntry(
      tenant: TenantContext,
      houseId: string,
      input: CreateGuideEntryRequest,
    ): Promise<GuideEntry> {
      assertAllowed(tenant, guideWritePermission(input.audience));
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          await requireHouse(tx, tenant.familyId, houseId);
          const envelope = await bindEnvelope(
            tx,
            tenant.familyId,
            {
              kind: input.audience === 'guest' ? 'house_guest' : 'house_technical',
              houseId,
            },
            input.sealed ?? null,
          );
          const row = await repo.insertGuide(tx, {
            id: input.id,
            familyId: tenant.familyId,
            houseId,
            audience: input.audience,
            topic: input.topic,
            title: input.title,
            body: input.body,
            sortOrder: input.sortOrder,
            createdBy: tenant.accountId,
            envelope,
          });
          const stored = envelopeOf(row);
          await trace(tx, tenant, {
            action: 'house.guide_entry.created',
            resourceType: 'house_guide_entries',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            houseId,
            data: {
              audience: row.audience,
              topic: row.topic,
              title: row.title,
              body: row.body,
              sortOrder: row.sortOrder,
            },
            ...(stored === undefined ? {} : { envelope: stored }),
          });
          return guideView(row);
        }),
      );
    },

    /**
     * Reads one manual entry. A technical entry is hidden from callers who cannot read that audience.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param entryId - Entry id.
     * @returns The entry.
     */
    async getGuideEntry(tenant: TenantContext, houseId: string, entryId: string): Promise<GuideEntry> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.findGuide(tx, { familyId: tenant.familyId, houseId, entryId });
        if (row === null || (row.audience === 'technical' && !allows(tenant, 'house.technical.read'))) {
          throw new ProblemError('not_found');
        }
        return guideView(row);
      });
    },

    /**
     * Updates a manual entry with optimistic concurrency.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param entryId - Entry id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Validated body.
     * @returns The updated entry.
     */
    async updateGuideEntry(
      tenant: TenantContext,
      houseId: string,
      entryId: string,
      expectedVersion: number,
      patch: UpdateGuideEntryRequest,
    ): Promise<GuideEntry> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findGuide(tx, { familyId: tenant.familyId, houseId, entryId });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const audience = patch.audience ?? current.audience;
          assertAllowed(tenant, guideWritePermission(audience));
          if (audience !== current.audience) {
            assertAllowed(tenant, guideWritePermission(current.audience));
          }
          let envelope: Envelope | null | undefined;
          if (patch.sealed === undefined) {
            if (audience !== current.audience && current.encPayload !== null) {
              throw new ProblemError('domain_rule_violated', {
                detail: 'Replace the encrypted secret when the audience changes',
              });
            }
            envelope = undefined;
          } else {
            envelope = await bindEnvelope(
              tx,
              tenant.familyId,
              { kind: audience === 'guest' ? 'house_guest' : 'house_technical', houseId },
              patch.sealed,
            );
          }
          const updated = await repo.updateGuide(
            tx,
            { familyId: tenant.familyId, houseId, entryId, expectedVersion },
            {
              ...(patch.audience === undefined ? {} : { audience: patch.audience }),
              ...(patch.topic === undefined ? {} : { topic: patch.topic }),
              ...(patch.title === undefined ? {} : { title: patch.title }),
              ...(patch.body === undefined ? {} : { body: patch.body }),
              ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }),
              ...(envelope === undefined ? {} : { envelope }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          const stored = envelopeOf(updated);
          await trace(tx, tenant, {
            action: 'house.guide_entry.updated',
            resourceType: 'house_guide_entries',
            resourceId: entryId,
            version: updated.version,
            op: 'update',
            houseId,
            data: {
              audience: updated.audience,
              topic: updated.topic,
              title: updated.title,
              body: updated.body,
              sortOrder: updated.sortOrder,
            },
            ...(stored === undefined ? {} : { envelope: stored }),
          });
          return guideView(updated);
        }),
      );
    },

    /**
     * Moves a manual entry to the trash.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param entryId - Entry id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deleteGuideEntry(
      tenant: TenantContext,
      houseId: string,
      entryId: string,
      expectedVersion: number,
    ): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findGuide(tx, { familyId: tenant.familyId, houseId, entryId });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          assertAllowed(tenant, guideWritePermission(current.audience));
          const deleted = await repo.updateGuide(
            tx,
            { familyId: tenant.familyId, houseId, entryId, expectedVersion },
            { deletedAt: now(), updatedBy: tenant.accountId },
          );
          if (deleted === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'house.guide_entry.deleted',
            resourceType: 'house_guide_entries',
            resourceId: entryId,
            version: deleted.version,
            op: 'delete',
            houseId,
            data: {
              audience: deleted.audience,
              topic: deleted.topic,
              deletedAt: deleted.deletedAt?.toISOString() ?? null,
            },
          });
        }),
      );
    },

    /**
     * Projects the guest manual and the waste calendar.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @returns Entries with audience guest, plus waste rules.
     */
    getGuestView: projectGuestView,

    /**
     * Same projection as {@link projectGuestView}, used by the "what the guest sees" control.
     *
     * @param tenant - Resolved tenant with `house.write`.
     * @param houseId - House id.
     * @returns The guest projection.
     */
    previewGuestView: projectGuestView,

    /**
     * Lists cutoffs.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param page - Limit and cursor.
     * @returns One page.
     */
    async listShutoffs(
      tenant: TenantContext,
      houseId: string,
      page: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<Shutoff>> {
      return inFamily(tenant, async (tx) => {
        await requireHouse(tx, tenant.familyId, houseId);
        const rows = await repo.listShutoffs(tx, { familyId: tenant.familyId, houseId, ...page });
        return pageOf(rows.map(shutoffView), page.limit, (row) => [row.createdAt, row.id]);
      });
    },

    /**
     * Creates a cutoff.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param input - Validated body.
     * @returns The cutoff.
     */
    async createShutoff(
      tenant: TenantContext,
      houseId: string,
      input: CreateShutoffRequest,
    ): Promise<Shutoff> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          await requireHouse(tx, tenant.familyId, houseId);
          const row = await repo.insertShutoff(tx, {
            familyId: tenant.familyId,
            houseId,
            kind: input.kind,
            location: input.location,
            instructions: input.instructions,
            visibleToGuests: input.visibleToGuests,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            action: 'house.shutoff.created',
            resourceType: 'house_shutoffs',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            houseId,
            data: {
              kind: row.kind,
              location: row.location,
              instructions: row.instructions,
              visibleToGuests: row.visibleToGuests,
            },
          });
          return shutoffView(row);
        }),
      );
    },

    /**
     * Reads one cutoff.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param shutoffId - Cutoff id.
     * @returns The cutoff.
     */
    async getShutoff(tenant: TenantContext, houseId: string, shutoffId: string): Promise<Shutoff> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.findShutoff(tx, { familyId: tenant.familyId, houseId, shutoffId });
        if (row === null) {
          throw new ProblemError('not_found');
        }
        return shutoffView(row);
      });
    },

    /**
     * Updates a cutoff.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param shutoffId - Cutoff id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Validated body.
     * @returns The cutoff.
     */
    async updateShutoff(
      tenant: TenantContext,
      houseId: string,
      shutoffId: string,
      expectedVersion: number,
      patch: UpdateShutoffRequest,
    ): Promise<Shutoff> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findShutoff(tx, { familyId: tenant.familyId, houseId, shutoffId });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const updated = await repo.updateShutoff(
            tx,
            { familyId: tenant.familyId, houseId, shutoffId, expectedVersion },
            {
              ...(patch.kind === undefined ? {} : { kind: patch.kind }),
              ...(patch.location === undefined ? {} : { location: patch.location }),
              ...(patch.instructions === undefined ? {} : { instructions: patch.instructions }),
              ...(patch.visibleToGuests === undefined ? {} : { visibleToGuests: patch.visibleToGuests }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'house.shutoff.updated',
            resourceType: 'house_shutoffs',
            resourceId: shutoffId,
            version: updated.version,
            op: 'update',
            houseId,
            data: {
              kind: updated.kind,
              location: updated.location,
              visibleToGuests: updated.visibleToGuests,
            },
          });
          return shutoffView(updated);
        }),
      );
    },

    /**
     * Moves a cutoff to the trash.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param shutoffId - Cutoff id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deleteShutoff(
      tenant: TenantContext,
      houseId: string,
      shutoffId: string,
      expectedVersion: number,
    ): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findShutoff(tx, { familyId: tenant.familyId, houseId, shutoffId });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const deleted = await repo.updateShutoff(
            tx,
            { familyId: tenant.familyId, houseId, shutoffId, expectedVersion },
            { deletedAt: now(), updatedBy: tenant.accountId },
          );
          if (deleted === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'house.shutoff.deleted',
            resourceType: 'house_shutoffs',
            resourceId: shutoffId,
            version: deleted.version,
            op: 'delete',
            houseId,
            data: { kind: deleted.kind, deletedAt: deleted.deletedAt?.toISOString() ?? null },
          });
        }),
      );
    },

    /**
     * Lists waste rules.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param page - Limit and cursor.
     * @returns One page.
     */
    async listWaste(
      tenant: TenantContext,
      houseId: string,
      page: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<WasteCollection>> {
      return inFamily(tenant, async (tx) => {
        await requireHouse(tx, tenant.familyId, houseId);
        const rows = await repo.listWaste(tx, { familyId: tenant.familyId, houseId, ...page });
        return pageOf(rows.map(wasteView), page.limit, (row) => [row.createdAt, row.id]);
      });
    },

    /**
     * Creates a waste rule.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param input - Validated body.
     * @returns The rule.
     */
    async createWaste(
      tenant: TenantContext,
      houseId: string,
      input: CreateWasteCollectionRequest,
    ): Promise<WasteCollection> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          await requireHouse(tx, tenant.familyId, houseId);
          const row = await repo.insertWaste(tx, {
            familyId: tenant.familyId,
            houseId,
            fraction: input.fraction,
            rrule: input.rrule ?? null,
            collectionTime: input.collectionTime ?? null,
            instructions: input.instructions ?? null,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            action: 'house.waste.created',
            resourceType: 'waste_collections',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            houseId,
            data: { fraction: row.fraction, rrule: row.rrule, collectionTime: row.collectionTime },
          });
          return wasteView(row);
        }),
      );
    },

    /**
     * Reads one waste rule.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param collectionId - Collection id.
     * @returns The rule.
     */
    async getWaste(tenant: TenantContext, houseId: string, collectionId: string): Promise<WasteCollection> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.findWaste(tx, { familyId: tenant.familyId, houseId, collectionId });
        if (row === null) {
          throw new ProblemError('not_found');
        }
        return wasteView(row);
      });
    },

    /**
     * Updates a waste rule.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param collectionId - Collection id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Validated body.
     * @returns The rule.
     */
    async updateWaste(
      tenant: TenantContext,
      houseId: string,
      collectionId: string,
      expectedVersion: number,
      patch: UpdateWasteCollectionRequest,
    ): Promise<WasteCollection> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findWaste(tx, { familyId: tenant.familyId, houseId, collectionId });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const updated = await repo.updateWaste(
            tx,
            { familyId: tenant.familyId, houseId, collectionId, expectedVersion },
            {
              ...(patch.fraction === undefined ? {} : { fraction: patch.fraction }),
              ...(patch.rrule === undefined ? {} : { rrule: patch.rrule }),
              ...(patch.collectionTime === undefined ? {} : { collectionTime: patch.collectionTime }),
              ...(patch.instructions === undefined ? {} : { instructions: patch.instructions }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'house.waste.updated',
            resourceType: 'waste_collections',
            resourceId: collectionId,
            version: updated.version,
            op: 'update',
            houseId,
            data: { fraction: updated.fraction, rrule: updated.rrule },
          });
          return wasteView(updated);
        }),
      );
    },

    /**
     * Deletes a waste rule. There is no trash for this table.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param collectionId - Collection id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deleteWaste(
      tenant: TenantContext,
      houseId: string,
      collectionId: string,
      expectedVersion: number,
    ): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findWaste(tx, { familyId: tenant.familyId, houseId, collectionId });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const deleted = await repo.deleteWaste(tx, {
            familyId: tenant.familyId,
            houseId,
            collectionId,
            expectedVersion,
          });
          if (deleted === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'house.waste.deleted',
            resourceType: 'waste_collections',
            resourceId: collectionId,
            version: deleted.version + 1,
            op: 'delete',
            houseId,
            data: { fraction: deleted.fraction },
          });
        }),
      );
    },

    /**
     * Lists contacts. Artisans are `kind = craftsman`.
     *
     * @param tenant - Resolved tenant.
     * @param query - Page and optional kind or house.
     * @returns One page.
     */
    async listContacts(
      tenant: TenantContext,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly kind?: Contact['kind'];
        readonly houseId?: string;
      },
    ): Promise<Page<Contact>> {
      return inFamily(tenant, async (tx) => {
        if (query.houseId !== undefined) {
          await requireHouse(tx, tenant.familyId, query.houseId);
        }
        const rows = await repo.listContacts(tx, {
          familyId: tenant.familyId,
          limit: query.limit,
          after: query.after,
          ...(query.kind === undefined ? {} : { kind: query.kind }),
          ...(query.houseId === undefined ? {} : { houseId: query.houseId }),
        });
        return pageOf(rows.map(contactView), query.limit, (row) => [row.createdAt, row.id]);
      });
    },

    /**
     * Creates a contact. A personal contact is owned by the caller.
     *
     * @param tenant - Resolved tenant.
     * @param input - Validated body.
     * @returns The contact.
     */
    async createContact(tenant: TenantContext, input: CreateContactRequest): Promise<Contact> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const houseId = input.houseId ?? null;
          if (houseId !== null) {
            await requireHouse(tx, tenant.familyId, houseId);
          }
          const row = await repo.insertContact(tx, {
            familyId: tenant.familyId,
            visibility: input.visibility,
            ownerAccountId: input.visibility === 'personal' ? tenant.accountId : null,
            houseId,
            kind: input.kind,
            trade: input.trade ?? null,
            displayName: input.displayName,
            company: input.company ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            website: input.website ?? null,
            address: input.address ?? null,
            notes: input.notes ?? null,
            rating: input.rating ?? null,
            visibleToGuests: input.visibleToGuests,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            action: 'house.contact.created',
            resourceType: 'contacts',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            ...(houseId === null ? {} : { houseId }),
            ...(row.ownerAccountId === null ? {} : { ownerAccountId: row.ownerAccountId }),
            data: { kind: row.kind, displayName: row.displayName, visibleToGuests: row.visibleToGuests },
          });
          return contactView(row);
        }),
      );
    },

    /**
     * Reads one contact.
     *
     * @param tenant - Resolved tenant.
     * @param contactId - Contact id.
     * @returns The contact.
     */
    async getContact(tenant: TenantContext, contactId: string): Promise<Contact> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.findContact(tx, tenant.familyId, contactId);
        if (row === null) {
          throw new ProblemError('not_found');
        }
        return contactView(row);
      });
    },

    /**
     * Updates a contact.
     *
     * @param tenant - Resolved tenant.
     * @param contactId - Contact id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Validated body.
     * @returns The contact.
     */
    async updateContact(
      tenant: TenantContext,
      contactId: string,
      expectedVersion: number,
      patch: UpdateContactRequest,
    ): Promise<Contact> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findContact(tx, tenant.familyId, contactId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          if (patch.houseId !== undefined && patch.houseId !== null) {
            await requireHouse(tx, tenant.familyId, patch.houseId);
          }
          const visibility = patch.visibility ?? current.visibility;
          const updated = await repo.updateContact(
            tx,
            { familyId: tenant.familyId, contactId, expectedVersion },
            {
              ...(patch.visibility === undefined
                ? {}
                : {
                    visibility: patch.visibility,
                    ownerAccountId: patch.visibility === 'personal' ? tenant.accountId : null,
                  }),
              ...(patch.houseId === undefined ? {} : { houseId: patch.houseId }),
              ...(patch.kind === undefined ? {} : { kind: patch.kind }),
              ...(patch.trade === undefined ? {} : { trade: patch.trade }),
              ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
              ...(patch.company === undefined ? {} : { company: patch.company }),
              ...(patch.phone === undefined ? {} : { phone: patch.phone }),
              ...(patch.email === undefined ? {} : { email: patch.email }),
              ...(patch.website === undefined ? {} : { website: patch.website }),
              ...(patch.address === undefined ? {} : { address: patch.address }),
              ...(patch.notes === undefined ? {} : { notes: patch.notes }),
              ...(patch.rating === undefined ? {} : { rating: patch.rating }),
              ...(patch.visibleToGuests === undefined ? {} : { visibleToGuests: patch.visibleToGuests }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'house.contact.updated',
            resourceType: 'contacts',
            resourceId: contactId,
            version: updated.version,
            op: 'update',
            ...(updated.houseId === null ? {} : { houseId: updated.houseId }),
            ...(updated.ownerAccountId === null ? {} : { ownerAccountId: updated.ownerAccountId }),
            data: { kind: updated.kind, displayName: updated.displayName, visibility },
          });
          return contactView(updated);
        }),
      );
    },

    /**
     * Moves a contact to the trash.
     *
     * @param tenant - Resolved tenant.
     * @param contactId - Contact id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deleteContact(tenant: TenantContext, contactId: string, expectedVersion: number): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findContact(tx, tenant.familyId, contactId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const deleted = await repo.updateContact(
            tx,
            { familyId: tenant.familyId, contactId, expectedVersion },
            { deletedAt: now(), updatedBy: tenant.accountId },
          );
          if (deleted === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'house.contact.deleted',
            resourceType: 'contacts',
            resourceId: contactId,
            version: deleted.version,
            op: 'delete',
            ...(deleted.houseId === null ? {} : { houseId: deleted.houseId }),
            data: { kind: deleted.kind },
          });
        }),
      );
    },

    /**
     * Lists utility contracts of a house. Included in the Free plan.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param page - Limit and cursor.
     * @returns One page.
     */
    async listUtilities(
      tenant: TenantContext,
      houseId: string,
      page: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<Utility>> {
      return inFamily(tenant, async (tx) => {
        await requireHouse(tx, tenant.familyId, houseId);
        const rows = await repo.listUtilities(tx, { familyId: tenant.familyId, houseId, ...page });
        return pageOf(rows.map(utilityView), page.limit, (row) => [row.createdAt, row.id]);
      });
    },

    /**
     * Creates a utility contract.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param input - Validated body.
     * @returns The contract.
     */
    async createUtility(
      tenant: TenantContext,
      houseId: string,
      input: CreateUtilityRequest,
    ): Promise<Utility> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          await requireHouse(tx, tenant.familyId, houseId);
          const envelope = await bindEnvelope(
            tx,
            tenant.familyId,
            { kind: 'family', houseId: null },
            input.sealed ?? null,
          );
          const row = await repo.insertUtility(tx, {
            id: input.id,
            familyId: tenant.familyId,
            houseId,
            kind: input.kind,
            providerName: input.providerName,
            customerCode: input.customerCode ?? null,
            contractCode: input.contractCode ?? null,
            supplyPointCode: input.supplyPointCode ?? null,
            tariffName: input.tariffName ?? null,
            startDate: input.startDate ?? null,
            renewalDate: input.renewalDate ?? null,
            billingFrequency: input.billingFrequency ?? null,
            estimatedCostMinor: input.estimatedCost?.amountMinor ?? null,
            currency: input.estimatedCost?.currency ?? null,
            autopay: input.autopay,
            notes: input.notes ?? null,
            createdBy: tenant.accountId,
            envelope,
          });
          const stored = envelopeOf(row);
          await trace(tx, tenant, {
            action: 'house.utility.created',
            resourceType: 'utilities',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            houseId,
            data: { kind: row.kind, providerName: row.providerName, autopay: row.autopay },
            ...(stored === undefined ? {} : { envelope: stored }),
          });
          return utilityView(row);
        }),
      );
    },

    /**
     * Reads one utility.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param utilityId - Utility id.
     * @returns The contract.
     */
    async getUtility(tenant: TenantContext, houseId: string, utilityId: string): Promise<Utility> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.findUtility(tx, { familyId: tenant.familyId, houseId, utilityId });
        if (row === null) {
          throw new ProblemError('not_found');
        }
        return utilityView(row);
      });
    },

    /**
     * Updates a utility.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param utilityId - Utility id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Validated body.
     * @returns The contract.
     */
    async updateUtility(
      tenant: TenantContext,
      houseId: string,
      utilityId: string,
      expectedVersion: number,
      patch: UpdateUtilityRequest,
    ): Promise<Utility> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findUtility(tx, { familyId: tenant.familyId, houseId, utilityId });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const envelope =
            patch.sealed === undefined
              ? undefined
              : await bindEnvelope(tx, tenant.familyId, { kind: 'family', houseId: null }, patch.sealed);
          const updated = await repo.updateUtility(
            tx,
            { familyId: tenant.familyId, houseId, utilityId, expectedVersion },
            {
              ...(patch.kind === undefined ? {} : { kind: patch.kind }),
              ...(patch.providerName === undefined ? {} : { providerName: patch.providerName }),
              ...(patch.customerCode === undefined ? {} : { customerCode: patch.customerCode }),
              ...(patch.contractCode === undefined ? {} : { contractCode: patch.contractCode }),
              ...(patch.supplyPointCode === undefined ? {} : { supplyPointCode: patch.supplyPointCode }),
              ...(patch.tariffName === undefined ? {} : { tariffName: patch.tariffName }),
              ...(patch.startDate === undefined ? {} : { startDate: patch.startDate }),
              ...(patch.renewalDate === undefined ? {} : { renewalDate: patch.renewalDate }),
              ...(patch.billingFrequency === undefined ? {} : { billingFrequency: patch.billingFrequency }),
              ...costColumns(patch.estimatedCost),
              ...(patch.autopay === undefined ? {} : { autopay: patch.autopay }),
              ...(patch.notes === undefined ? {} : { notes: patch.notes }),
              ...(envelope === undefined ? {} : { envelope }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          const stored = envelopeOf(updated);
          await trace(tx, tenant, {
            action: 'house.utility.updated',
            resourceType: 'utilities',
            resourceId: utilityId,
            version: updated.version,
            op: 'update',
            houseId,
            data: { kind: updated.kind, providerName: updated.providerName },
            ...(stored === undefined ? {} : { envelope: stored }),
          });
          return utilityView(updated);
        }),
      );
    },

    /**
     * Moves a utility to the trash.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param utilityId - Utility id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deleteUtility(
      tenant: TenantContext,
      houseId: string,
      utilityId: string,
      expectedVersion: number,
    ): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findUtility(tx, { familyId: tenant.familyId, houseId, utilityId });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const deleted = await repo.updateUtility(
            tx,
            { familyId: tenant.familyId, houseId, utilityId, expectedVersion },
            { deletedAt: now(), updatedBy: tenant.accountId },
          );
          if (deleted === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'house.utility.deleted',
            resourceType: 'utilities',
            resourceId: utilityId,
            version: deleted.version,
            op: 'delete',
            houseId,
            data: { kind: deleted.kind },
          });
        }),
      );
    },

    /**
     * Lists maintenance tasks. The boiler check is a heating task.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param query - Page and optional category.
     * @returns One page.
     */
    async listMaintenance(
      tenant: TenantContext,
      houseId: string,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly category?: MaintenanceTask['category'];
      },
    ): Promise<Page<MaintenanceTask>> {
      return inFamily(tenant, async (tx) => {
        await requireHouse(tx, tenant.familyId, houseId);
        const rows = await repo.listMaintenance(tx, {
          familyId: tenant.familyId,
          houseId,
          limit: query.limit,
          after: query.after,
          ...(query.category === undefined ? {} : { category: query.category }),
        });
        return pageOf(rows.map(maintenanceView), query.limit, (row) => [row.createdAt, row.id]);
      });
    },

    /**
     * Creates a maintenance task.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param input - Validated body.
     * @returns The task.
     */
    async createMaintenance(
      tenant: TenantContext,
      houseId: string,
      input: CreateMaintenanceTaskRequest,
    ): Promise<MaintenanceTask> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          await requireHouse(tx, tenant.familyId, houseId);
          const contactId = input.contactId ?? null;
          if (contactId !== null && (await repo.findContact(tx, tenant.familyId, contactId)) === null) {
            throw new ProblemError('not_found');
          }
          const row = await repo.insertMaintenance(tx, {
            familyId: tenant.familyId,
            houseId,
            contactId,
            category: input.category,
            priority: input.priority,
            title: input.title,
            description: input.description ?? null,
            rrule: input.rrule ?? null,
            nextDueDate: input.nextDueDate ?? null,
            lastDoneOn: input.lastDoneOn ?? null,
            estimatedCostMinor: input.estimatedCost?.amountMinor ?? null,
            currency: input.estimatedCost?.currency ?? null,
            active: input.active,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            action: 'house.maintenance.created',
            resourceType: 'maintenance_tasks',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            houseId,
            data: {
              category: row.category,
              title: row.title,
              nextDueDate: row.nextDueDate,
              priority: row.priority,
            },
          });
          return maintenanceView(row);
        }),
      );
    },

    /**
     * Reads one maintenance task.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param taskId - Task id.
     * @returns The task.
     */
    async getMaintenance(tenant: TenantContext, houseId: string, taskId: string): Promise<MaintenanceTask> {
      return inFamily(tenant, async (tx) => {
        const row = await repo.findMaintenance(tx, { familyId: tenant.familyId, houseId, taskId });
        if (row === null) {
          throw new ProblemError('not_found');
        }
        return maintenanceView(row);
      });
    },

    /**
     * Updates a maintenance task, including the boiler-check due date.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param taskId - Task id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Validated body.
     * @returns The task.
     */
    async updateMaintenance(
      tenant: TenantContext,
      houseId: string,
      taskId: string,
      expectedVersion: number,
      patch: UpdateMaintenanceTaskRequest,
    ): Promise<MaintenanceTask> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findMaintenance(tx, { familyId: tenant.familyId, houseId, taskId });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          if (patch.contactId !== undefined && patch.contactId !== null) {
            if ((await repo.findContact(tx, tenant.familyId, patch.contactId)) === null) {
              throw new ProblemError('not_found');
            }
          }
          const updated = await repo.updateMaintenance(
            tx,
            { familyId: tenant.familyId, houseId, taskId, expectedVersion },
            {
              ...(patch.contactId === undefined ? {} : { contactId: patch.contactId }),
              ...(patch.category === undefined ? {} : { category: patch.category }),
              ...(patch.priority === undefined ? {} : { priority: patch.priority }),
              ...(patch.title === undefined ? {} : { title: patch.title }),
              ...(patch.description === undefined ? {} : { description: patch.description }),
              ...(patch.rrule === undefined ? {} : { rrule: patch.rrule }),
              ...(patch.nextDueDate === undefined ? {} : { nextDueDate: patch.nextDueDate }),
              ...(patch.lastDoneOn === undefined ? {} : { lastDoneOn: patch.lastDoneOn }),
              ...costColumns(patch.estimatedCost),
              ...(patch.active === undefined ? {} : { active: patch.active }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'house.maintenance.updated',
            resourceType: 'maintenance_tasks',
            resourceId: taskId,
            version: updated.version,
            op: 'update',
            houseId,
            data: { category: updated.category, title: updated.title, nextDueDate: updated.nextDueDate },
          });
          return maintenanceView(updated);
        }),
      );
    },

    /**
     * Moves a maintenance task to the trash.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @param taskId - Task id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deleteMaintenance(
      tenant: TenantContext,
      houseId: string,
      taskId: string,
      expectedVersion: number,
    ): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findMaintenance(tx, { familyId: tenant.familyId, houseId, taskId });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const deleted = await repo.updateMaintenance(
            tx,
            { familyId: tenant.familyId, houseId, taskId, expectedVersion },
            { deletedAt: now(), updatedBy: tenant.accountId },
          );
          if (deleted === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'house.maintenance.deleted',
            resourceType: 'maintenance_tasks',
            resourceId: taskId,
            version: deleted.version,
            op: 'delete',
            houseId,
            data: { category: deleted.category, title: deleted.title },
          });
        }),
      );
    },
  };
}

/** House service interface. */
export type HouseService = ReturnType<typeof createHouseService>;
