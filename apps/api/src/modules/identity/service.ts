import type { Me, UpdateProfileRequest } from '@domusafe/contracts';
import { recordAudit, withContext, type Database, type DbPrincipal } from '@domusafe/db';
import { ProblemError } from '../../http/problem.js';
import type { AuthenticatedAccount } from '../../types.js';
import type { TenancyService } from '../tenancy/service.js';
import * as repo from './repository.js';

const account = (accountId: string): DbPrincipal => ({ kind: 'account', accountId });

/**
 * Identity use cases on top of Better Auth: account profile and the data behind `GET /me`.
 *
 * @param db - Database bound to the `domusafe_app` pool.
 * @param tenancy - Tenancy service (families and house visibility).
 * @returns The service.
 */
export function createIdentityService(db: Database, tenancy: TenancyService) {
  async function getMe(caller: AuthenticatedAccount): Promise<Me> {
    const profile = await withContext(db, { principal: account(caller.id) }, async (tx) => {
      await repo.ensureProfile(tx, caller.id, caller.name);
      return repo.findProfile(tx, caller.id);
    });
    if (profile === null) {
      throw new Error('Profile missing after ensureProfile');
    }
    const families = await tenancy.listFamilies(caller.id);
    return {
      accountId: caller.id,
      email: caller.email,
      emailVerified: caller.emailVerified,
      displayName: profile.displayName,
      locale: profile.locale,
      theme: profile.theme,
      twoFactorEnabled: caller.twoFactorEnabled,
      primaryFamilyId: profile.primaryFamilyId,
      lastFamilyId: profile.lastFamilyId,
      lastHouseId: profile.lastHouseId,
      families: families.map((family) => ({
        id: family.id,
        name: family.name,
        role: family.role,
        plan: family.plan.tier,
      })),
    };
  }

  return {
    /**
     * Creates the profile of a newly registered account (Better Auth `user.create.after` hook).
     *
     * @param accountId - New account id.
     * @param name - Name given at registration.
     */
    async onAccountCreated(accountId: string, name: string): Promise<void> {
      await withContext(db, { principal: account(accountId) }, (tx) =>
        repo.ensureProfile(tx, accountId, name),
      );
    },

    /**
     * Whether the account can sign in with a password.
     *
     * @param accountId - Account id.
     * @returns `true` when a password credential exists.
     */
    hasPasswordCredential(accountId: string): Promise<boolean> {
      return repo.hasPasswordCredential(db, accountId);
    },

    /**
     * Builds the `GET /me` response.
     *
     * @param caller - Authenticated account.
     * @returns Profile, security state and families.
     */
    getMe,

    /**
     * Updates display name, language, theme and the last family and house used (quick house switch).
     *
     * @param caller - Authenticated account.
     * @param patch - Validated request body.
     * @returns The updated `GET /me` response.
     * @throws ProblemError `validation_failed` when the family or house is not accessible to the caller.
     */
    async updateProfile(caller: AuthenticatedAccount, patch: UpdateProfileRequest): Promise<Me> {
      const current = await withContext(db, { principal: account(caller.id) }, async (tx) => {
        await repo.ensureProfile(tx, caller.id, caller.name);
        return repo.findProfile(tx, caller.id);
      });
      const familyId =
        patch.lastFamilyId === undefined ? (current?.lastFamilyId ?? null) : patch.lastFamilyId;
      if (patch.lastFamilyId !== undefined && patch.lastFamilyId !== null) {
        if ((await tenancy.resolveTenant(caller.id, patch.lastFamilyId)) === null) {
          throw new ProblemError('validation_failed', {
            errors: [{ path: 'body.lastFamilyId', code: 'not_accessible', message: 'Family not accessible' }],
          });
        }
      }
      if (patch.lastHouseId !== undefined && patch.lastHouseId !== null) {
        if (familyId === null || !(await tenancy.houseVisible(caller.id, familyId, patch.lastHouseId))) {
          throw new ProblemError('validation_failed', {
            errors: [
              {
                path: 'body.lastHouseId',
                code: 'not_accessible',
                message: 'House not accessible in the family',
              },
            ],
          });
        }
      }
      await withContext(db, { principal: account(caller.id) }, async (tx) => {
        await repo.updateProfile(tx, caller.id, {
          ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
          ...(patch.locale === undefined ? {} : { locale: patch.locale }),
          ...(patch.theme === undefined ? {} : { theme: patch.theme }),
          ...(patch.lastFamilyId === undefined ? {} : { lastFamilyId: patch.lastFamilyId }),
          ...(patch.lastHouseId === undefined ? {} : { lastHouseId: patch.lastHouseId }),
          ...(patch.lastFamilyId !== undefined && patch.lastHouseId === undefined
            ? { lastHouseId: null }
            : {}),
        });
        await recordAudit(tx, {
          familyId: null,
          actor: { kind: 'account', id: caller.id },
          action: 'identity.profile.updated',
          outcome: 'success',
        });
      });
      return getMe(caller);
    },
  };
}

/** Identity service interface. */
export type IdentityService = ReturnType<typeof createIdentityService>;
