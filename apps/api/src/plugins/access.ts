import { TWO_FACTOR_PERMISSIONS, decide } from '@domusafe/contracts';
import { hasFeature, minimumPlanFor } from '@domusafe/plans';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { Auth } from '../auth/auth.js';
import { ProblemError } from '../http/problem.js';
import type { IdentityService } from '../modules/identity/service.js';
import type { TenancyService } from '../modules/tenancy/service.js';

/** Dependencies of the access plugin. */
export interface AccessOptions {
  readonly auth: Auth;
  readonly tenancy: TenancyService;
  readonly identity: IdentityService;
}

/**
 * Authentication and authorisation hook (phase 3 §8.1). Order: session → membership → permission →
 * two-factor requirement → plan feature. Routes are `account` unless they declare `access: 'public'`;
 * `family` routes must declare a permission. A family the caller does not belong to answers 404.
 */
export const accessPlugin = fp<AccessOptions>(
  async (app: FastifyInstance, { auth, tenancy, identity }) => {
    app.decorateRequest('account', null);
    app.decorateRequest('tenant', null);
    app.decorateRequest('idempotencyKey', null);

    app.addHook('preHandler', async (request) => {
      if (request.is404) {
        return;
      }
      const config = request.routeOptions.config;
      const access = config.access ?? 'account';
      if (access === 'public') {
        return;
      }
      const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
      if (session === null) {
        throw new ProblemError('unauthenticated');
      }
      request.account = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        emailVerified: session.user.emailVerified,
        twoFactorEnabled: 'twoFactorEnabled' in session.user && session.user.twoFactorEnabled === true,
        sessionId: session.session.id,
      };
      if (access !== 'family') {
        return;
      }
      const permission = config.permission;
      if (permission === undefined) {
        throw new Error(`Route ${request.routeOptions.url ?? ''} is a family route without a permission`);
      }
      const { familyId } = request.params as { familyId?: string };
      if (familyId === undefined) {
        throw new Error(`Route ${request.routeOptions.url ?? ''} is a family route without :familyId`);
      }
      const resolved = await tenancy.resolveTenant(request.account.id, familyId);
      if (resolved === null) {
        throw new ProblemError('not_found');
      }
      const decision = decide(
        { role: resolved.role, isOwner: resolved.isOwner, vaultFamilyConcession: resolved.vaultFamily },
        permission,
      );
      if (!decision.allowed) {
        throw new ProblemError('forbidden');
      }
      if (
        TWO_FACTOR_PERMISSIONS.has(permission) &&
        !request.account.twoFactorEnabled &&
        (await identity.hasPasswordCredential(request.account.id))
      ) {
        throw new ProblemError('two_factor_setup_required');
      }
      const feature = config.planFeature;
      if (feature !== undefined && !hasFeature(resolved.plan.tier, feature)) {
        throw new ProblemError('plan_required', { requiredPlan: minimumPlanFor(feature) });
      }
      request.tenant = { ...resolved, scope: decision.scope };
    });
  },
  { name: 'domusafe-access' },
);
