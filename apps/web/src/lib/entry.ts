import type { Me } from '@domusafe/contracts';

/**
 * Chooses which family to open after sign-in.
 *
 * Preconditions: `me.families` lists only families the account can open.
 * Postconditions: the result is null when the account has no family.
 * Data contract: the last family is used only when it is still in the list.
 *
 * @param me - Current account.
 * @returns A family id, or null.
 */
export function pickFamilyId(me: Me): string | null {
  if (me.families.length === 0) {
    return null;
  }
  if (me.lastFamilyId !== null && me.families.some((family) => family.id === me.lastFamilyId)) {
    return me.lastFamilyId;
  }
  return me.families[0]?.id ?? null;
}

/**
 * Chooses which house to open inside a family.
 *
 * Preconditions: `houses` are the houses visible to the account in `familyId`.
 * Postconditions: the result is null when that list is empty.
 * Data contract: the last house is used only when it belongs to this family and is still visible.
 *
 * @param me - Current account.
 * @param familyId - Family being opened.
 * @param houses - Visible houses.
 * @returns A house id, or null.
 */
export function pickHouseId(
  me: Me,
  familyId: string,
  houses: readonly { readonly id: string }[],
): string | null {
  if (houses.length === 0) {
    return null;
  }
  if (
    me.lastFamilyId === familyId &&
    me.lastHouseId !== null &&
    houses.some((house) => house.id === me.lastHouseId)
  ) {
    return me.lastHouseId;
  }
  return houses[0]?.id ?? null;
}
