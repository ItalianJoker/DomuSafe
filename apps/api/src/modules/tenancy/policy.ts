import type { MemberRole, UpdateMembershipRequest } from '@domusafe/contracts';
import { ProblemError } from '../../http/problem.js';
import type { MemberRow } from './repository.js';

const ROLE_RANK: Readonly<Record<MemberRole, number>> = {
  admin: 4,
  parent: 3,
  child: 2,
  caregiver: 1,
  guest: 0,
};

/** Columns and scope lists to write for a membership change. */
export interface MembershipChange {
  readonly columns: {
    role: MemberRole;
    allHouses: boolean;
    allResidents: boolean;
    vaultFamily: boolean;
    expiresAt: Date | null;
  };
  /** Complete new list, or `null` to keep the current one. */
  readonly houseIds: string[] | null;
  readonly residentIds: string[] | null;
}

/**
 * Applies the membership rules of phase 1 §6 and phase 2 §6.2 to a requested change:
 * the owner stays administrator; Guests need a future expiry and are always restricted; Caregivers are
 * always restricted; only administrators and parents may hold the family-vault concession.
 *
 * @param current - Current membership with scopes.
 * @param patch - Validated request body.
 * @param context - Whether the member is the family owner, and the current time.
 * @returns The normalised change.
 * @throws ProblemError `domain_rule_violated` when the request breaks a rule.
 */
export function normalizeMembershipChange(
  current: MemberRow,
  patch: UpdateMembershipRequest,
  context: { isOwner: boolean; now: Date },
): MembershipChange {
  const m = current.membership;
  const role = patch.role ?? m.role;
  if (context.isOwner && role !== 'admin') {
    throw new ProblemError('domain_rule_violated', {
      detail: 'The family owner must remain an administrator',
    });
  }
  const restricted = role === 'guest' || role === 'caregiver';
  const allHouses = restricted ? false : (patch.allHouses ?? m.allHouses);
  const allResidents = restricted ? false : (patch.allResidents ?? m.allResidents);
  const expiresAt =
    patch.expiresAt === undefined ? m.expiresAt : patch.expiresAt === null ? null : new Date(patch.expiresAt);
  if (role === 'guest' && (expiresAt === null || expiresAt <= context.now)) {
    throw new ProblemError('domain_rule_violated', { detail: 'Guests need an expiry date in the future' });
  }
  if (context.isOwner && expiresAt !== null) {
    throw new ProblemError('domain_rule_violated', { detail: 'The family owner membership cannot expire' });
  }
  const vaultRequested = patch.vaultFamily ?? m.vaultFamily;
  if (patch.vaultFamily === true && role !== 'admin' && role !== 'parent') {
    throw new ProblemError('domain_rule_violated', {
      detail: 'Only administrators and parents can hold the family vault concession',
    });
  }
  return {
    columns: {
      role,
      allHouses,
      allResidents,
      vaultFamily: vaultRequested && (role === 'admin' || role === 'parent'),
      expiresAt,
    },
    houseIds: allHouses ? [] : (patch.houseIds ?? null),
    residentIds: allResidents ? [] : (patch.residentIds ?? null),
  };
}

/**
 * Whether a membership change removes access (role downgrade, narrower scope, vault concession lost,
 * earlier expiry). Reductions trigger scope-key rotation (phase 2 §8.11).
 *
 * @param before - Membership before the change.
 * @param after - Membership after the change.
 * @returns `true` when any access was removed.
 */
export function isReduction(before: MemberRow, after: MemberRow): boolean {
  const b = before.membership;
  const a = after.membership;
  const lostHouse =
    !a.allHouses && (b.allHouses || before.houseIds.some((id) => !after.houseIds.includes(id)));
  const lostResident =
    !a.allResidents && (b.allResidents || before.residentIds.some((id) => !after.residentIds.includes(id)));
  const earlierExpiry = a.expiresAt !== null && (b.expiresAt === null || a.expiresAt < b.expiresAt);
  return (
    ROLE_RANK[a.role] < ROLE_RANK[b.role] ||
    lostHouse ||
    lostResident ||
    (b.vaultFamily && !a.vaultFamily) ||
    earlierExpiry
  );
}
