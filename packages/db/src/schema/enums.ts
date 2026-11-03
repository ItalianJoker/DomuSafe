import { pgEnum } from 'drizzle-orm/pg-core';

/** `visibility` enum. */
export const visibilityEnum = pgEnum('visibility', ['family', 'personal']);
/** `member_role` enum. */
export const memberRoleEnum = pgEnum('member_role', ['admin', 'parent', 'child', 'caregiver', 'guest']);
/** `membership_status` enum. */
export const membershipStatusEnum = pgEnum('membership_status', ['active', 'suspended', 'left']);
/** `plan_tier` enum. */
export const planTierEnum = pgEnum('plan_tier', ['free', 'basic', 'advanced', 'premium']);
/** `plan_source` enum. */
export const planSourceEnum = pgEnum('plan_source', ['default', 'stripe', 'operator']);
/** `scope_kind` enum. */
export const scopeKindEnum = pgEnum('scope_kind', [
  'family',
  'house_technical',
  'house_guest',
  'resident',
  'personal',
  'vault_family',
  'vault_personal',
]);
/** `grantee_key` enum. */
export const granteeKeyEnum = pgEnum('grantee_key', ['account', 'vault', 'kiosk']);
/** `revision_op` enum. */
export const revisionOpEnum = pgEnum('revision_op', ['create', 'update', 'delete', 'restore']);
/** `actor_kind` enum. */
export const actorKindEnum = pgEnum('actor_kind', ['account', 'kiosk', 'integration', 'system', 'anonymous']);
/** `resident_kind` enum. */
export const residentKindEnum = pgEnum('resident_kind', ['adult', 'child', 'elderly']);
/** `kiosk_profile` enum. */
export const kioskProfileEnum = pgEnum('kiosk_profile', ['standard', 'elderly']);
