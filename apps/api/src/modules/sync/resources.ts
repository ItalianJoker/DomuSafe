import type { Permission } from '@domusafe/contracts';

/**
 * Read permission required to list or fetch revisions of a resource type.
 * Unknown types fall back to `family.read` (member) and still pass through RLS.
 */
const READ_PERMISSION: Readonly<Record<string, Permission>> = {
  house_guide_entries: 'house.read',
  house_shutoffs: 'house.read',
  waste_collections: 'house.read',
  contacts: 'contacts.read',
  utilities: 'utilities.read',
  maintenance_tasks: 'maintenance.read',
  houses: 'houses.read',
  families: 'family.read',
  family_branding: 'qr.manage',
  residents: 'residents.read',
  pets: 'pets.read',
  vault_items: 'vault.family.read',
};

/**
 * Write permission required to restore a revision of a resource type.
 * Only types with a known restore path are listed; others refuse restore.
 */
const WRITE_PERMISSION: Readonly<Record<string, Permission>> = {
  house_guide_entries: 'house.write',
};

/**
 * Resource types this slice can restore from a class C snapshot.
 */
export const RESTORABLE_RESOURCE_TYPES = new Set(Object.keys(WRITE_PERMISSION));

/**
 * Permission to read revisions of a resource type.
 *
 * @param resourceType - Stored resource type.
 * @returns Catalogue permission.
 */
export function readPermissionFor(resourceType: string): Permission {
  return READ_PERMISSION[resourceType] ?? 'family.read';
}

/**
 * Permission to restore a revision of a resource type, or `null` when restore is unsupported.
 *
 * @param resourceType - Stored resource type.
 * @returns Catalogue permission, or `null`.
 */
export function writePermissionFor(resourceType: string): Permission | null {
  return WRITE_PERMISSION[resourceType] ?? null;
}
