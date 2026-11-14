import { z } from 'zod';
import {
  currencySchema,
  instantSchema,
  localDateSchema,
  pageSchema,
  sealedSchema,
  uuidSchema,
  uuidV7Schema,
} from './common.js';

/** Who a house manual entry is written for. */
export const GUIDE_AUDIENCES = ['guest', 'technical'] as const;
/** Subject of a house manual entry. */
export const GUIDE_TOPICS = [
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
] as const;
/** Which supply a cutoff controls. */
export const SHUTOFF_KINDS = ['water', 'gas', 'electricity', 'boiler', 'other'] as const;
/** Waste fraction collected by the municipality. */
export const WASTE_FRACTIONS = [
  'organic',
  'paper',
  'plastic',
  'glass',
  'metal',
  'residual',
  'bulky',
  'green',
  'other',
] as const;
/** Kind of a family contact. */
export const CONTACT_KINDS = [
  'craftsman',
  'supplier',
  'doctor',
  'veterinarian',
  'neighbor',
  'emergency_service',
  'other',
] as const;
/** Kind of a household utility contract. */
export const UTILITY_KINDS = [
  'electricity',
  'gas',
  'water',
  'internet',
  'waste_tax',
  'heating',
  'other',
] as const;
/** How often a bill is issued. */
export const BILLING_FREQUENCIES = ['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'] as const;
/** Unit of consumption printed on a utility bill. */
export const CONSUMPTION_UNITS = ['kwh', 'smc', 'm3', 'gb'] as const;
/** Category of a maintenance task. */
export const MAINTENANCE_CATEGORIES = [
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
] as const;
/** Priority of a maintenance task. */
export const MAINTENANCE_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

const guideAudienceSchema = z.enum(GUIDE_AUDIENCES);
const guideTopicSchema = z.enum(GUIDE_TOPICS);
const shutoffKindSchema = z.enum(SHUTOFF_KINDS);
const wasteFractionSchema = z.enum(WASTE_FRACTIONS);
const contactKindSchema = z.enum(CONTACT_KINDS);
const utilityKindSchema = z.enum(UTILITY_KINDS);
const billingFrequencySchema = z.enum(BILLING_FREQUENCIES);
const consumptionUnitSchema = z.enum(CONSUMPTION_UNITS);
const maintenanceCategorySchema = z.enum(MAINTENANCE_CATEGORIES);
const maintenancePrioritySchema = z.enum(MAINTENANCE_PRIORITIES);

const titleSchema = z.string().trim().min(1).max(160);
const shortTitleSchema = z.string().trim().min(1).max(140);
const bodySchema = z.string().trim().max(8000);
const instructionsSchema = z.string().trim().max(2000);
const notesSchema = z.string().trim().max(2000);
const locationSchema = z.string().trim().min(1).max(300);
const codeSchema = z.string().trim().min(1).max(80);
const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');
const rruleSchema = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .regex(/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,-]+)*$/, 'Invalid recurrence');
const phoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/, 'Expected an international phone number');
const costSchema = z
  .object({ amountMinor: z.int().min(0).max(1_000_000_000_000), currency: currencySchema })
  .strict();

const limitField = z.coerce.number().int().min(1).max(200).default(50);
const cursorField = z.string().max(512).optional();

function atLeastOneField(value: object): boolean {
  return Object.keys(value).length > 0;
}

/** One house-manual entry as returned by the API. Secrets travel only inside `sealed`. */
export const guideEntrySchema = z
  .object({
    id: uuidV7Schema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    audience: guideAudienceSchema,
    topic: guideTopicSchema,
    title: titleSchema,
    body: bodySchema,
    sortOrder: z.int().min(0).max(32_767),
    sealed: sealedSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'GuideEntry' });
/** One house-manual entry. */
export type GuideEntry = z.infer<typeof guideEntrySchema>;

/** Body of `POST …/guide-entries`. The id is a UUIDv7 from the browser. */
export const createGuideEntryRequestSchema = z
  .object({
    id: uuidV7Schema,
    audience: guideAudienceSchema,
    topic: guideTopicSchema,
    title: titleSchema,
    body: bodySchema.default(''),
    sortOrder: z.int().min(0).max(32_767).default(0),
    sealed: sealedSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateGuideEntryRequest' });
/** Body of `POST …/guide-entries`. */
export type CreateGuideEntryRequest = z.infer<typeof createGuideEntryRequestSchema>;

/** Body of `PATCH …/guide-entries/{entryId}`. `sealed: null` removes the secret. */
export const updateGuideEntryRequestSchema = z
  .object({
    audience: guideAudienceSchema.optional(),
    topic: guideTopicSchema.optional(),
    title: titleSchema.optional(),
    body: bodySchema.optional(),
    sortOrder: z.int().min(0).max(32_767).optional(),
    sealed: sealedSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateGuideEntryRequest' });
/** Body of `PATCH …/guide-entries/{entryId}`. */
export type UpdateGuideEntryRequest = z.infer<typeof updateGuideEntryRequestSchema>;

/** Query of `GET …/guide-entries`. */
export const guideListQuerySchema = z
  .object({ limit: limitField, cursor: cursorField, audience: guideAudienceSchema.optional() })
  .strict();

/** Response of `GET …/guide-entries`. */
export const guideEntryPageSchema = pageSchema(guideEntrySchema).meta({ id: 'GuideEntryPage' });

/** A cutoff location. */
export const shutoffSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    kind: shutoffKindSchema,
    location: locationSchema,
    instructions: instructionsSchema,
    visibleToGuests: z.boolean(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Shutoff' });
/** A cutoff location. */
export type Shutoff = z.infer<typeof shutoffSchema>;

/** Body of `POST …/shutoffs`. */
export const createShutoffRequestSchema = z
  .object({
    kind: shutoffKindSchema,
    location: locationSchema,
    instructions: instructionsSchema.default(''),
    visibleToGuests: z.boolean().default(true),
  })
  .strict()
  .meta({ id: 'CreateShutoffRequest' });
/** Body of `POST …/shutoffs`. */
export type CreateShutoffRequest = z.infer<typeof createShutoffRequestSchema>;

/** Body of `PATCH …/shutoffs/{shutoffId}`. */
export const updateShutoffRequestSchema = z
  .object({
    kind: shutoffKindSchema.optional(),
    location: locationSchema.optional(),
    instructions: instructionsSchema.optional(),
    visibleToGuests: z.boolean().optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateShutoffRequest' });
/** Body of `PATCH …/shutoffs/{shutoffId}`. */
export type UpdateShutoffRequest = z.infer<typeof updateShutoffRequestSchema>;

/** Response of `GET …/shutoffs`. */
export const shutoffPageSchema = pageSchema(shutoffSchema).meta({ id: 'ShutoffPage' });

/** One waste collection rule. */
export const wasteCollectionSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    fraction: wasteFractionSchema,
    rrule: rruleSchema.nullable(),
    collectionTime: clockTimeSchema.nullable(),
    instructions: instructionsSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'WasteCollection' });
/** One waste collection rule. */
export type WasteCollection = z.infer<typeof wasteCollectionSchema>;

/** Body of `POST …/waste-collections`. */
export const createWasteCollectionRequestSchema = z
  .object({
    fraction: wasteFractionSchema,
    rrule: rruleSchema.nullable().optional(),
    collectionTime: clockTimeSchema.nullable().optional(),
    instructions: instructionsSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateWasteCollectionRequest' });
/** Body of `POST …/waste-collections`. */
export type CreateWasteCollectionRequest = z.infer<typeof createWasteCollectionRequestSchema>;

/** Body of `PATCH …/waste-collections/{collectionId}`. */
export const updateWasteCollectionRequestSchema = z
  .object({
    fraction: wasteFractionSchema.optional(),
    rrule: rruleSchema.nullable().optional(),
    collectionTime: clockTimeSchema.nullable().optional(),
    instructions: instructionsSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateWasteCollectionRequest' });
/** Body of `PATCH …/waste-collections/{collectionId}`. */
export type UpdateWasteCollectionRequest = z.infer<typeof updateWasteCollectionRequestSchema>;

/** Response of `GET …/waste-collections`. */
export const wasteCollectionPageSchema = pageSchema(wasteCollectionSchema).meta({
  id: 'WasteCollectionPage',
});

/** What a guest of this house is allowed to read. */
export const guestViewSchema = z
  .object({
    houseId: uuidSchema,
    entries: z.array(guideEntrySchema),
    wasteCollections: z.array(wasteCollectionSchema),
  })
  .strict()
  .meta({ id: 'GuestView' });
/** What a guest of this house is allowed to read. */
export type GuestView = z.infer<typeof guestViewSchema>;

/** A contact in the family address book. */
export const contactSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    visibility: z.enum(['family', 'personal']),
    houseId: uuidSchema.nullable(),
    kind: contactKindSchema,
    trade: z.string().max(80).nullable(),
    displayName: z.string().min(1).max(120),
    company: z.string().max(160).nullable(),
    phone: phoneSchema.nullable(),
    email: z.email().nullable(),
    website: z.string().max(300).nullable(),
    address: z.string().max(300).nullable(),
    notes: notesSchema.nullable(),
    rating: z.int().min(1).max(5).nullable(),
    visibleToGuests: z.boolean(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Contact' });
/** A contact in the family address book. */
export type Contact = z.infer<typeof contactSchema>;

/** Body of `POST …/contacts`. */
export const createContactRequestSchema = z
  .object({
    visibility: z.enum(['family', 'personal']).default('family'),
    houseId: uuidSchema.nullable().optional(),
    kind: contactKindSchema,
    trade: z.string().trim().min(1).max(80).nullable().optional(),
    displayName: z.string().trim().min(1).max(120),
    company: z.string().trim().min(1).max(160).nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    email: z.email().nullable().optional(),
    website: z.string().trim().min(1).max(300).nullable().optional(),
    address: z.string().trim().min(1).max(300).nullable().optional(),
    notes: notesSchema.nullable().optional(),
    rating: z.int().min(1).max(5).nullable().optional(),
    visibleToGuests: z.boolean().default(false),
  })
  .strict()
  .meta({ id: 'CreateContactRequest' });
/** Body of `POST …/contacts`. */
export type CreateContactRequest = z.infer<typeof createContactRequestSchema>;

/** Body of `PATCH …/contacts/{contactId}`. */
export const updateContactRequestSchema = z
  .object({
    visibility: z.enum(['family', 'personal']).optional(),
    houseId: uuidSchema.nullable().optional(),
    kind: contactKindSchema.optional(),
    trade: z.string().trim().min(1).max(80).nullable().optional(),
    displayName: z.string().trim().min(1).max(120).optional(),
    company: z.string().trim().min(1).max(160).nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    email: z.email().nullable().optional(),
    website: z.string().trim().min(1).max(300).nullable().optional(),
    address: z.string().trim().min(1).max(300).nullable().optional(),
    notes: notesSchema.nullable().optional(),
    rating: z.int().min(1).max(5).nullable().optional(),
    visibleToGuests: z.boolean().optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateContactRequest' });
/** Body of `PATCH …/contacts/{contactId}`. */
export type UpdateContactRequest = z.infer<typeof updateContactRequestSchema>;

/** Query of `GET …/contacts`. */
export const contactListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    kind: contactKindSchema.optional(),
    houseId: uuidSchema.optional(),
  })
  .strict();

/** Response of `GET …/contacts`. */
export const contactPageSchema = pageSchema(contactSchema).meta({ id: 'ContactPage' });

/** Labels that help fill a payment form from a bill. */
export const utilityFieldHintsSchema = z
  .record(z.string().min(1).max(40), z.string().trim().min(1).max(120))
  .refine((value) => Object.keys(value).length <= 32, 'At most 32 field hints')
  .meta({ id: 'UtilityFieldHints' });
/** Labels that help fill a payment form from a bill. */
export type UtilityFieldHints = z.infer<typeof utilityFieldHintsSchema>;

/** Regular expressions keyed by field name for browser-side bill recognition. */
export const utilityRecognitionPatternsSchema = z
  .record(z.string().min(1).max(40), z.array(z.string().min(1).max(400)).min(1).max(8))
  .refine((value) => Object.keys(value).length <= 32, 'At most 32 recognition fields')
  .meta({ id: 'UtilityRecognitionPatterns' });
/** Regular expressions keyed by field name for browser-side bill recognition. */
export type UtilityRecognitionPatterns = z.infer<typeof utilityRecognitionPatternsSchema>;

/**
 * Structured values recognised from a bill in the browser.
 * Amounts stay in minor units; payment coordinates are Class C hints the person confirms.
 */
export const utilityBillExtractedSchema = z
  .object({
    providerName: z.string().trim().min(1).max(160).optional(),
    customerCode: codeSchema.optional(),
    contractCode: codeSchema.optional(),
    supplyPointCode: codeSchema.optional(),
    tariffName: z.string().trim().min(1).max(120).optional(),
    amountMinor: z.int().min(0).max(1_000_000_000_000).optional(),
    currency: currencySchema.optional(),
    dueDate: localDateSchema.optional(),
    issueDate: localDateSchema.optional(),
    periodStart: localDateSchema.optional(),
    periodEnd: localDateSchema.optional(),
    consumption: z
      .string()
      .regex(/^-?\d+(\.\d{1,3})?$/, 'Expected a decimal string')
      .optional(),
    consumptionUnit: consumptionUnitSchema.optional(),
    iban: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/, 'Expected an international bank account number')
      .optional(),
    payeeName: z.string().trim().min(1).max(160).optional(),
    rawText: z.string().max(20_000).optional(),
    templateId: uuidSchema.optional(),
  })
  .strict()
  .meta({ id: 'UtilityBillExtracted' });
/** Structured values recognised from a bill in the browser. */
export type UtilityBillExtracted = z.infer<typeof utilityBillExtractedSchema>;

/** A utility contract. Payment details, when present, are only in `sealed`. */
export const utilitySchema = z
  .object({
    id: uuidV7Schema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    kind: utilityKindSchema,
    providerName: z.string().min(1).max(160),
    customerCode: codeSchema.nullable(),
    contractCode: codeSchema.nullable(),
    supplyPointCode: codeSchema.nullable(),
    tariffName: z.string().max(120).nullable(),
    startDate: localDateSchema.nullable(),
    renewalDate: localDateSchema.nullable(),
    billingFrequency: billingFrequencySchema.nullable(),
    estimatedCost: costSchema.nullable(),
    autopay: z.boolean(),
    notes: notesSchema.nullable(),
    templateId: uuidSchema.nullable(),
    sealed: sealedSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Utility' });
/** A utility contract. */
export type Utility = z.infer<typeof utilitySchema>;

/** Body of `POST …/utilities`. The id is a UUIDv7 from the browser. */
export const createUtilityRequestSchema = z
  .object({
    id: uuidV7Schema,
    kind: utilityKindSchema,
    providerName: z.string().trim().min(1).max(160),
    customerCode: codeSchema.nullable().optional(),
    contractCode: codeSchema.nullable().optional(),
    supplyPointCode: codeSchema.nullable().optional(),
    tariffName: z.string().trim().min(1).max(120).nullable().optional(),
    startDate: localDateSchema.nullable().optional(),
    renewalDate: localDateSchema.nullable().optional(),
    billingFrequency: billingFrequencySchema.nullable().optional(),
    estimatedCost: costSchema.nullable().optional(),
    autopay: z.boolean().default(false),
    notes: notesSchema.nullable().optional(),
    templateId: uuidSchema.nullable().optional(),
    sealed: sealedSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateUtilityRequest' });
/** Body of `POST …/utilities`. */
export type CreateUtilityRequest = z.infer<typeof createUtilityRequestSchema>;

/** Body of `PATCH …/utilities/{utilityId}`. */
export const updateUtilityRequestSchema = z
  .object({
    kind: utilityKindSchema.optional(),
    providerName: z.string().trim().min(1).max(160).optional(),
    customerCode: codeSchema.nullable().optional(),
    contractCode: codeSchema.nullable().optional(),
    supplyPointCode: codeSchema.nullable().optional(),
    tariffName: z.string().trim().min(1).max(120).nullable().optional(),
    startDate: localDateSchema.nullable().optional(),
    renewalDate: localDateSchema.nullable().optional(),
    billingFrequency: billingFrequencySchema.nullable().optional(),
    estimatedCost: costSchema.nullable().optional(),
    autopay: z.boolean().optional(),
    notes: notesSchema.nullable().optional(),
    templateId: uuidSchema.nullable().optional(),
    sealed: sealedSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateUtilityRequest' });
/** Body of `PATCH …/utilities/{utilityId}`. */
export type UpdateUtilityRequest = z.infer<typeof updateUtilityRequestSchema>;

/** Response of `GET …/utilities`. */
export const utilityPageSchema = pageSchema(utilitySchema).meta({ id: 'UtilityPage' });

/** A payment recognition template (system or family-owned). */
export const utilityTemplateSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema.nullable(),
    country: z
      .string()
      .length(2)
      .regex(/^[A-Z]{2}$/, 'Expected an uppercase country code'),
    kind: utilityKindSchema,
    providerName: z.string().min(1).max(160),
    fieldHints: utilityFieldHintsSchema,
    recognitionPatterns: utilityRecognitionPatternsSchema,
    active: z.boolean(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'UtilityTemplate' });
/** A payment recognition template. */
export type UtilityTemplate = z.infer<typeof utilityTemplateSchema>;

/** Body of `POST …/utility-templates`. */
export const createUtilityTemplateRequestSchema = z
  .object({
    country: z
      .string()
      .trim()
      .toUpperCase()
      .length(2)
      .regex(/^[A-Z]{2}$/, 'Expected an uppercase country code')
      .default('IT'),
    kind: utilityKindSchema,
    providerName: z.string().trim().min(1).max(160),
    fieldHints: utilityFieldHintsSchema.default({}),
    recognitionPatterns: utilityRecognitionPatternsSchema.default({}),
    active: z.boolean().default(true),
  })
  .strict()
  .meta({ id: 'CreateUtilityTemplateRequest' });
/** Body of `POST …/utility-templates`. */
export type CreateUtilityTemplateRequest = z.infer<typeof createUtilityTemplateRequestSchema>;

/** Body of `PATCH …/utility-templates/{templateId}`. */
export const updateUtilityTemplateRequestSchema = z
  .object({
    country: z
      .string()
      .trim()
      .toUpperCase()
      .length(2)
      .regex(/^[A-Z]{2}$/, 'Expected an uppercase country code')
      .optional(),
    kind: utilityKindSchema.optional(),
    providerName: z.string().trim().min(1).max(160).optional(),
    fieldHints: utilityFieldHintsSchema.optional(),
    recognitionPatterns: utilityRecognitionPatternsSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateUtilityTemplateRequest' });
/** Body of `PATCH …/utility-templates/{templateId}`. */
export type UpdateUtilityTemplateRequest = z.infer<typeof updateUtilityTemplateRequestSchema>;

/** Response of `GET …/utility-templates`. */
export const utilityTemplateListSchema = z
  .object({ items: z.array(utilityTemplateSchema).max(200) })
  .strict()
  .meta({ id: 'UtilityTemplateList' });
/** Response of `GET …/utility-templates`. */
export type UtilityTemplateList = z.infer<typeof utilityTemplateListSchema>;

/** Query of `GET …/utility-templates`. */
export const utilityTemplateListQuerySchema = z
  .object({
    kind: utilityKindSchema.optional(),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .length(2)
      .regex(/^[A-Z]{2}$/)
      .optional(),
  })
  .strict();

/** One utility bill period with browser-extracted values. */
export const utilityBillSchema = z
  .object({
    id: uuidV7Schema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    utilityId: uuidV7Schema,
    periodStart: localDateSchema.nullable(),
    periodEnd: localDateSchema.nullable(),
    issueDate: localDateSchema.nullable(),
    dueDate: localDateSchema.nullable(),
    amount: costSchema.nullable(),
    consumption: z
      .string()
      .regex(/^-?\d+(\.\d{1,3})?$/)
      .nullable(),
    consumptionUnit: consumptionUnitSchema.nullable(),
    paidOn: localDateSchema.nullable(),
    fileId: uuidSchema.nullable(),
    extracted: utilityBillExtractedSchema,
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'UtilityBill' });
/** One utility bill period. */
export type UtilityBill = z.infer<typeof utilityBillSchema>;

/** Body of `POST …/utilities/{utilityId}/bills`. */
export const createUtilityBillRequestSchema = z
  .object({
    id: uuidV7Schema,
    periodStart: localDateSchema.nullable().optional(),
    periodEnd: localDateSchema.nullable().optional(),
    issueDate: localDateSchema.nullable().optional(),
    dueDate: localDateSchema.nullable().optional(),
    amount: costSchema.nullable().optional(),
    consumption: z
      .string()
      .regex(/^-?\d+(\.\d{1,3})?$/)
      .nullable()
      .optional(),
    consumptionUnit: consumptionUnitSchema.nullable().optional(),
    paidOn: localDateSchema.nullable().optional(),
    fileId: uuidSchema.nullable().optional(),
    extracted: utilityBillExtractedSchema.default({}),
  })
  .strict()
  .refine(
    (value) =>
      (value.consumption === null || value.consumption === undefined) ===
      (value.consumptionUnit === null || value.consumptionUnit === undefined),
    'Consumption and its unit must be set together',
  )
  .meta({ id: 'CreateUtilityBillRequest' });
/** Body of `POST …/utilities/{utilityId}/bills`. */
export type CreateUtilityBillRequest = z.infer<typeof createUtilityBillRequestSchema>;

/** Body of `PATCH …/utilities/{utilityId}/bills/{billId}`. */
export const updateUtilityBillRequestSchema = z
  .object({
    periodStart: localDateSchema.nullable().optional(),
    periodEnd: localDateSchema.nullable().optional(),
    issueDate: localDateSchema.nullable().optional(),
    dueDate: localDateSchema.nullable().optional(),
    amount: costSchema.nullable().optional(),
    consumption: z
      .string()
      .regex(/^-?\d+(\.\d{1,3})?$/)
      .nullable()
      .optional(),
    consumptionUnit: consumptionUnitSchema.nullable().optional(),
    paidOn: localDateSchema.nullable().optional(),
    fileId: uuidSchema.nullable().optional(),
    extracted: utilityBillExtractedSchema.optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateUtilityBillRequest' });
/** Body of `PATCH …/utilities/{utilityId}/bills/{billId}`. */
export type UpdateUtilityBillRequest = z.infer<typeof updateUtilityBillRequestSchema>;

/** Response of `GET …/utilities/{utilityId}/bills`. */
export const utilityBillPageSchema = pageSchema(utilityBillSchema).meta({ id: 'UtilityBillPage' });

/** Path of one utility template. */
export const utilityTemplateParamsSchema = z
  .object({ familyId: uuidSchema, templateId: uuidSchema })
  .strict();
/** Path of one utility bill. */
export const utilityBillParamsSchema = z
  .object({
    familyId: uuidSchema,
    houseId: uuidSchema,
    utilityId: uuidSchema,
    billId: uuidV7Schema,
  })
  .strict();

/** A maintenance task, including the boiler check deadline. */
export const maintenanceTaskSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    contactId: uuidSchema.nullable(),
    category: maintenanceCategorySchema,
    priority: maintenancePrioritySchema,
    title: shortTitleSchema,
    description: z.string().max(4000).nullable(),
    rrule: rruleSchema.nullable(),
    nextDueDate: localDateSchema.nullable(),
    lastDoneOn: localDateSchema.nullable(),
    estimatedCost: costSchema.nullable(),
    active: z.boolean(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'MaintenanceTask' });
/** A maintenance task. */
export type MaintenanceTask = z.infer<typeof maintenanceTaskSchema>;

/** Body of `POST …/maintenance-tasks`. */
export const createMaintenanceTaskRequestSchema = z
  .object({
    contactId: uuidSchema.nullable().optional(),
    category: maintenanceCategorySchema,
    priority: maintenancePrioritySchema.default('medium'),
    title: shortTitleSchema,
    description: z.string().trim().max(4000).nullable().optional(),
    rrule: rruleSchema.nullable().optional(),
    nextDueDate: localDateSchema.nullable().optional(),
    lastDoneOn: localDateSchema.nullable().optional(),
    estimatedCost: costSchema.nullable().optional(),
    active: z.boolean().default(true),
  })
  .strict()
  .meta({ id: 'CreateMaintenanceTaskRequest' });
/** Body of `POST …/maintenance-tasks`. */
export type CreateMaintenanceTaskRequest = z.infer<typeof createMaintenanceTaskRequestSchema>;

/** Body of `PATCH …/maintenance-tasks/{taskId}`. */
export const updateMaintenanceTaskRequestSchema = z
  .object({
    contactId: uuidSchema.nullable().optional(),
    category: maintenanceCategorySchema.optional(),
    priority: maintenancePrioritySchema.optional(),
    title: shortTitleSchema.optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    rrule: rruleSchema.nullable().optional(),
    nextDueDate: localDateSchema.nullable().optional(),
    lastDoneOn: localDateSchema.nullable().optional(),
    estimatedCost: costSchema.nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateMaintenanceTaskRequest' });
/** Body of `PATCH …/maintenance-tasks/{taskId}`. */
export type UpdateMaintenanceTaskRequest = z.infer<typeof updateMaintenanceTaskRequestSchema>;

/** Query of `GET …/maintenance-tasks`. */
export const maintenanceListQuerySchema = z
  .object({ limit: limitField, cursor: cursorField, category: maintenanceCategorySchema.optional() })
  .strict();

/** Response of `GET …/maintenance-tasks`. */
export const maintenanceTaskPageSchema = pageSchema(maintenanceTaskSchema).meta({
  id: 'MaintenanceTaskPage',
});

/** Path of one guide entry. */
export const guideEntryParamsSchema = z
  .object({ familyId: uuidSchema, houseId: uuidSchema, entryId: uuidSchema })
  .strict();
/** Path of one cutoff. */
export const shutoffParamsSchema = z
  .object({ familyId: uuidSchema, houseId: uuidSchema, shutoffId: uuidSchema })
  .strict();
/** Path of one waste collection. */
export const wasteCollectionParamsSchema = z
  .object({ familyId: uuidSchema, houseId: uuidSchema, collectionId: uuidSchema })
  .strict();
/** Path of one contact. */
export const contactParamsSchema = z.object({ familyId: uuidSchema, contactId: uuidSchema }).strict();
/** Path of one utility. */
export const utilityParamsSchema = z
  .object({ familyId: uuidSchema, houseId: uuidSchema, utilityId: uuidSchema })
  .strict();
/** Path of one maintenance task. */
export const maintenanceTaskParamsSchema = z
  .object({ familyId: uuidSchema, houseId: uuidSchema, taskId: uuidSchema })
  .strict();
