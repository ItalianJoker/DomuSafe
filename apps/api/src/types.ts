import type { MemberRole, Permission } from '@domusafe/contracts';
import type { EffectivePlan, PlanFeature } from '@domusafe/plans';

/** Account authenticated by the Better Auth session cookie. */
export interface AuthenticatedAccount {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
  readonly twoFactorEnabled: boolean;
  readonly sessionId: string;
}

/** Membership of the authenticated account in the family of the request path (phase 1 §4.2). */
export interface TenantContext {
  readonly accountId: string;
  readonly familyId: string;
  readonly membershipId: string;
  readonly role: MemberRole;
  readonly isOwner: boolean;
  readonly vaultFamily: boolean;
  readonly allHouses: boolean;
  readonly allResidents: boolean;
  /** Scope of the route permission: modules filter `scoped` and `own` further; RLS enforces it again. */
  readonly scope: 'all' | 'scoped' | 'own';
  readonly plan: EffectivePlan;
}

/** Who may call a route. */
export type RouteAccess = 'public' | 'account' | 'family';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** `public`: no session; `account`: session required; `family`: session + membership of `:familyId`. */
    access?: RouteAccess;
    /** Permission checked for `family` routes (phase 3 §8). */
    permission?: Permission;
    /** Plan feature required by the route (phase 3 §9). */
    planFeature?: PlanFeature;
    /** Requires and honours `Idempotency-Key` (phase 3 §2.2). */
    idempotent?: boolean;
  }

  interface FastifyRequest {
    account: AuthenticatedAccount | null;
    tenant: TenantContext | null;
    idempotencyKey: { readonly key: string; readonly fingerprint: string } | null;
  }
}
