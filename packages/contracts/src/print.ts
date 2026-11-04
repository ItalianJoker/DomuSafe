import { z } from 'zod';
import { HEADERS, instantSchema, uuidSchema } from './common.js';
import { rescueSheetPetSchema, rescueSheetResidentSchema } from './personale.js';

/** Which printed code a publication is. `house_page` opens the public house sheet; `rescue_sheet` opens the rescue sheet. */
export const PUBLICATION_KINDS = ['house_page', 'rescue_sheet'] as const;
/** A printed code kind. */
export type PublicationKind = (typeof PUBLICATION_KINDS)[number];

/** 128-bit token encoded as base64url without padding (22 characters). */
export const PUBLIC_TOKEN = /^[A-Za-z0-9_-]{22}$/;

/**
 * Device labels a browser may send with a public page view.
 * Anything else is ignored and is not stored.
 */
export const DEVICE_LABELS = ['Telefono', 'Tablet', 'Computer'] as const;
/** A short device label stored in the reading log. */
export type DeviceLabel = (typeof DEVICE_LABELS)[number];

/** How many readings a house list returns, newest first. */
export const PUBLICATION_READING_LIMIT = 100;

const publicationKindSchema = z.enum(PUBLICATION_KINDS);
const publicTokenSchema = z.string().regex(PUBLIC_TOKEN);
const phoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/);
const wallKindSchema = z.enum(['water', 'gas', 'electricity']);

/** Path parameters of a publication route. */
export const publicationParamsSchema = z
  .object({ familyId: uuidSchema, houseId: uuidSchema, publicationId: uuidSchema })
  .strict();

/** Path parameters of a public page. The token is the secret in the printed address. */
export const publicTokenParamsSchema = z.object({ token: publicTokenSchema }).strict();

/** A printed code and the last time someone opened it. */
export const publicationSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    kind: publicationKindSchema,
    token: publicTokenSchema.nullable(),
    revokedAt: instantSchema.nullable(),
    lastScannedAt: instantSchema.nullable(),
    scanCount: z.int().min(0),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Publication' });
/** A printed code and the last time someone opened it. */
export type Publication = z.infer<typeof publicationSchema>;

/** Response of `GET …/publications`. */
export const publicationListSchema = z
  .object({ items: z.array(publicationSchema) })
  .strict()
  .meta({ id: 'PublicationList' });

/** Body of `POST …/publications`. */
export const createPublicationRequestSchema = z
  .object({ kind: publicationKindSchema })
  .strict()
  .meta({ id: 'CreatePublicationRequest' });
/** Body of `POST …/publications`. */
export type CreatePublicationRequest = z.infer<typeof createPublicationRequestSchema>;

const deviceLabelSchema = z.enum(DEVICE_LABELS);

/**
 * Optional device header on a public page. Unknown headers stay.
 * A value outside {@link DEVICE_LABELS} is accepted here and dropped by {@link parseDeviceLabel}.
 */
export const deviceLabelHeaders = z.looseObject({
  [HEADERS.device]: z
    .string()
    .optional()
    .meta({ description: 'Short device label. Only Telefono, Tablet and Computer are stored.' }),
});

/**
 * Keeps a device label only when it is one of the three closed words.
 *
 * Preconditions: `value` is the raw header, or absent.
 * Postconditions: any other text, including health details and account numbers, becomes null.
 * Data contract: the result is a {@link DeviceLabel} or null.
 *
 * @param value - Header value.
 * @returns The label to store, or null.
 */
export function parseDeviceLabel(value: string | undefined): DeviceLabel | null {
  const parsed = deviceLabelSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** One opening of a public code. Time, kind and label only. */
export const publicationReadingSchema = z
  .object({
    occurredAt: instantSchema,
    kind: publicationKindSchema,
    deviceLabel: deviceLabelSchema.nullable(),
  })
  .strict()
  .meta({ id: 'PublicationReading' });
/** One opening of a public code. */
export type PublicationReading = z.infer<typeof publicationReadingSchema>;

/** Response of `GET …/publication-readings`, newest first. */
export const publicationReadingListSchema = z
  .object({ items: z.array(publicationReadingSchema).max(PUBLICATION_READING_LIMIT) })
  .strict()
  .meta({ id: 'PublicationReadingList' });
/** Response of `GET …/publication-readings`. */
export type PublicationReadingList = z.infer<typeof publicationReadingListSchema>;

/** What the public house page may show. No health data, no account numbers, no manual secrets. */
export const publicHousePageSchema = z
  .object({
    houseName: z.string().min(1).max(120),
    address: z.string().min(1).max(400).nullable(),
    shutoffs: z
      .array(
        z
          .object({
            kind: wallKindSchema,
            location: z.string().min(1).max(300),
            instructions: z.string().max(2000),
          })
          .strict(),
      )
      .max(30),
    tradespeople: z
      .array(
        z
          .object({
            displayName: z.string().min(1).max(120),
            trade: z.string().max(80).nullable(),
            phone: phoneSchema.nullable(),
            company: z.string().max(160).nullable(),
          })
          .strict(),
      )
      .max(50),
    primaryContact: z
      .object({
        displayName: z.string().min(1).max(80),
        phone: phoneSchema.nullable(),
        relationship: z.string().max(80).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .meta({ id: 'PublicHousePage' });
/** What the public house page may show. */
export type PublicHousePage = z.infer<typeof publicHousePageSchema>;

/**
 * Rescue sheet opened without a sign-in. Health data here is intentional.
 * Account numbers, vault contents and the house manual are not part of this contract.
 */
export const publicRescueSheetSchema = z
  .object({
    houseName: z.string().min(1).max(120),
    residents: z.array(rescueSheetResidentSchema).max(50),
    pets: z.array(rescueSheetPetSchema).max(50),
  })
  .strict()
  .meta({ id: 'PublicRescueSheet' });
/** Rescue sheet opened without a sign-in. */
export type PublicRescueSheet = z.infer<typeof publicRescueSheetSchema>;

/** Address parts of a house, as stored. */
export interface HouseAddressParts {
  readonly addressLine: string | null;
  readonly postalCode: string | null;
  readonly city: string | null;
  readonly province: string | null;
}

/**
 * Joins the postal address into one line for the wall sheet and the public house page.
 *
 * Preconditions: each part is already trimmed by the house contract, or null.
 * Postconditions: an empty address is null; otherwise the parts are separated by commas.
 * Data contract: the result contains only the four address parts.
 *
 * @param parts - Address columns.
 * @returns One line, or null when every part is empty.
 */
export function formatHouseAddress(parts: HouseAddressParts): string | null {
  const locality = [parts.postalCode, parts.city]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .join(' ');
  const lines = [parts.addressLine, locality === '' ? null : locality, parts.province].filter(
    (part): part is string => part !== null && part.trim() !== '',
  );
  return lines.length === 0 ? null : lines.join(', ');
}
