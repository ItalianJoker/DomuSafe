import { PERMISSION_MATRIX, type MemberRole, type Permission } from '@domusafe/contracts';

/**
 * Whether a family role may attempt a permission.
 *
 * Preconditions: the permission exists in the shared catalogue.
 * Postconditions: a null grant hides the action; the server still decides.
 * Data contract: scoped grants count as allowed here; the API filters the rows.
 *
 * @param role - Role inside the family.
 * @param permission - Catalogue permission.
 * @returns True when the matrix grants the role anything other than no access.
 */
export function roleAllows(role: MemberRole, permission: Permission): boolean {
  return PERMISSION_MATRIX[permission][role] !== null;
}
