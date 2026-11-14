import {
  calendarDateInTimeZone,
  encodeCursor,
  relationshipReminder,
  type CreateHandoverRequest,
  type CreateRelationshipRequest,
  type CreateVitalEntryRequest,
  type Handover,
  type PutResidentAboutRequest,
  type RelationshipEntry,
  type ResidentAboutCard,
  type UpdateHandoverRequest,
  type UpdateRelationshipRequest,
  type UpdateVitalEntryRequest,
  type VitalEntry,
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

function pageOfMeasured<TRow extends { measuredAt: Date; id: string }, TView>(
  rows: TRow[],
  limit: number,
  view: (row: TRow) => TView,
): Page<TView> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice.at(-1);
  return {
    items: slice.map(view),
    nextCursor: hasMore && last !== undefined ? encodeCursor([last.measuredAt.toISOString(), last.id]) : null,
  };
}

function pageOfPosted<TRow extends { postedAt: Date; id: string }, TView>(
  rows: TRow[],
  limit: number,
  view: (row: TRow) => TView,
): Page<TView> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice.at(-1);
  return {
    items: slice.map(view),
    nextCursor: hasMore && last !== undefined ? encodeCursor([last.postedAt.toISOString(), last.id]) : null,
  };
}

function pageOfNamed<TRow extends { displayName: string; id: string }, TView>(
  rows: TRow[],
  limit: number,
  view: (row: TRow) => TView,
): Page<TView> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice.at(-1);
  return {
    items: slice.map(view),
    nextCursor: hasMore && last !== undefined ? encodeCursor([last.displayName, last.id]) : null,
  };
}

function relationshipView(row: repo.RelationshipRow, today: string): RelationshipEntry {
  if (row.ownerAccountId === null) {
    throw new Error('Personal relationship row is missing an owner');
  }
  const reminder = relationshipReminder(row.lastContactOn, row.contactIntervalDays, today);
  return {
    id: row.id,
    familyId: row.familyId,
    ownerAccountId: row.ownerAccountId,
    displayName: row.displayName,
    relation: row.relation,
    lastContactOn: row.lastContactOn,
    contactIntervalDays: row.contactIntervalDays,
    notes: row.notes,
    nextReminderOn: reminder.nextReminderOn,
    reminderState: reminder.reminderState,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function numericOrNull(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('Stored numeric value is invalid');
  }
  return parsed;
}

function vitalView(row: repo.VitalEntryRow): VitalEntry {
  return {
    id: row.id,
    familyId: row.familyId,
    residentId: row.residentId,
    measuredAt: row.measuredAt.toISOString(),
    systolicMmhg: row.systolicMmhg,
    diastolicMmhg: row.diastolicMmhg,
    heartRateBpm: row.heartRateBpm,
    temperatureCelsius: numericOrNull(row.temperatureCelsius),
    bloodGlucoseMgDl: row.bloodGlucoseMgDl,
    weightKg: numericOrNull(row.weightKg),
    oxygenSaturationPercent: row.oxygenSaturationPercent,
    notes: row.notes,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function aboutView(row: repo.AboutCardRow): ResidentAboutCard {
  return {
    residentId: row.residentId,
    familyId: row.familyId,
    preferredName: row.preferredName,
    howToAddress: row.howToAddress,
    likes: row.likes,
    dislikes: row.dislikes,
    dailyRoutine: row.dailyRoutine,
    calmingTips: row.calmingTips,
    communicationTips: row.communicationTips,
    importantNotes: row.importantNotes,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function emptyAbout(familyId: string, residentId: string): ResidentAboutCard {
  const now = new Date(0).toISOString();
  return {
    residentId,
    familyId,
    preferredName: null,
    howToAddress: null,
    likes: [],
    dislikes: [],
    dailyRoutine: null,
    calmingTips: null,
    communicationTips: null,
    importantNotes: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function handoverView(row: repo.HandoverRow): Handover {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    residentId: row.residentId,
    audience: row.audience,
    body: row.body,
    postedAt: row.postedAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: row.acknowledgedBy,
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

/**
 * Care coordination: vital diary, «Chi sono» sheet and caregiver handovers.
 * Everyday care data; no plan feature gate (resident limits still apply elsewhere).
 *
 * @param db - Database handle.
 * @returns The service.
 */
export function createCareService(db: Database) {
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
      readonly residentId?: string | null;
      readonly ownerAccountId?: string | null;
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
      houseId: input.houseId ?? null,
      residentId: input.residentId ?? null,
      ownerAccountId: input.ownerAccountId ?? null,
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

  return {
    /**
     * Lists vital diary rows for one resident.
     *
     * @param tenant - Caller in the family.
     * @param residentId - Resident id.
     * @param page - Limit and cursor.
     * @returns A page of entries.
     */
    listVitals(
      tenant: TenantContext,
      residentId: string,
      page: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<VitalEntry>> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          await requireResident(tx, tenant.familyId, residentId);
          const rows = await repo.listVitalEntries(tx, {
            familyId: tenant.familyId,
            residentId,
            limit: page.limit,
            after: page.after,
          });
          return pageOfMeasured(rows, page.limit, vitalView);
        }),
      );
    },

    /**
     * Adds a vital diary row.
     *
     * @param tenant - Caller in the family.
     * @param residentId - Resident id.
     * @param body - Measurements.
     * @returns The stored entry.
     */
    createVital(
      tenant: TenantContext,
      residentId: string,
      body: CreateVitalEntryRequest,
    ): Promise<VitalEntry> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          await requireResident(tx, tenant.familyId, residentId);
          const row = await repo.insertVitalEntry(tx, {
            familyId: tenant.familyId,
            residentId,
            measuredAt: new Date(body.measuredAt),
            systolicMmhg: body.systolicMmhg ?? null,
            diastolicMmhg: body.diastolicMmhg ?? null,
            heartRateBpm: body.heartRateBpm ?? null,
            temperatureCelsius:
              body.temperatureCelsius === undefined || body.temperatureCelsius === null
                ? null
                : body.temperatureCelsius.toFixed(1),
            bloodGlucoseMgDl: body.bloodGlucoseMgDl ?? null,
            weightKg: body.weightKg === undefined || body.weightKg === null ? null : String(body.weightKg),
            oxygenSaturationPercent: body.oxygenSaturationPercent ?? null,
            notes: body.notes ?? null,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            action: 'care.vital.created',
            resourceType: 'vital_entries',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            residentId,
            data: { measuredAt: row.measuredAt.toISOString() },
          });
          return vitalView(row);
        }),
      );
    },

    /**
     * Updates a vital diary row.
     *
     * @param tenant - Caller in the family.
     * @param residentId - Resident id.
     * @param entryId - Entry id.
     * @param expectedVersion - Version the form was loaded with.
     * @param body - Fields to change.
     * @returns The updated entry.
     */
    updateVital(
      tenant: TenantContext,
      residentId: string,
      entryId: string,
      expectedVersion: number,
      body: UpdateVitalEntryRequest,
    ): Promise<VitalEntry> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.getVitalEntry(tx, tenant.familyId, residentId, entryId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          if (current.version !== expectedVersion) {
            conflict(current.version);
          }
          const temperature =
            body.temperatureCelsius === undefined
              ? undefined
              : body.temperatureCelsius === null
                ? null
                : body.temperatureCelsius.toFixed(1);
          const weight =
            body.weightKg === undefined ? undefined : body.weightKg === null ? null : String(body.weightKg);
          const row = await repo.updateVitalEntry(tx, tenant.familyId, entryId, expectedVersion, {
            ...(body.measuredAt === undefined ? {} : { measuredAt: new Date(body.measuredAt) }),
            ...(body.systolicMmhg === undefined ? {} : { systolicMmhg: body.systolicMmhg }),
            ...(body.diastolicMmhg === undefined ? {} : { diastolicMmhg: body.diastolicMmhg }),
            ...(body.heartRateBpm === undefined ? {} : { heartRateBpm: body.heartRateBpm }),
            ...(temperature === undefined ? {} : { temperatureCelsius: temperature }),
            ...(body.bloodGlucoseMgDl === undefined ? {} : { bloodGlucoseMgDl: body.bloodGlucoseMgDl }),
            ...(weight === undefined ? {} : { weightKg: weight }),
            ...(body.oxygenSaturationPercent === undefined
              ? {}
              : { oxygenSaturationPercent: body.oxygenSaturationPercent }),
            ...(body.notes === undefined ? {} : { notes: body.notes }),
            updatedBy: tenant.accountId,
          });
          if (row === null) {
            const again = await repo.getVitalEntry(tx, tenant.familyId, residentId, entryId);
            if (again === null) {
              throw new ProblemError('not_found');
            }
            conflict(again.version);
          }
          await trace(tx, tenant, {
            action: 'care.vital.updated',
            resourceType: 'vital_entries',
            resourceId: row.id,
            version: row.version,
            op: 'update',
            residentId,
            data: { measuredAt: row.measuredAt.toISOString() },
          });
          return vitalView(row);
        }),
      );
    },

    /**
     * Soft-deletes a vital diary row.
     *
     * @param tenant - Caller in the family.
     * @param residentId - Resident id.
     * @param entryId - Entry id.
     * @param expectedVersion - Version the form was loaded with.
     */
    deleteVital(
      tenant: TenantContext,
      residentId: string,
      entryId: string,
      expectedVersion: number,
    ): Promise<void> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.getVitalEntry(tx, tenant.familyId, residentId, entryId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          if (current.version !== expectedVersion) {
            conflict(current.version);
          }
          const row = await repo.softDeleteVitalEntry(
            tx,
            tenant.familyId,
            entryId,
            expectedVersion,
            tenant.accountId,
          );
          if (row === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'care.vital.deleted',
            resourceType: 'vital_entries',
            resourceId: row.id,
            version: row.version,
            op: 'delete',
            residentId,
            data: {},
          });
        }),
      );
    },

    /**
     * Reads the «Chi sono» sheet, or an empty template when never written.
     *
     * @param tenant - Caller in the family.
     * @param residentId - Resident id.
     * @returns The card.
     */
    getAbout(tenant: TenantContext, residentId: string): Promise<ResidentAboutCard> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          await requireResident(tx, tenant.familyId, residentId);
          const row = await repo.getAboutCard(tx, tenant.familyId, residentId);
          return row === null ? emptyAbout(tenant.familyId, residentId) : aboutView(row);
        }),
      );
    },

    /**
     * Replaces the «Chi sono» sheet.
     *
     * @param tenant - Caller in the family.
     * @param residentId - Resident id.
     * @param expectedVersion - Version the form was loaded with (`1` on first write).
     * @param body - The whole sheet.
     * @returns The stored card.
     */
    putAbout(
      tenant: TenantContext,
      residentId: string,
      expectedVersion: number,
      body: PutResidentAboutRequest,
    ): Promise<ResidentAboutCard> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          await requireResident(tx, tenant.familyId, residentId);
          const existing = await repo.getAboutCard(tx, tenant.familyId, residentId);
          if (existing !== null && existing.version !== expectedVersion) {
            conflict(existing.version);
          }
          if (existing === null && expectedVersion !== 1) {
            conflict(1);
          }
          const row = await repo.upsertAboutCard(tx, {
            familyId: tenant.familyId,
            residentId,
            preferredName: body.preferredName,
            howToAddress: body.howToAddress,
            likes: body.likes,
            dislikes: body.dislikes,
            dailyRoutine: body.dailyRoutine,
            calmingTips: body.calmingTips,
            communicationTips: body.communicationTips,
            importantNotes: body.importantNotes,
            expectedVersion,
            actorId: tenant.accountId,
          });
          if (row === null) {
            const again = await repo.getAboutCard(tx, tenant.familyId, residentId);
            conflict(again?.version ?? 1);
          }
          await trace(tx, tenant, {
            action: existing === null ? 'care.about.created' : 'care.about.updated',
            resourceType: 'resident_about_cards',
            resourceId: row.residentId,
            version: row.version,
            op: existing === null ? 'create' : 'update',
            residentId,
            data: {
              preferredName: row.preferredName,
              likes: row.likes.length,
              dislikes: row.dislikes.length,
            },
          });
          return aboutView(row);
        }),
      );
    },

    /**
     * Lists handover notes.
     *
     * @param tenant - Caller in the family.
     * @param page - Filters, limit and cursor.
     * @returns A page of notes.
     */
    listHandovers(
      tenant: TenantContext,
      page: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly houseId: string | null;
        readonly residentId: string | null;
        readonly audience: Handover['audience'] | null;
      },
    ): Promise<Page<Handover>> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          if (page.houseId !== null) {
            await requireHouse(tx, tenant.familyId, page.houseId);
          }
          if (page.residentId !== null) {
            await requireResident(tx, tenant.familyId, page.residentId);
          }
          const rows = await repo.listHandovers(tx, {
            familyId: tenant.familyId,
            houseId: page.houseId,
            residentId: page.residentId,
            audience: page.audience,
            limit: page.limit,
            after: page.after,
          });
          return pageOfPosted(rows, page.limit, handoverView);
        }),
      );
    },

    /**
     * Adds a handover note.
     *
     * @param tenant - Caller in the family.
     * @param body - Note content.
     * @returns The stored note.
     */
    createHandover(tenant: TenantContext, body: CreateHandoverRequest): Promise<Handover> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const houseId = body.houseId ?? null;
          const residentId = body.residentId ?? null;
          if (houseId !== null) {
            await requireHouse(tx, tenant.familyId, houseId);
          }
          if (residentId !== null) {
            await requireResident(tx, tenant.familyId, residentId);
          }
          const row = await repo.insertHandover(tx, {
            familyId: tenant.familyId,
            houseId,
            residentId,
            audience: body.audience,
            body: body.body,
            postedAt: body.postedAt === undefined ? new Date() : new Date(body.postedAt),
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            action: 'care.handover.created',
            resourceType: 'handovers',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            houseId,
            residentId,
            data: { audience: row.audience },
          });
          return handoverView(row);
        }),
      );
    },

    /**
     * Updates a handover note.
     *
     * @param tenant - Caller in the family.
     * @param handoverId - Note id.
     * @param expectedVersion - Version the form was loaded with.
     * @param body - Fields to change.
     * @returns The updated note.
     */
    updateHandover(
      tenant: TenantContext,
      handoverId: string,
      expectedVersion: number,
      body: UpdateHandoverRequest,
    ): Promise<Handover> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          if (tenant.role === 'guest') {
            throw new ProblemError('forbidden');
          }
          const current = await repo.getHandover(tx, tenant.familyId, handoverId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          if (current.version !== expectedVersion) {
            conflict(current.version);
          }
          if (body.houseId !== undefined && body.houseId !== null) {
            await requireHouse(tx, tenant.familyId, body.houseId);
          }
          if (body.residentId !== undefined && body.residentId !== null) {
            await requireResident(tx, tenant.familyId, body.residentId);
          }
          const row = await repo.updateHandover(tx, tenant.familyId, handoverId, expectedVersion, {
            ...(body.body === undefined ? {} : { body: body.body }),
            ...(body.audience === undefined ? {} : { audience: body.audience }),
            ...(body.houseId === undefined ? {} : { houseId: body.houseId }),
            ...(body.residentId === undefined ? {} : { residentId: body.residentId }),
            updatedBy: tenant.accountId,
          });
          if (row === null) {
            const again = await repo.getHandover(tx, tenant.familyId, handoverId);
            if (again === null) {
              throw new ProblemError('not_found');
            }
            conflict(again.version);
          }
          await trace(tx, tenant, {
            action: 'care.handover.updated',
            resourceType: 'handovers',
            resourceId: row.id,
            version: row.version,
            op: 'update',
            houseId: row.houseId,
            residentId: row.residentId,
            data: { audience: row.audience },
          });
          return handoverView(row);
        }),
      );
    },

    /**
     * Marks a handover as read.
     *
     * @param tenant - Caller in the family.
     * @param handoverId - Note id.
     * @param expectedVersion - Version the client loaded.
     * @returns The acknowledged note.
     */
    acknowledgeHandover(
      tenant: TenantContext,
      handoverId: string,
      expectedVersion: number,
    ): Promise<Handover> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.getHandover(tx, tenant.familyId, handoverId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          if (current.acknowledgedAt !== null) {
            throw new ProblemError('domain_rule_violated', {
              detail: 'This handover was already acknowledged',
            });
          }
          if (current.version !== expectedVersion) {
            conflict(current.version);
          }
          const row = await repo.acknowledgeHandover(
            tx,
            tenant.familyId,
            handoverId,
            expectedVersion,
            tenant.accountId,
          );
          if (row === null) {
            const again = await repo.getHandover(tx, tenant.familyId, handoverId);
            if (again === null) {
              throw new ProblemError('not_found');
            }
            if (again.acknowledgedAt !== null) {
              throw new ProblemError('domain_rule_violated', {
                detail: 'This handover was already acknowledged',
              });
            }
            conflict(again.version);
          }
          await trace(tx, tenant, {
            action: 'care.handover.acknowledged',
            resourceType: 'handovers',
            resourceId: row.id,
            version: row.version,
            op: 'update',
            houseId: row.houseId,
            residentId: row.residentId,
            data: { acknowledged: true },
          });
          return handoverView(row);
        }),
      );
    },

    /**
     * Soft-deletes a handover note.
     *
     * @param tenant - Caller in the family.
     * @param handoverId - Note id.
     * @param expectedVersion - Version the form was loaded with.
     */
    deleteHandover(tenant: TenantContext, handoverId: string, expectedVersion: number): Promise<void> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          if (tenant.role === 'guest') {
            throw new ProblemError('forbidden');
          }
          const current = await repo.getHandover(tx, tenant.familyId, handoverId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          if (current.version !== expectedVersion) {
            conflict(current.version);
          }
          const row = await repo.softDeleteHandover(
            tx,
            tenant.familyId,
            handoverId,
            expectedVersion,
            tenant.accountId,
          );
          if (row === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'care.handover.deleted',
            resourceType: 'handovers',
            resourceId: row.id,
            version: row.version,
            op: 'delete',
            houseId: row.houseId,
            residentId: row.residentId,
            data: {},
          });
        }),
      );
    },

    /**
     * Lists the caller's personal relationship notebook.
     *
     * @param tenant - Caller in the family.
     * @param page - Limit and cursor.
     * @returns A page of entries with simple reminders.
     */
    listRelationships(
      tenant: TenantContext,
      page: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<RelationshipEntry>> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const timezone = (await repo.familyTimeZone(tx, tenant.familyId)) ?? 'Europe/Rome';
          const today = calendarDateInTimeZone(new Date(), timezone);
          const rows = await repo.listRelationships(tx, {
            familyId: tenant.familyId,
            ownerAccountId: tenant.accountId,
            limit: page.limit,
            after: page.after,
          });
          return pageOfNamed(rows, page.limit, (row) => relationshipView(row, today));
        }),
      );
    },

    /**
     * Adds a personal relationship notebook entry.
     *
     * @param tenant - Caller in the family.
     * @param body - Name, relation, last contact, interval and notes.
     * @returns The stored entry.
     */
    createRelationship(tenant: TenantContext, body: CreateRelationshipRequest): Promise<RelationshipEntry> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const timezone = (await repo.familyTimeZone(tx, tenant.familyId)) ?? 'Europe/Rome';
          const today = calendarDateInTimeZone(new Date(), timezone);
          const row = await repo.insertRelationship(tx, {
            familyId: tenant.familyId,
            ownerAccountId: tenant.accountId,
            displayName: body.displayName,
            relation: body.relation ?? null,
            lastContactOn: body.lastContactOn ?? null,
            contactIntervalDays: body.contactIntervalDays ?? null,
            notes: body.notes ?? null,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            action: 'care.relationship.created',
            resourceType: 'relationship_entries',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            ownerAccountId: tenant.accountId,
            data: { displayName: row.displayName },
          });
          return relationshipView(row, today);
        }),
      );
    },

    /**
     * Updates a personal relationship notebook entry.
     *
     * @param tenant - Caller in the family.
     * @param entryId - Entry id.
     * @param expectedVersion - Version the form was loaded with.
     * @param body - Fields to change.
     * @returns The updated entry.
     */
    updateRelationship(
      tenant: TenantContext,
      entryId: string,
      expectedVersion: number,
      body: UpdateRelationshipRequest,
    ): Promise<RelationshipEntry> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.getRelationship(tx, tenant.familyId, entryId, tenant.accountId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          if (current.version !== expectedVersion) {
            conflict(current.version);
          }
          const timezone = (await repo.familyTimeZone(tx, tenant.familyId)) ?? 'Europe/Rome';
          const today = calendarDateInTimeZone(new Date(), timezone);
          const row = await repo.updateRelationship(
            tx,
            tenant.familyId,
            entryId,
            tenant.accountId,
            expectedVersion,
            {
              ...(body.displayName === undefined ? {} : { displayName: body.displayName }),
              ...(body.relation === undefined ? {} : { relation: body.relation }),
              ...(body.lastContactOn === undefined ? {} : { lastContactOn: body.lastContactOn }),
              ...(body.contactIntervalDays === undefined
                ? {}
                : { contactIntervalDays: body.contactIntervalDays }),
              ...(body.notes === undefined ? {} : { notes: body.notes }),
              updatedBy: tenant.accountId,
            },
          );
          if (row === null) {
            const again = await repo.getRelationship(tx, tenant.familyId, entryId, tenant.accountId);
            if (again === null) {
              throw new ProblemError('not_found');
            }
            conflict(again.version);
          }
          await trace(tx, tenant, {
            action: 'care.relationship.updated',
            resourceType: 'relationship_entries',
            resourceId: row.id,
            version: row.version,
            op: 'update',
            ownerAccountId: tenant.accountId,
            data: { displayName: row.displayName },
          });
          return relationshipView(row, today);
        }),
      );
    },

    /**
     * Soft-deletes a personal relationship notebook entry.
     *
     * @param tenant - Caller in the family.
     * @param entryId - Entry id.
     * @param expectedVersion - Version the form was loaded with.
     */
    deleteRelationship(tenant: TenantContext, entryId: string, expectedVersion: number): Promise<void> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.getRelationship(tx, tenant.familyId, entryId, tenant.accountId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          if (current.version !== expectedVersion) {
            conflict(current.version);
          }
          const row = await repo.softDeleteRelationship(
            tx,
            tenant.familyId,
            entryId,
            tenant.accountId,
            expectedVersion,
            tenant.accountId,
          );
          if (row === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'care.relationship.deleted',
            resourceType: 'relationship_entries',
            resourceId: row.id,
            version: row.version,
            op: 'delete',
            ownerAccountId: tenant.accountId,
            data: {},
          });
        }),
      );
    },
  };
}

/** Care coordination service. */
export type CareService = ReturnType<typeof createCareService>;
