import { z } from 'zod';
import { PLAN_TIERS } from '@domusafe/plans';
import { MEMBER_ROLES } from './access.js';
import { currencySchema, instantSchema, localeSchema, pageSchema, timeZoneSchema, uuidSchema } from './common.js';

const nameSchema = z.string().trim().min(1).max(120);

/** Family role. */
export const memberRoleSchema = z.enum(MEMBER_ROLES).meta({ id: 'MemberRole' });
/** Plan tier. */
export const planTierSchema = z.enum(PLAN_TIERS).meta({ id: 'PlanTier' });

/** Effective plan of a family. */
export const effectivePlanSchema = z
  .object({
    tier: planTierSchema,
    source: z.enum(['paid', 'trial']),
    trialEndsAt: instantSchema.nullable(),
    watermark: z.boolean(),
  })
  .strict()
  .meta({ id: 'EffectivePlan' });

/** A family as returned by the API. */
export const familySchema = z
  .object({
    id: uuidSchema,
    name: nameSchema,
    ownerAccountId: uuidSchema,
    timezone: timeZoneSchema,
    baseCurrency: currencySchema,
    locale: localeSchema,
    plan: effectivePlanSchema,
    role: memberRoleSchema,
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Family' });
/** A family as returned by the API. */
export type Family = z.infer<typeof familySchema>;

/** Body of `POST /families`: the family and its first house are created together. */
export const createFamilyRequestSchema = z
  .object({
    name: nameSchema,
    timezone: timeZoneSchema.default('Europe/Rome'),
    baseCurrency: currencySchema.default('EUR'),
    locale: localeSchema.default('it'),
    firstHouse: z.object({ name: nameSchema }).strict(),
  })
  .strict()
  .meta({ id: 'CreateFamilyRequest' });
/** Body of `POST /families`. */
export type CreateFamilyRequest = z.infer<typeof createFamilyRequestSchema>;

/** Body of `PATCH /families/{familyId}`. */
export const updateFamilyRequestSchema = z
  .object({
    name: nameSchema.optional(),
    timezone: timeZoneSchema.optional(),
    baseCurrency: currencySchema.optional(),
    locale: localeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')
  .meta({ id: 'UpdateFamilyRequest' });
/** Body of `PATCH /families/{familyId}`. */
export type UpdateFamilyRequest = z.infer<typeof updateFamilyRequestSchema>;

/** Response of `GET /families`. */
export const familyListSchema = z.object({ items: z.array(familySchema) }).strict().meta({ id: 'FamilyList' });

const addressField = z.string().trim().max(200).nullable();

/** A house as returned by the API. */
export const houseSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    name: nameSchema,
    addressLine: addressField,
    postalCode: z.string().trim().max(16).nullable(),
    city: z.string().trim().max(120).nullable(),
    province: z.string().trim().max(60).nullable(),
    country: z.string().regex(/^[A-Z]{2}$/),
    sortOrder: z.int().min(0).max(32_767),
    planLocked: z.boolean(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'House' });
/** A house as returned by the API. */
export type House = z.infer<typeof houseSchema>;

/** Body of `POST /families/{familyId}/houses`. */
export const createHouseRequestSchema = z
  .object({
    name: nameSchema,
    addressLine: addressField.optional(),
    postalCode: z.string().trim().max(16).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    province: z.string().trim().max(60).nullable().optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default('IT'),
    sortOrder: z.int().min(0).max(32_767).optional(),
  })
  .strict()
  .meta({ id: 'CreateHouseRequest' });
/** Body of `POST /families/{familyId}/houses`. */
export type CreateHouseRequest = z.infer<typeof createHouseRequestSchema>;

/** Body of `PATCH /families/{familyId}/houses/{houseId}`. */
export const updateHouseRequestSchema = z
  .object({
    name: nameSchema.optional(),
    addressLine: addressField.optional(),
    postalCode: z.string().trim().max(16).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    province: z.string().trim().max(60).nullable().optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    sortOrder: z.int().min(0).max(32_767).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')
  .meta({ id: 'UpdateHouseRequest' });
/** Body of `PATCH /families/{familyId}/houses/{houseId}`. */
export type UpdateHouseRequest = z.infer<typeof updateHouseRequestSchema>;

/** Response of `GET /families/{familyId}/houses`. */
export const housePageSchema = pageSchema(houseSchema).meta({ id: 'HousePage' });

/** A membership as returned by the API. */
export const membershipSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    accountId: uuidSchema,
    displayName: z.string(),
    role: memberRoleSchema,
    isOwner: z.boolean(),
    status: z.enum(['active', 'suspended', 'left']),
    allHouses: z.boolean(),
    houseIds: z.array(uuidSchema),
    allResidents: z.boolean(),
    residentIds: z.array(uuidSchema),
    vaultFamily: z.boolean(),
    expiresAt: instantSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Membership' });
/** A membership as returned by the API. */
export type Membership = z.infer<typeof membershipSchema>;

/** Response of `GET /families/{familyId}/members`. */
export const membershipPageSchema = pageSchema(membershipSchema).meta({ id: 'MembershipPage' });

/** Body of `PATCH /families/{familyId}/members/{membershipId}`. */
export const updateMembershipRequestSchema = z
  .object({
    role: memberRoleSchema.optional(),
    allHouses: z.boolean().optional(),
    houseIds: z.array(uuidSchema).max(500).optional(),
    allResidents: z.boolean().optional(),
    residentIds: z.array(uuidSchema).max(500).optional(),
    vaultFamily: z.boolean().optional(),
    expiresAt: instantSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')
  .meta({ id: 'UpdateMembershipRequest' });
/** Body of `PATCH /families/{familyId}/members/{membershipId}`. */
export type UpdateMembershipRequest = z.infer<typeof updateMembershipRequestSchema>;

/** Response of `GET /me`. */
export const meSchema = z
  .object({
    accountId: uuidSchema,
    email: z.email(),
    emailVerified: z.boolean(),
    displayName: z.string(),
    locale: localeSchema,
    theme: z.enum(['light', 'dark', 'system']),
    twoFactorEnabled: z.boolean(),
    primaryFamilyId: uuidSchema.nullable(),
    lastFamilyId: uuidSchema.nullable(),
    lastHouseId: uuidSchema.nullable(),
    families: z.array(
      z
        .object({ id: uuidSchema, name: z.string(), role: memberRoleSchema, plan: planTierSchema })
        .strict(),
    ),
  })
  .strict()
  .meta({ id: 'Me' });
/** Response of `GET /me`. */
export type Me = z.infer<typeof meSchema>;

/** Body of `PATCH /me/profile`. */
export const updateProfileRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    locale: localeSchema.optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
    lastFamilyId: uuidSchema.nullable().optional(),
    lastHouseId: uuidSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')
  .meta({ id: 'UpdateProfileRequest' });
/** Body of `PATCH /me/profile`. */
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

/** Path parameters with a family id. */
export const familyParamsSchema = z.object({ familyId: uuidSchema }).strict();
/** Path parameters with a family and a house id. */
export const houseParamsSchema = z.object({ familyId: uuidSchema, houseId: uuidSchema }).strict();
/** Path parameters with a family and a membership id. */
export const membershipParamsSchema = z.object({ familyId: uuidSchema, membershipId: uuidSchema }).strict();
