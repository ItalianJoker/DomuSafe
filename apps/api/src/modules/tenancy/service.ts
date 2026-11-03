import {
  encodeCursor,
  type MemberRole,
  type CreateFamilyRequest,
  type CreateHouseRequest,
  type Family,
  type House,
  type Membership,
  type UpdateFamilyRequest,
  type UpdateHouseRequest,
  type UpdateMembershipRequest,
} from '@domusafe/contracts';
import {
  recordAudit,
  recordRevision,
  setFamilyContext,
  withContext,
  type Database,
  type DbPrincipal,
  type Transaction,
} from '@domusafe/db';
import { PLAN_DEFINITIONS, checkLimit, effectivePlan, type EffectivePlan } from '@domusafe/plans';
import { ProblemError, classifyDatabaseError } from '../../http/problem.js';
import { definedOnly } from '../../lib/objects.js';
import type { AuthenticatedAccount, TenantContext } from '../../types.js';
import * as repo from './repository.js';
import { isReduction, normalizeMembershipChange } from './policy.js';

/** Tenant data resolved for a request, before the route permission adds its scope. */
export type ResolvedTenant = Omit<TenantContext, 'scope'>;

/** One page of a list. */
export interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

const account = (accountId: string): DbPrincipal => ({ kind: 'account', accountId });

function planView(plan: EffectivePlan): Family['plan'] {
  return {
    tier: plan.tier,
    source: plan.source,
    trialEndsAt: plan.trialEndsAt?.toISOString() ?? null,
    watermark: PLAN_DEFINITIONS[plan.tier].watermark,
  };
}

function familyView(row: repo.FamilyRow, role: MemberRole, plan: EffectivePlan): Family {
  return {
    id: row.id,
    name: row.name,
    ownerAccountId: row.ownerAccountId,
    timezone: row.timezone,
    baseCurrency: row.baseCurrency as Family['baseCurrency'],
    locale: row.locale,
    plan: planView(plan),
    role,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function houseView(row: repo.HouseRow): House {
  return {
    id: row.id,
    familyId: row.familyId,
    name: row.name,
    addressLine: row.addressLine,
    postalCode: row.postalCode,
    city: row.city,
    province: row.province,
    country: row.country,
    sortOrder: row.sortOrder,
    planLocked: row.planLockedAt !== null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function houseSnapshot(row: repo.HouseRow): Record<string, unknown> {
  const { createdAt, updatedAt, deletedAt, planLockedAt, ...rest } = row;
  return {
    ...rest,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    deletedAt: deletedAt?.toISOString() ?? null,
    planLockedAt: planLockedAt?.toISOString() ?? null,
  };
}

function memberView(row: repo.MemberRow, ownerAccountId: string): Membership {
  const m = row.membership;
  return {
    id: m.id,
    familyId: m.familyId,
    accountId: m.accountId,
    displayName: row.displayName,
    role: m.role,
    isOwner: m.accountId === ownerAccountId,
    status: m.status,
    allHouses: m.allHouses,
    houseIds: row.houseIds,
    allResidents: m.allResidents,
    residentIds: row.residentIds,
    vaultFamily: m.vaultFamily,
    expiresAt: m.expiresAt?.toISOString() ?? null,
    version: m.version,
    createdAt: m.createdAt.toISOString(),
  };
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
        detail:
          failure.constraint === 'family_owner_is_admin'
            ? 'The family owner must remain an active administrator'
            : `Constraint ${failure.constraint ?? 'check'} violated`,
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

/**
 * Tenancy use cases (families, houses, memberships). The only place that opens tenancy transactions;
 * every write appends an audit event and, for houses, a revision in the same transaction.
 *
 * @param db - Database bound to the `domusafe_app` pool.
 * @param now - Clock, injectable for tests.
 * @returns The service.
 */
export function createTenancyService(db: Database, now: () => Date = () => new Date()) {
  async function planOf(tx: Transaction, family: repo.FamilyRow): Promise<EffectivePlan> {
    return effectivePlan(family.plan, await repo.findOwnerTrial(tx, family.id, family.ownerAccountId), now());
  }

  return {
    /**
     * Resolves the caller's membership in a family, or `null` when the account is not an active member.
     *
     * @param accountId - Authenticated account.
     * @param familyId - Family of the request path.
     * @returns Role, ownership, scopes and effective plan.
     */
    async resolveTenant(accountId: string, familyId: string): Promise<ResolvedTenant | null> {
      return withContext(db, { principal: account(accountId), familyId }, async (tx) => {
        const membership = await repo.findActiveMembership(tx, familyId, accountId);
        const family = membership === null ? null : await repo.findFamily(tx, familyId);
        if (membership === null || family === null) {
          return null;
        }
        return {
          accountId,
          familyId,
          membershipId: membership.id,
          role: membership.role,
          isOwner: family.ownerAccountId === accountId,
          vaultFamily: membership.vaultFamily,
          allHouses: membership.allHouses,
          allResidents: membership.allResidents,
          plan: await planOf(tx, family),
        };
      });
    },

    /**
     * Whether a house is visible to an account in a family (membership and house scope, via RLS).
     *
     * @param accountId - Account id.
     * @param familyId - Family id.
     * @param houseId - House id.
     * @returns `true` when the account can read the house.
     */
    async houseVisible(accountId: string, familyId: string, houseId: string): Promise<boolean> {
      return withContext(db, { principal: account(accountId), familyId }, async (tx) => {
        return (await repo.findHouse(tx, familyId, houseId)) !== null;
      });
    },

    /**
     * Lists the caller's families with role and effective plan.
     *
     * @param accountId - Authenticated account.
     * @returns Families ordered by name.
     */
    async listFamilies(accountId: string): Promise<Family[]> {
      return withContext(db, { principal: account(accountId) }, async (tx) => {
        const rows = await repo.listAccountFamilies(tx, accountId);
        const out: Family[] = [];
        for (const row of rows) {
          await setFamilyContext(tx, account(accountId), row.family.id);
          out.push(familyView(row.family, row.membership.role, await planOf(tx, row.family)));
        }
        return out;
      });
    },

    /**
     * Creates a family owned by the caller together with its first house.
     *
     * @param caller - Authenticated account.
     * @param input - Validated request body.
     * @returns The family (caller is administrator and owner) and the house.
     */
    async createFamily(
      caller: AuthenticatedAccount,
      input: CreateFamilyRequest,
    ): Promise<{ family: Family; house: House }> {
      return guarded(() =>
        withContext(db, { principal: account(caller.id) }, async (tx) => {
          const familyId = await repo.createFamily(tx, {
            name: input.name,
            timezone: input.timezone,
            baseCurrency: input.baseCurrency,
            locale: input.locale,
          });
          await setFamilyContext(tx, account(caller.id), familyId);
          const house = await repo.insertHouse(tx, {
            familyId,
            name: input.firstHouse.name,
            createdBy: caller.id,
            updatedBy: caller.id,
          });
          const actor = { kind: 'account', id: caller.id } as const;
          await recordRevision(tx, {
            familyId,
            resourceType: 'houses',
            resourceId: house.id,
            version: house.version,
            op: 'create',
            actor,
            data: houseSnapshot(house),
            houseId: house.id,
          });
          await recordAudit(tx, {
            familyId,
            actor,
            action: 'tenancy.family.created',
            resourceType: 'families',
            resourceId: familyId,
            outcome: 'success',
          });
          await recordAudit(tx, {
            familyId,
            actor,
            action: 'tenancy.house.created',
            resourceType: 'houses',
            resourceId: house.id,
            outcome: 'success',
          });
          const family = await repo.findFamily(tx, familyId);
          if (family === null) {
            throw new Error('Created family is not visible to its owner');
          }
          return { family: familyView(family, 'admin', await planOf(tx, family)), house: houseView(house) };
        }),
      );
    },

    /**
     * Reads the family of the tenant.
     *
     * @param tenant - Resolved tenant.
     * @returns The family.
     */
    async getFamily(tenant: TenantContext): Promise<Family> {
      return withContext(
        db,
        { principal: account(tenant.accountId), familyId: tenant.familyId },
        async (tx) => {
          const family = await repo.findFamily(tx, tenant.familyId);
          if (family === null) {
            throw new ProblemError('not_found');
          }
          return familyView(family, tenant.role, tenant.plan);
        },
      );
    },

    /**
     * Updates name, time zone, base currency or locale of the family.
     *
     * @param tenant - Resolved administrator tenant.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Validated request body.
     * @returns The updated family.
     */
    async updateFamily(
      tenant: TenantContext,
      expectedVersion: number,
      patch: UpdateFamilyRequest,
    ): Promise<Family> {
      return guarded(() =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          const current = await repo.findFamily(tx, tenant.familyId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const updated = await repo.updateFamily(tx, tenant.familyId, expectedVersion, definedOnly(patch));
          if (updated === null) {
            throw new ProblemError('version_conflict', { currentVersion: current.version });
          }
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: { kind: 'account', id: tenant.accountId },
            action: 'tenancy.family.updated',
            resourceType: 'families',
            resourceId: tenant.familyId,
            outcome: 'success',
            metadata: { version: updated.version },
          });
          return familyView(updated, tenant.role, tenant.plan);
        }),
      );
    },

    /**
     * Lists the houses visible to the tenant (Caregivers and Guests see only assigned houses).
     *
     * @param tenant - Resolved tenant.
     * @param page - Limit and decoded cursor.
     * @returns One page of houses.
     */
    async listHouses(
      tenant: TenantContext,
      page: { limit: number; after: readonly [number, string] | null },
    ): Promise<Page<House>> {
      return withContext(
        db,
        { principal: account(tenant.accountId), familyId: tenant.familyId },
        async (tx) => {
          const rows = await repo.listHouses(tx, tenant.familyId, page);
          const items = rows.slice(0, page.limit);
          const last = items.at(-1);
          return {
            items: items.map(houseView),
            nextCursor:
              rows.length > page.limit && last !== undefined ? encodeCursor([last.sortOrder, last.id]) : null,
          };
        },
      );
    },

    /**
     * Creates a house within the plan limit (checked under a lock on the family row).
     *
     * @param tenant - Resolved administrator tenant.
     * @param input - Validated request body.
     * @returns The new house.
     */
    async createHouse(tenant: TenantContext, input: CreateHouseRequest): Promise<House> {
      return guarded(() =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          const family = await repo.lockFamily(tx, tenant.familyId);
          if (family === null) {
            throw new ProblemError('not_found');
          }
          const usage = await repo.countActiveHouses(tx, tenant.familyId);
          const limit = checkLimit(tenant.plan.tier, 'houses', usage);
          if (!limit.allowed) {
            throw new ProblemError('plan_limit_reached', {
              usage,
              ...(limit.limit === null ? {} : { limit: limit.limit }),
            });
          }
          const house = await repo.insertHouse(tx, {
            familyId: tenant.familyId,
            name: input.name,
            addressLine: input.addressLine ?? null,
            postalCode: input.postalCode ?? null,
            city: input.city ?? null,
            province: input.province ?? null,
            country: input.country,
            sortOrder: input.sortOrder ?? usage,
            createdBy: tenant.accountId,
            updatedBy: tenant.accountId,
          });
          const actor = { kind: 'account', id: tenant.accountId } as const;
          await recordRevision(tx, {
            familyId: tenant.familyId,
            resourceType: 'houses',
            resourceId: house.id,
            version: house.version,
            op: 'create',
            actor,
            data: houseSnapshot(house),
            houseId: house.id,
          });
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor,
            action: 'tenancy.house.created',
            resourceType: 'houses',
            resourceId: house.id,
            outcome: 'success',
          });
          return houseView(house);
        }),
      );
    },

    /**
     * Reads one house visible to the tenant.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @returns The house; `not_found` when absent or outside the tenant's scope.
     */
    async getHouse(tenant: TenantContext, houseId: string): Promise<House> {
      return withContext(
        db,
        { principal: account(tenant.accountId), familyId: tenant.familyId },
        async (tx) => {
          const house = await repo.findHouse(tx, tenant.familyId, houseId);
          if (house === null) {
            throw new ProblemError('not_found');
          }
          return houseView(house);
        },
      );
    },

    /**
     * Updates a house with optimistic concurrency.
     *
     * @param tenant - Resolved administrator tenant.
     * @param houseId - House id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Validated request body.
     * @returns The updated house.
     */
    async updateHouse(
      tenant: TenantContext,
      houseId: string,
      expectedVersion: number,
      patch: UpdateHouseRequest,
    ): Promise<House> {
      return guarded(() =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          const current = await repo.findHouse(tx, tenant.familyId, houseId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          if (current.planLockedAt !== null) {
            throw new ProblemError('plan_locked');
          }
          const updated = await repo.updateHouse(
            tx,
            { familyId: tenant.familyId, houseId, expectedVersion },
            { ...definedOnly(patch), updatedBy: tenant.accountId },
          );
          if (updated === null) {
            throw new ProblemError('version_conflict', { currentVersion: current.version });
          }
          const actor = { kind: 'account', id: tenant.accountId } as const;
          await recordRevision(tx, {
            familyId: tenant.familyId,
            resourceType: 'houses',
            resourceId: houseId,
            version: updated.version,
            op: 'update',
            actor,
            data: houseSnapshot(updated),
            houseId,
          });
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor,
            action: 'tenancy.house.updated',
            resourceType: 'houses',
            resourceId: houseId,
            outcome: 'success',
            metadata: { version: updated.version },
          });
          return houseView(updated);
        }),
      );
    },

    /**
     * Moves a house to the 30-day trash. A family always keeps at least one house.
     *
     * @param tenant - Resolved administrator tenant.
     * @param houseId - House id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deleteHouse(tenant: TenantContext, houseId: string, expectedVersion: number): Promise<void> {
      await guarded(() =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          await repo.lockFamily(tx, tenant.familyId);
          const current = await repo.findHouse(tx, tenant.familyId, houseId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          if ((await repo.countActiveHouses(tx, tenant.familyId)) <= 1 && current.planLockedAt === null) {
            throw new ProblemError('domain_rule_violated', {
              detail: 'A family must keep at least one house',
            });
          }
          const deleted = await repo.updateHouse(
            tx,
            { familyId: tenant.familyId, houseId, expectedVersion },
            { deletedAt: now(), updatedBy: tenant.accountId },
          );
          if (deleted === null) {
            throw new ProblemError('version_conflict', { currentVersion: current.version });
          }
          const actor = { kind: 'account', id: tenant.accountId } as const;
          await recordRevision(tx, {
            familyId: tenant.familyId,
            resourceType: 'houses',
            resourceId: houseId,
            version: deleted.version,
            op: 'delete',
            actor,
            data: houseSnapshot(deleted),
            houseId,
          });
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor,
            action: 'tenancy.house.deleted',
            resourceType: 'houses',
            resourceId: houseId,
            outcome: 'success',
          });
        }),
      );
    },

    /**
     * Lists memberships. Caregivers (`scoped`) see only themselves and the administrators.
     *
     * @param tenant - Resolved tenant.
     * @param page - Limit and decoded cursor.
     * @returns One page of members.
     */
    async listMembers(
      tenant: TenantContext,
      page: { limit: number; after: readonly [string, string] | null },
    ): Promise<Page<Membership>> {
      return withContext(
        db,
        { principal: account(tenant.accountId), familyId: tenant.familyId },
        async (tx) => {
          const family = await repo.findFamily(tx, tenant.familyId);
          if (family === null) {
            throw new ProblemError('not_found');
          }
          const rows = await repo.listMembers(tx, tenant.familyId, page);
          const pageRows = rows.slice(0, page.limit);
          const last = pageRows.at(-1);
          const visible =
            tenant.scope === 'scoped'
              ? pageRows.filter(
                  (row) => row.membership.accountId === tenant.accountId || row.membership.role === 'admin',
                )
              : pageRows;
          return {
            items: visible.map((row) => memberView(row, family.ownerAccountId)),
            nextCursor:
              rows.length > page.limit && last !== undefined
                ? encodeCursor([last.membership.createdAt.toISOString(), last.membership.id])
                : null,
          };
        },
      );
    },

    /**
     * Changes role, scopes, expiry or vault concession of a membership. A reduction revokes the member's
     * scope-key grants and flags those scopes for rotation (phase 2 §8.11).
     *
     * @param tenant - Resolved administrator tenant.
     * @param membershipId - Membership id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Validated request body.
     * @returns The updated membership.
     */
    async updateMember(
      tenant: TenantContext,
      membershipId: string,
      expectedVersion: number,
      patch: UpdateMembershipRequest,
    ): Promise<Membership> {
      return guarded(() =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          const family = await repo.findFamily(tx, tenant.familyId);
          const current = await repo.findMember(tx, tenant.familyId, membershipId);
          if (family === null || current === null) {
            throw new ProblemError('not_found');
          }
          const change = normalizeMembershipChange(current, patch, {
            isOwner: current.membership.accountId === family.ownerAccountId,
            now: now(),
          });
          const updated = await repo.updateMembership(
            tx,
            { familyId: tenant.familyId, membershipId, expectedVersion },
            change.columns,
          );
          if (updated === null) {
            throw new ProblemError('version_conflict', { currentVersion: current.membership.version });
          }
          await repo.replaceMembershipScopes(tx, {
            familyId: tenant.familyId,
            membershipId,
            houseIds: change.houseIds,
            residentIds: change.residentIds,
          });
          const reloaded = await repo.findMember(tx, tenant.familyId, membershipId);
          if (reloaded === null) {
            throw new ProblemError('not_found');
          }
          const rotated = isReduction(current, reloaded)
            ? await repo.revokeGrantsAndFlagRotation(tx, tenant.familyId, current.membership.accountId)
            : 0;
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: { kind: 'account', id: tenant.accountId },
            action: 'tenancy.member.updated',
            resourceType: 'memberships',
            resourceId: membershipId,
            outcome: 'success',
            metadata: {
              role: reloaded.membership.role,
              version: reloaded.membership.version,
              scopesToRotate: rotated,
            },
          });
          return memberView(reloaded, family.ownerAccountId);
        }),
      );
    },

    /**
     * Removes a member: the membership becomes `left`, scope-key grants are deleted and the scopes are
     * flagged for rotation. The owner cannot be removed.
     *
     * @param tenant - Resolved administrator tenant.
     * @param membershipId - Membership id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async removeMember(tenant: TenantContext, membershipId: string, expectedVersion: number): Promise<void> {
      await guarded(() =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          const family = await repo.findFamily(tx, tenant.familyId);
          const current = await repo.findMember(tx, tenant.familyId, membershipId);
          if (family === null || current === null || current.membership.status === 'left') {
            throw new ProblemError('not_found');
          }
          if (current.membership.accountId === family.ownerAccountId) {
            throw new ProblemError('domain_rule_violated', {
              detail: 'Transfer ownership before removing the family owner',
            });
          }
          const updated = await repo.updateMembership(
            tx,
            { familyId: tenant.familyId, membershipId, expectedVersion },
            { status: 'left', vaultFamily: false },
          );
          if (updated === null) {
            throw new ProblemError('version_conflict', { currentVersion: current.membership.version });
          }
          const rotated = await repo.revokeGrantsAndFlagRotation(
            tx,
            tenant.familyId,
            current.membership.accountId,
          );
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: { kind: 'account', id: tenant.accountId },
            action: 'tenancy.member.removed',
            resourceType: 'memberships',
            resourceId: membershipId,
            outcome: 'success',
            metadata: { scopesToRotate: rotated },
          });
        }),
      );
    },
  };
}

/** Tenancy service interface used by other modules and the access hook. */
export type TenancyService = ReturnType<typeof createTenancyService>;
