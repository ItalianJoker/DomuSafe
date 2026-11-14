import { z } from 'zod';
import { instantSchema, pageSchema, uuidSchema } from './common.js';
/** Who a handover note is written for. */
export const HANDOVER_AUDIENCES = ['family', 'guest'] as const;
/** Who a handover note is written for. */
export type HandoverAudience = (typeof HANDOVER_AUDIENCES)[number];

const audienceSchema = z.enum(HANDOVER_AUDIENCES);
const phraseSchema = z.string().trim().min(1).max(120);
const phraseListSchema = z.array(phraseSchema).max(40);
const notesSchema = z.string().trim().max(2000);
const longNotesSchema = z.string().trim().max(4000);
const bodySchema = z.string().trim().min(1).max(4000);
const preferredNameSchema = z.string().trim().min(1).max(80);
const limitField = z.coerce.number().int().min(1).max(200).default(50);
const cursorField = z.string().max(512).optional();

function atLeastOneField(value: object): boolean {
  return Object.keys(value).length > 0;
}

function hasVitalMeasurement(value: {
  readonly systolicMmhg?: number | null | undefined;
  readonly diastolicMmhg?: number | null | undefined;
  readonly heartRateBpm?: number | null | undefined;
  readonly temperatureCelsius?: number | null | undefined;
  readonly bloodGlucoseMgDl?: number | null | undefined;
  readonly weightKg?: number | null | undefined;
  readonly oxygenSaturationPercent?: number | null | undefined;
  readonly notes?: string | null | undefined;
}): boolean {
  return (
    (value.systolicMmhg !== undefined && value.systolicMmhg !== null) ||
    (value.heartRateBpm !== undefined && value.heartRateBpm !== null) ||
    (value.temperatureCelsius !== undefined && value.temperatureCelsius !== null) ||
    (value.bloodGlucoseMgDl !== undefined && value.bloodGlucoseMgDl !== null) ||
    (value.weightKg !== undefined && value.weightKg !== null) ||
    (value.oxygenSaturationPercent !== undefined && value.oxygenSaturationPercent !== null) ||
    (typeof value.notes === 'string' && value.notes.trim().length > 0)
  );
}

function pressurePairOk(value: {
  readonly systolicMmhg?: number | null | undefined;
  readonly diastolicMmhg?: number | null | undefined;
}): boolean {
  const hasSys = value.systolicMmhg !== undefined && value.systolicMmhg !== null;
  const hasDia = value.diastolicMmhg !== undefined && value.diastolicMmhg !== null;
  return hasSys === hasDia;
}

/** Path parameters of one vital entry. */
export const vitalEntryParamsSchema = z
  .object({ familyId: uuidSchema, residentId: uuidSchema, entryId: uuidSchema })
  .strict();
/** Path parameters of one vital entry. */
export type VitalEntryParams = z.infer<typeof vitalEntryParamsSchema>;

/** Path parameters of one handover. */
export const handoverParamsSchema = z.object({ familyId: uuidSchema, handoverId: uuidSchema }).strict();
/** Path parameters of one handover. */
export type HandoverParams = z.infer<typeof handoverParamsSchema>;

/** Query of the vital diary list. */
export const vitalListQuerySchema = z.object({ limit: limitField, cursor: cursorField }).strict();
/** Query of the vital diary list. */
export type VitalListQuery = z.infer<typeof vitalListQuerySchema>;

/** Query of the handover list. */
export const handoverListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    houseId: uuidSchema.optional(),
    residentId: uuidSchema.optional(),
    audience: audienceSchema.optional(),
  })
  .strict();
/** Query of the handover list. */
export type HandoverListQuery = z.infer<typeof handoverListQuerySchema>;

/** One diary row of vital parameters. */
export const vitalEntrySchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    residentId: uuidSchema,
    measuredAt: instantSchema,
    systolicMmhg: z.int().min(40).max(300).nullable(),
    diastolicMmhg: z.int().min(20).max(200).nullable(),
    heartRateBpm: z.int().min(20).max(300).nullable(),
    temperatureCelsius: z.number().min(30).max(45).nullable(),
    bloodGlucoseMgDl: z.int().min(20).max(800).nullable(),
    weightKg: z.number().min(1).max(500).nullable(),
    oxygenSaturationPercent: z.int().min(50).max(100).nullable(),
    notes: notesSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'VitalEntry' });
/** One diary row of vital parameters. */
export type VitalEntry = z.infer<typeof vitalEntrySchema>;

/** Page of vital entries. */
export const vitalEntryPageSchema = pageSchema(vitalEntrySchema).meta({ id: 'VitalEntryPage' });
/** Page of vital entries. */
export type VitalEntryPage = z.infer<typeof vitalEntryPageSchema>;

/** Body of `POST …/vitals`. */
export const createVitalEntryRequestSchema = z
  .object({
    measuredAt: instantSchema,
    systolicMmhg: z.int().min(40).max(300).nullable().optional(),
    diastolicMmhg: z.int().min(20).max(200).nullable().optional(),
    heartRateBpm: z.int().min(20).max(300).nullable().optional(),
    temperatureCelsius: z.number().min(30).max(45).nullable().optional(),
    bloodGlucoseMgDl: z.int().min(20).max(800).nullable().optional(),
    weightKg: z.number().min(1).max(500).nullable().optional(),
    oxygenSaturationPercent: z.int().min(50).max(100).nullable().optional(),
    notes: notesSchema.nullable().optional(),
  })
  .strict()
  .refine(pressurePairOk, { message: 'systolic and diastolic must be set together' })
  .refine(hasVitalMeasurement, { message: 'at least one measurement or a note is required' })
  .meta({ id: 'CreateVitalEntryRequest' });
/** Body of `POST …/vitals`. */
export type CreateVitalEntryRequest = z.infer<typeof createVitalEntryRequestSchema>;

/** Body of `PATCH …/vitals/{entryId}`. */
export const updateVitalEntryRequestSchema = z
  .object({
    measuredAt: instantSchema.optional(),
    systolicMmhg: z.int().min(40).max(300).nullable().optional(),
    diastolicMmhg: z.int().min(20).max(200).nullable().optional(),
    heartRateBpm: z.int().min(20).max(300).nullable().optional(),
    temperatureCelsius: z.number().min(30).max(45).nullable().optional(),
    bloodGlucoseMgDl: z.int().min(20).max(800).nullable().optional(),
    weightKg: z.number().min(1).max(500).nullable().optional(),
    oxygenSaturationPercent: z.int().min(50).max(100).nullable().optional(),
    notes: notesSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .refine(pressurePairOk, { message: 'systolic and diastolic must be set together' })
  .meta({ id: 'UpdateVitalEntryRequest' });
/** Body of `PATCH …/vitals/{entryId}`. */
export type UpdateVitalEntryRequest = z.infer<typeof updateVitalEntryRequestSchema>;

/** «Chi sono» sheet for caregivers. */
export const residentAboutCardSchema = z
  .object({
    residentId: uuidSchema,
    familyId: uuidSchema,
    preferredName: preferredNameSchema.nullable(),
    howToAddress: z.string().max(500).nullable(),
    likes: phraseListSchema,
    dislikes: phraseListSchema,
    dailyRoutine: longNotesSchema.nullable(),
    calmingTips: longNotesSchema.nullable(),
    communicationTips: longNotesSchema.nullable(),
    importantNotes: longNotesSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'ResidentAboutCard' });
/** «Chi sono» sheet for caregivers. */
export type ResidentAboutCard = z.infer<typeof residentAboutCardSchema>;

/** Body of `PUT …/about`. */
export const putResidentAboutRequestSchema = z
  .object({
    preferredName: preferredNameSchema.nullable(),
    howToAddress: z.string().trim().max(500).nullable(),
    likes: phraseListSchema,
    dislikes: phraseListSchema,
    dailyRoutine: longNotesSchema.nullable(),
    calmingTips: longNotesSchema.nullable(),
    communicationTips: longNotesSchema.nullable(),
    importantNotes: longNotesSchema.nullable(),
  })
  .strict()
  .meta({ id: 'PutResidentAboutRequest' });
/** Body of `PUT …/about`. */
export type PutResidentAboutRequest = z.infer<typeof putResidentAboutRequestSchema>;

/** One handover note between caregivers. */
export const handoverSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema.nullable(),
    residentId: uuidSchema.nullable(),
    audience: audienceSchema,
    body: bodySchema,
    postedAt: instantSchema,
    acknowledgedAt: instantSchema.nullable(),
    acknowledgedBy: uuidSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Handover' });
/** One handover note between caregivers. */
export type Handover = z.infer<typeof handoverSchema>;

/** Page of handovers. */
export const handoverPageSchema = pageSchema(handoverSchema).meta({ id: 'HandoverPage' });
/** Page of handovers. */
export type HandoverPage = z.infer<typeof handoverPageSchema>;

/** Body of `POST …/handovers`. */
export const createHandoverRequestSchema = z
  .object({
    body: bodySchema,
    audience: audienceSchema.default('family'),
    houseId: uuidSchema.nullable().optional(),
    residentId: uuidSchema.nullable().optional(),
    postedAt: instantSchema.optional(),
  })
  .strict()
  .meta({ id: 'CreateHandoverRequest' });
/** Body of `POST …/handovers`. */
export type CreateHandoverRequest = z.infer<typeof createHandoverRequestSchema>;

/** Body of `PATCH …/handovers/{handoverId}`. */
export const updateHandoverRequestSchema = z
  .object({
    body: bodySchema.optional(),
    audience: audienceSchema.optional(),
    houseId: uuidSchema.nullable().optional(),
    residentId: uuidSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .meta({ id: 'UpdateHandoverRequest' });
/** Body of `PATCH …/handovers/{handoverId}`. */
export type UpdateHandoverRequest = z.infer<typeof updateHandoverRequestSchema>;
