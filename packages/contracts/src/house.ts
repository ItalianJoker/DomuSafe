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
    sealed: sealedSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, 'At least one field is required')
  .meta({ id: 'UpdateUtilityRequest' });
/** Body of `PATCH …/utilities/{utilityId}`. */
export type UpdateUtilityRequest = z.infer<typeof updateUtilityRequestSchema>;

/** Response of `GET …/utilities`. */
export const utilityPageSchema = pageSchema(utilitySchema).meta({ id: 'UtilityPage' });

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
