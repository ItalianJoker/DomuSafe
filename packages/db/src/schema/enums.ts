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
/** Who a house manual entry is written for. */
export const guideAudienceEnum = pgEnum('guide_audience', ['guest', 'technical']);
/** Subject of a house manual entry. */
export const guideTopicEnum = pgEnum('guide_topic', [
  'wifi',
  'intercom',
  'gate',
  'parcels',
  'waste',
  'pets',
  'plants',
  'heating',
  'appliances',
  'rules',
  'check_in',
  'check_out',
  'other',
]);
/** Which supply a cutoff valve or switch controls. */
export const shutoffKindEnum = pgEnum('shutoff_kind', ['water', 'gas', 'electricity', 'boiler', 'other']);
/** Waste fraction collected by the municipality. */
export const wasteFractionEnum = pgEnum('waste_fraction', [
  'organic',
  'paper',
  'plastic',
  'glass',
  'metal',
  'residual',
  'bulky',
  'green',
  'other',
]);
/** Kind of a family contact. */
export const contactKindEnum = pgEnum('contact_kind', [
  'craftsman',
  'supplier',
  'doctor',
  'veterinarian',
  'neighbor',
  'emergency_service',
  'other',
]);
/** Kind of a household utility contract. */
export const utilityKindEnum = pgEnum('utility_kind', [
  'electricity',
  'gas',
  'water',
  'internet',
  'waste_tax',
  'heating',
  'other',
]);
/** How often a utility or subscription is billed. */
export const billingFrequencyEnum = pgEnum('billing_frequency', [
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'annual',
]);
/** Category of a maintenance task. */
export const maintenanceCategoryEnum = pgEnum('maintenance_category', [
  'heating',
  'cooling',
  'plumbing',
  'electrical',
  'appliances',
  'structure',
  'roof',
  'garden',
  'safety',
  'cleaning',
  'other',
]);
/** Priority of a maintenance task. */
export const maintenancePriorityEnum = pgEnum('maintenance_priority', ['low', 'medium', 'high', 'urgent']);
/** ABO blood group stored on the readable rescue card. */
export const bloodGroupEnum = pgEnum('blood_group', [
  'a_positive',
  'a_negative',
  'b_positive',
  'b_negative',
  'ab_positive',
  'ab_negative',
  'o_positive',
  'o_negative',
  'unknown',
]);
/** How a person moves, for the rescue card. */
export const mobilityEnum = pgEnum('mobility', ['independent', 'assisted', 'wheelchair', 'bedridden']);
/** Species of a pet. */
export const petSpeciesEnum = pgEnum('pet_species', [
  'dog',
  'cat',
  'bird',
  'fish',
  'rabbit',
  'rodent',
  'reptile',
  'horse',
  'other',
]);
/** One Italian annual tax item on a resident. */
export const taxItemKeyEnum = pgEnum('tax_item_key', [
  'declaration',
  'precompiled_return',
  'isee',
  'property_tax',
  'waste_tax',
  'income_tax_first_instalment',
  'income_tax_second_instalment',
]);
/** Progress of a tax checklist item. */
export const taxItemStatusEnum = pgEnum('tax_item_status', ['todo', 'in_progress', 'done', 'not_applicable']);
