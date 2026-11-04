/**
 * Path of the full-screen rescue view for one house.
 *
 * Preconditions: `familyId` and `houseId` identify the open house.
 * Postconditions: the path is a child of that house and is not a menu section.
 * Data contract: an absolute path ending in `/soccorso`.
 *
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns The path.
 */
export function rescuePath(familyId: string, houseId: string): string {
  return `/f/${familyId}/c/${houseId}/soccorso`;
}
