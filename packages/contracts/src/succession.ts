import { z } from 'zod';
import { instantSchema, uuidSchema } from './common.js';

/**
 * Activities of the family succession checklist.
 * The six standard kinds are created together. `custom` is an activity the family adds by hand.
 */
export const SUCCESSION_KINDS = [
  'documents',
  'will',
  'notary',
  'titles',
  'declaration',
  'utility_transfers',
  'custom',
] as const;
/** One succession activity kind. */
export type SuccessionKind = (typeof SUCCESSION_KINDS)[number];

/** Standard activities, in the order the checklist shows them. */
export const STANDARD_SUCCESSION_KINDS = [
  'documents',
  'will',
  'notary',
  'titles',
  'declaration',
  'utility_transfers',
] as const;
/** A standard succession activity. */
export type StandardSuccessionKind = (typeof STANDARD_SUCCESSION_KINDS)[number];

/** How many activities one family may keep. */
export const MAX_SUCCESSION_ITEMS = 40;

const LONG_DIGIT_RUN = /\d{8,}/u;

/**
 * Rejects a string that could hold a full account number or a similar secret.
 *
 * @param value - Text the person typed.
 * @returns `false` when eight or more digits appear in a row.
 */
function noFullSecret(value: string): boolean {
  return !LONG_DIGIT_RUN.test(value);
}

const safeText = (max: number) => z.string().trim().min(1).max(max).refine(noFullSecret, 'full_secret');

const successionKindSchema = z.enum(SUCCESSION_KINDS);

/** One family succession activity. Notes are checklist text, never a vault document. */
export const successionItemSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    kind: successionKindSchema,
    title: safeText(200).nullable(),
    notes: safeText(2000).nullable(),
    deadlineNote: safeText(200).nullable(),
    done: z.boolean(),
    completedAt: instantSchema.nullable(),
    sortOrder: z.int().min(0).max(32_767),
    version: z.int().min(1),
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'SuccessionItem' });
/** One family succession activity. */
export type SuccessionItem = z.infer<typeof successionItemSchema>;

/** Response of `GET /families/{familyId}/succession`. */
export const successionListSchema = z
  .object({ items: z.array(successionItemSchema) })
  .strict()
  .meta({ id: 'SuccessionList' });
/** Response of the succession list. */
export type SuccessionList = z.infer<typeof successionListSchema>;

/** Body of `POST /families/{familyId}/succession`. Always a custom activity. */
export const createSuccessionItemRequestSchema = z
  .object({
    title: safeText(200),
    notes: safeText(2000).optional(),
    deadlineNote: safeText(200).optional(),
  })
  .strict()
  .meta({ id: 'CreateSuccessionItemRequest' });
/** Body of `POST /families/{familyId}/succession`. */
export type CreateSuccessionItemRequest = z.infer<typeof createSuccessionItemRequestSchema>;

/** Body of `PATCH /families/{familyId}/succession/{itemId}`. */
export const updateSuccessionItemRequestSchema = z
  .object({
    title: safeText(200).nullable().optional(),
    notes: safeText(2000).nullable().optional(),
    deadlineNote: safeText(200).nullable().optional(),
    done: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')
  .meta({ id: 'UpdateSuccessionItemRequest' });
/** Body of `PATCH /families/{familyId}/succession/{itemId}`. */
export type UpdateSuccessionItemRequest = z.infer<typeof updateSuccessionItemRequestSchema>;

/** Path of one succession activity. */
export const successionItemParamsSchema = z.object({ familyId: uuidSchema, itemId: uuidSchema }).strict();
