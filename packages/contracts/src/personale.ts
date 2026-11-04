import { z } from 'zod';
import { currencySchema, instantSchema, localDateSchema, pageSchema, uuidSchema } from './common.js';

/** Kind of resident, matching `resident_kind`. */
export const RESIDENT_KINDS = ['adult', 'child', 'elderly'] as const;
/** ABO group written in full on the rescue card. */
export const BLOOD_GROUPS = [
  'a_positive',
  'a_negative',
  'b_positive',
  'b_negative',
  'ab_positive',
  'ab_negative',
  'o_positive',
  'o_negative',
  'unknown',
] as const;
/** How the person moves. */
export const MOBILITY_STATUSES = ['independent', 'assisted', 'wheelchair', 'bedridden'] as const;
/** Species of a pet. */
export const PET_SPECIES = [
  'dog',
  'cat',
  'bird',
  'fish',
  'rabbit',
  'rodent',
  'reptile',
  'horse',
  'other',
] as const;
/**
 * Annual Italian tax items. The interface writes the names in full; these keys stay stable.
 * `isee` is the indicator of the equivalent economic situation.
 */
export const TAX_ITEM_KEYS = [
  'declaration',
  'precompiled_return',
  'isee',
  'property_tax',
  'waste_tax',
  'income_tax_first_instalment',
  'income_tax_second_instalment',
] as const;
/** Progress of a tax item. */
export const TAX_ITEM_STATUSES = ['todo', 'in_progress', 'done', 'not_applicable'] as const;

const residentKindSchema = z.enum(RESIDENT_KINDS);
const bloodGroupSchema = z.enum(BLOOD_GROUPS);
const mobilitySchema = z.enum(MOBILITY_STATUSES);
const petSpeciesSchema = z.enum(PET_SPECIES);
const taxItemKeySchema = z.enum(TAX_ITEM_KEYS);
const taxItemStatusSchema = z.enum(TAX_ITEM_STATUSES);

const displayNameSchema = z.string().trim().min(1).max(80);
const phraseSchema = z.string().trim().min(1).max(120);
const phraseListSchema = z.array(phraseSchema).max(40);
const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/);
const phoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/);
const plateValueSchema = z.string().regex(/^[A-Z0-9][A-Z0-9 -]{0,15}$/);
const plateInputSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .transform((value) => value.toUpperCase())
  .refine((value) => plateValueSchema.safeParse(value).success, 'Invalid plate');
const photoSchema = z
  .string()
  .min(32)
  .max(180_000)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
  .nullable();
const costSchema = z
  .object({ amountMinor: z.int().min(0).max(1_000_000_000), currency: currencySchema })
  .strict();
const referenceHintSchema = z
  .string()
  .regex(/^\d{2,8}$/)
  .nullable();

const limitField = z.coerce.number().int().min(1).max(200).default(50);
const cursorField = z.string().max(512).optional();

function atLeastOneField(value: object): boolean {
  return Object.keys(value).length > 0;
}

/** Path parameters of a resident route. */
export const residentParamsSchema = z.object({ familyId: uuidSchema, residentId: uuidSchema }).strict();
/** Path parameters of a pet route. */
export const petParamsSchema = z.object({ familyId: uuidSchema, petId: uuidSchema }).strict();
/** Path parameters of a phone line. */
export const phoneLineParamsSchema = z
  .object({ familyId: uuidSchema, residentId: uuidSchema, phoneLineId: uuidSchema })
  .strict();
/** Path parameters of a personal subscription. */
export const subscriptionParamsSchema = z
  .object({ familyId: uuidSchema, residentId: uuidSchema, subscriptionId: uuidSchema })
  .strict();
/** Path parameters of a vehicle. */
export const vehicleParamsSchema = z
  .object({ familyId: uuidSchema, residentId: uuidSchema, vehicleId: uuidSchema })
  .strict();
/** Path parameters of a personal bank account. */
export const bankAccountParamsSchema = z
  .object({ familyId: uuidSchema, residentId: uuidSchema, accountId: uuidSchema })
  .strict();
/** Path parameters of a tax checklist item. */
export const taxItemParamsSchema = z.object({ familyId: uuidSchema, itemId: uuidSchema }).strict();

/** A person who lives in the family. Medical details are on the rescue card. */
export const residentSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    displayName: displayNameSchema,
    kind: residentKindSchema,
    birthYear: z.int().min(1900).max(2100).nullable(),
    usualBedroom: z.string().min(1).max(80).nullable(),
    photo: photoSchema,
    color: colorSchema,
    houseIds: z.array(uuidSchema),
    planLocked: z.boolean(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Resident' });
/** A person who lives in the family. */
export type Resident = z.infer<typeof residentSchema>;

/** Body of `POST …/residents`. */
export const createResidentRequestSchema = z
  .object({
    displayName: displayNameSchema,
    kind: residentKindSchema.default('adult'),
    birthYear: z.int().min(1900).max(2100).nullable().optional(),
    usualBedroom: z.string().trim().min(1).max(80).nullable().optional(),
    photo: photoSchema.optional(),
    color: colorSchema.optional(),
    houseIds: z.array(uuidSchema).max(50).default([]),
  })
  .strict()
  .meta({ id: 'CreateResidentRequest' });
/** Body of `POST …/residents`. */
export type CreateResidentRequest = z.infer<typeof createResidentRequestSchema>;

/** Body of `PATCH …/residents/{residentId}`. */
export const updateResidentRequestSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    kind: residentKindSchema.optional(),
    birthYear: z.int().min(1900).max(2100).nullable().optional(),
    usualBedroom: z.string().trim().min(1).max(80).nullable().optional(),
    photo: photoSchema.optional(),
    color: colorSchema.optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateResidentRequest' });
/** Body of `PATCH …/residents/{residentId}`. */
export type UpdateResidentRequest = z.infer<typeof updateResidentRequestSchema>;

/** Body of `PUT …/residents/{residentId}/houses`. */
export const replaceResidentHousesRequestSchema = z
  .object({ houseIds: z.array(uuidSchema).max(50) })
  .strict()
  .meta({ id: 'ReplaceResidentHousesRequest' });
/** Body of `PUT …/residents/{residentId}/houses`. */
export type ReplaceResidentHousesRequest = z.infer<typeof replaceResidentHousesRequestSchema>;

/** Query of `GET …/residents`. */
export const residentListQuerySchema = z
  .object({ limit: limitField, cursor: cursorField, houseId: uuidSchema.optional() })
  .strict();

/** Response of `GET …/residents`. */
export const residentPageSchema = pageSchema(residentSchema).meta({ id: 'ResidentPage' });

const medicineInputSchema = z
  .object({ name: phraseSchema, location: z.string().trim().min(1).max(300) })
  .strict();
const contactInputSchema = z
  .object({
    displayName: displayNameSchema,
    phone: phoneSchema.nullable(),
    relationship: z.string().trim().min(1).max(80).nullable(),
    hasKeys: z.boolean(),
  })
  .strict();

/** A lifesaving medicine and the place it is kept. */
export const lifesavingMedicineSchema = medicineInputSchema
  .extend({ id: uuidSchema, sortOrder: z.int().min(0) })
  .strict()
  .meta({ id: 'LifesavingMedicine' });
/** A lifesaving medicine and the place it is kept. */
export type LifesavingMedicine = z.infer<typeof lifesavingMedicineSchema>;

/** An emergency contact, in the order the family wants them called. */
export const emergencyContactSchema = contactInputSchema
  .extend({ id: uuidSchema, sortOrder: z.int().min(0) })
  .strict()
  .meta({ id: 'EmergencyContact' });
/** An emergency contact, in the order the family wants them called. */
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;

/** The readable rescue card of one resident. */
export const rescueCardSchema = z
  .object({
    residentId: uuidSchema,
    familyId: uuidSchema,
    bloodGroup: bloodGroupSchema.nullable(),
    mobility: mobilitySchema.nullable(),
    allergies: phraseListSchema,
    conditions: phraseListSchema,
    devices: phraseListSchema,
    medicines: z.array(lifesavingMedicineSchema),
    contacts: z.array(emergencyContactSchema),
    version: z.int().min(1),
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'RescueCard' });
/** The readable rescue card of one resident. */
export type RescueCard = z.infer<typeof rescueCardSchema>;

/** Body of `PUT …/residents/{residentId}/rescue`. Replaces medicines and contacts in order. */
export const putRescueRequestSchema = z
  .object({
    bloodGroup: bloodGroupSchema.nullable(),
    mobility: mobilitySchema.nullable(),
    allergies: phraseListSchema,
    conditions: phraseListSchema,
    devices: phraseListSchema,
    medicines: z.array(medicineInputSchema).max(30),
    contacts: z.array(contactInputSchema).max(20),
  })
  .strict()
  .meta({ id: 'PutRescueRequest' });
/** Body of `PUT …/residents/{residentId}/rescue`. */
export type PutRescueRequest = z.infer<typeof putRescueRequestSchema>;

/** One person on the readable rescue sheet of a house. */
export const rescueSheetResidentSchema = z
  .object({
    id: uuidSchema,
    displayName: displayNameSchema,
    birthYear: z.int().nullable(),
    usualBedroom: z.string().nullable(),
    photo: photoSchema,
    bloodGroup: bloodGroupSchema.nullable(),
    mobility: mobilitySchema.nullable(),
    allergies: phraseListSchema,
    conditions: phraseListSchema,
    devices: phraseListSchema,
    medicines: z.array(lifesavingMedicineSchema),
    contacts: z.array(emergencyContactSchema),
  })
  .strict()
  .meta({ id: 'RescueSheetResident' });

/** A pet as shown on the rescue sheet. */
export const rescueSheetPetSchema = z
  .object({
    id: uuidSchema,
    name: displayNameSchema,
    species: petSpeciesSchema,
    vetName: z.string().nullable(),
    vetPhone: phoneSchema.nullable(),
    vetAddress: z.string().nullable(),
  })
  .strict()
  .meta({ id: 'RescueSheetPet' });

/** What to read aloud for the people and animals of one house. */
export const rescueSheetSchema = z
  .object({
    houseId: uuidSchema,
    residents: z.array(rescueSheetResidentSchema),
    pets: z.array(rescueSheetPetSchema),
  })
  .strict()
  .meta({ id: 'RescueSheet' });
/** What to read aloud for the people and animals of one house. */
export type RescueSheet = z.infer<typeof rescueSheetSchema>;

/** A pet and its veterinary clinic. */
export const petSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    name: displayNameSchema,
    species: petSpeciesSchema,
    breed: z.string().nullable(),
    notes: z.string().nullable(),
    vetName: z.string().nullable(),
    vetPhone: phoneSchema.nullable(),
    vetAddress: z.string().nullable(),
    houseIds: z.array(uuidSchema),
    planLocked: z.boolean(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Pet' });
/** A pet and its veterinary clinic. */
export type Pet = z.infer<typeof petSchema>;

/** Body of `POST …/pets`. */
export const createPetRequestSchema = z
  .object({
    name: displayNameSchema,
    species: petSpeciesSchema,
    breed: z.string().trim().min(1).max(80).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    vetName: z.string().trim().min(1).max(120).nullable().optional(),
    vetPhone: phoneSchema.nullable().optional(),
    vetAddress: z.string().trim().min(1).max(300).nullable().optional(),
    houseIds: z.array(uuidSchema).max(50).default([]),
  })
  .strict()
  .meta({ id: 'CreatePetRequest' });
/** Body of `POST …/pets`. */
export type CreatePetRequest = z.infer<typeof createPetRequestSchema>;

/** Body of `PATCH …/pets/{petId}`. */
export const updatePetRequestSchema = z
  .object({
    name: displayNameSchema.optional(),
    species: petSpeciesSchema.optional(),
    breed: z.string().trim().min(1).max(80).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    vetName: z.string().trim().min(1).max(120).nullable().optional(),
    vetPhone: phoneSchema.nullable().optional(),
    vetAddress: z.string().trim().min(1).max(300).nullable().optional(),
    houseIds: z.array(uuidSchema).max(50).optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdatePetRequest' });
/** Body of `PATCH …/pets/{petId}`. */
export type UpdatePetRequest = z.infer<typeof updatePetRequestSchema>;

/** Query of `GET …/pets`. */
export const petListQuerySchema = z
  .object({ limit: limitField, cursor: cursorField, houseId: uuidSchema.optional() })
  .strict();
/** Response of `GET …/pets`. */
export const petPageSchema = pageSchema(petSchema).meta({ id: 'PetPage' });

/** A personal mobile plan. */
export const phoneLineSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    residentId: uuidSchema,
    operatorName: z.string(),
    phoneNumber: phoneSchema,
    planName: z.string(),
    monthlyCost: costSchema.nullable(),
    renewalDate: localDateSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'PhoneLine' });
/** A personal mobile plan. */
export type PhoneLine = z.infer<typeof phoneLineSchema>;

/** Body of `POST …/phone-lines`. */
export const createPhoneLineRequestSchema = z
  .object({
    operatorName: z.string().trim().min(1).max(80),
    phoneNumber: phoneSchema,
    planName: z.string().trim().min(1).max(120),
    monthlyCost: costSchema.nullable().optional(),
    renewalDate: localDateSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreatePhoneLineRequest' });
/** Body of `POST …/phone-lines`. */
export type CreatePhoneLineRequest = z.infer<typeof createPhoneLineRequestSchema>;

/** Body of `PATCH …/phone-lines/{phoneLineId}`. */
export const updatePhoneLineRequestSchema = z
  .object({
    operatorName: z.string().trim().min(1).max(80).optional(),
    phoneNumber: phoneSchema.optional(),
    planName: z.string().trim().min(1).max(120).optional(),
    monthlyCost: costSchema.nullable().optional(),
    renewalDate: localDateSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdatePhoneLineRequest' });
/** Body of `PATCH …/phone-lines/{phoneLineId}`. */
export type UpdatePhoneLineRequest = z.infer<typeof updatePhoneLineRequestSchema>;

/** Query of a resident-scoped list. */
export const residentScopedListQuerySchema = z.object({ limit: limitField, cursor: cursorField }).strict();
/** Response of `GET …/phone-lines`. */
export const phoneLinePageSchema = pageSchema(phoneLineSchema).meta({ id: 'PhoneLinePage' });

/** A personal subscription. */
export const subscriptionSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    residentId: uuidSchema,
    name: z.string(),
    providerName: z.string().nullable(),
    renewalDate: localDateSchema.nullable(),
    cost: costSchema.nullable(),
    notes: z.string().nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'PersonalSubscription' });
/** A personal subscription. */
export type PersonalSubscription = z.infer<typeof subscriptionSchema>;

/** Body of `POST …/subscriptions`. */
export const createSubscriptionRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    providerName: z.string().trim().min(1).max(120).nullable().optional(),
    renewalDate: localDateSchema.nullable().optional(),
    cost: costSchema.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreatePersonalSubscriptionRequest' });
/** Body of `POST …/subscriptions`. */
export type CreatePersonalSubscriptionRequest = z.infer<typeof createSubscriptionRequestSchema>;

/** Body of `PATCH …/subscriptions/{subscriptionId}`. */
export const updateSubscriptionRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    providerName: z.string().trim().min(1).max(120).nullable().optional(),
    renewalDate: localDateSchema.nullable().optional(),
    cost: costSchema.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdatePersonalSubscriptionRequest' });
/** Body of `PATCH …/subscriptions/{subscriptionId}`. */
export type UpdatePersonalSubscriptionRequest = z.infer<typeof updateSubscriptionRequestSchema>;
/** Response of `GET …/subscriptions`. */
export const subscriptionPageSchema = pageSchema(subscriptionSchema).meta({ id: 'PersonalSubscriptionPage' });

/** A vehicle and its insurance, circulation tax and inspection dates. */
export const vehicleSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    residentId: uuidSchema,
    plate: plateValueSchema,
    make: z.string().nullable(),
    model: z.string().nullable(),
    insuranceRenewalDate: localDateSchema.nullable(),
    roadTaxDueDate: localDateSchema.nullable(),
    inspectionDueDate: localDateSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Vehicle' });
/** A vehicle and its insurance, circulation tax and inspection dates. */
export type Vehicle = z.infer<typeof vehicleSchema>;

/** Body of `POST …/vehicles`. */
export const createVehicleRequestSchema = z
  .object({
    plate: plateInputSchema,
    make: z.string().trim().min(1).max(80).nullable().optional(),
    model: z.string().trim().min(1).max(80).nullable().optional(),
    insuranceRenewalDate: localDateSchema.nullable().optional(),
    roadTaxDueDate: localDateSchema.nullable().optional(),
    inspectionDueDate: localDateSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateVehicleRequest' });
/** Body of `POST …/vehicles`. */
export type CreateVehicleRequest = z.infer<typeof createVehicleRequestSchema>;

/** Body of `PATCH …/vehicles/{vehicleId}`. */
export const updateVehicleRequestSchema = z
  .object({
    plate: plateInputSchema.optional(),
    make: z.string().trim().min(1).max(80).nullable().optional(),
    model: z.string().trim().min(1).max(80).nullable().optional(),
    insuranceRenewalDate: localDateSchema.nullable().optional(),
    roadTaxDueDate: localDateSchema.nullable().optional(),
    inspectionDueDate: localDateSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateVehicleRequest' });
/** Body of `PATCH …/vehicles/{vehicleId}`. */
export type UpdateVehicleRequest = z.infer<typeof updateVehicleRequestSchema>;
/** Response of `GET …/vehicles`. */
export const vehiclePageSchema = pageSchema(vehicleSchema).meta({ id: 'VehiclePage' });

/**
 * Metadata of a personal bank account. `referenceHint` is a few trailing digits.
 * The full account number is rejected.
 */
export const personalBankAccountSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    residentId: uuidSchema,
    institution: z.string(),
    label: z.string(),
    referenceHint: referenceHintSchema,
    notes: z.string().nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'PersonalBankAccount' });
/** Metadata of a personal bank account. */
export type PersonalBankAccount = z.infer<typeof personalBankAccountSchema>;

/** Body of `POST …/bank-accounts`. */
export const createBankAccountRequestSchema = z
  .object({
    institution: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(80),
    referenceHint: referenceHintSchema.optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreatePersonalBankAccountRequest' });
/** Body of `POST …/bank-accounts`. */
export type CreatePersonalBankAccountRequest = z.infer<typeof createBankAccountRequestSchema>;

/** Body of `PATCH …/bank-accounts/{accountId}`. */
export const updateBankAccountRequestSchema = z
  .object({
    institution: z.string().trim().min(1).max(120).optional(),
    label: z.string().trim().min(1).max(80).optional(),
    referenceHint: referenceHintSchema.optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdatePersonalBankAccountRequest' });
/** Body of `PATCH …/bank-accounts/{accountId}`. */
export type UpdatePersonalBankAccountRequest = z.infer<typeof updateBankAccountRequestSchema>;
/** Response of `GET …/bank-accounts`. */
export const bankAccountPageSchema = pageSchema(personalBankAccountSchema).meta({
  id: 'PersonalBankAccountPage',
});

/** One tax checklist row. */
export const taxChecklistItemSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    residentId: uuidSchema,
    taxYear: z.int().min(2000).max(2100),
    itemKey: taxItemKeySchema,
    dueDate: localDateSchema.nullable(),
    status: taxItemStatusSchema,
    version: z.int().min(1),
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'TaxChecklistItem' });
/** One tax checklist row. */
export type TaxChecklistItem = z.infer<typeof taxChecklistItemSchema>;

/** Query of `GET …/tax-checklist`. */
export const taxListQuerySchema = z
  .object({
    residentId: uuidSchema,
    year: z.coerce.number().int().min(2000).max(2100),
  })
  .strict();

/** Response of `GET …/tax-checklist` and of generate. */
export const taxChecklistSchema = z
  .object({
    residentId: uuidSchema,
    taxYear: z.int(),
    items: z.array(taxChecklistItemSchema),
  })
  .strict()
  .meta({ id: 'TaxChecklist' });
/** Response of `GET …/tax-checklist` and of generate. */
export type TaxChecklist = z.infer<typeof taxChecklistSchema>;

/** Body of `POST …/tax-checklist/generate`. */
export const generateTaxChecklistRequestSchema = z
  .object({
    residentId: uuidSchema,
    year: z.int().min(2000).max(2100),
  })
  .strict()
  .meta({ id: 'GenerateTaxChecklistRequest' });
/** Body of `POST …/tax-checklist/generate`. */
export type GenerateTaxChecklistRequest = z.infer<typeof generateTaxChecklistRequestSchema>;

/** Body of `PATCH …/tax-checklist/{itemId}`. */
export const updateTaxItemRequestSchema = z
  .object({
    dueDate: localDateSchema.nullable().optional(),
    status: taxItemStatusSchema.optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateTaxChecklistItemRequest' });
/** Body of `PATCH …/tax-checklist/{itemId}`. */
export type UpdateTaxChecklistItemRequest = z.infer<typeof updateTaxItemRequestSchema>;
