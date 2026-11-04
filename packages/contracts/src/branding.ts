import { hasFeature, PLAN_DEFINITIONS, type PlanTier } from '@domusafe/plans';
import { z } from 'zod';
import { instantSchema, uuidSchema } from './common.js';

/**
 * Largest logo data address, in characters.
 * There is no object store yet, so the logo stays in this column only when it fits.
 */
export const LOGO_DATA_URL_MAX = 24_576;

const LONG_DIGIT_RUN = /\d{8,}/u;
const LOGO_PATTERN = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Rejects a string that could hold a full account number.
 *
 * @param value - Text the person typed.
 * @returns `false` when eight or more digits appear in a row.
 */
function noFullSecret(value: string): boolean {
  return !LONG_DIGIT_RUN.test(value);
}

/**
 * Whether decoded image bytes match the declared kind.
 *
 * Preconditions: `bytes` is the base64 payload, which may be empty.
 * Postconditions: SVG and other kinds return false.
 * Data contract: only the magic numbers of PNG, JPEG and WebP are accepted.
 *
 * @param kind - Image kind from the data address.
 * @param bytes - Decoded payload.
 * @returns `true` when the payload starts with that image's magic number.
 */
function hasImageMagic(kind: string, bytes: Uint8Array): boolean {
  if (kind === 'png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (kind === 'jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

/**
 * Decodes a standard base64 payload.
 *
 * @param value - Base64 text without a data-address prefix.
 * @returns The bytes, or `null` when the payload is not valid base64.
 */
function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      const code = binary.codePointAt(index);
      if (code === undefined) {
        return null;
      }
      bytes[index] = code;
    }
    return bytes;
  } catch {
    return null;
  }
}

/** A small PNG, JPEG or WebP data address. */
export const logoDataUrlSchema = z
  .string()
  .max(LOGO_DATA_URL_MAX)
  .refine((value) => {
    const match = LOGO_PATTERN.exec(value);
    const kind = match?.[1];
    const payload = match?.[2];
    if (kind === undefined || payload === undefined) {
      return false;
    }
    const bytes = decodeBase64(payload);
    return bytes !== null && hasImageMagic(kind, bytes);
  }, 'logo')
  .meta({ description: 'Small PNG, JPEG or WebP data address, at most 24576 characters' });

const hostNameSchema = z.string().trim().min(1).max(80).refine(noFullSecret, 'full_secret');
const welcomeSchema = z.string().trim().min(1).max(160).refine(noFullSecret, 'full_secret');
const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** Name, one color, welcome sentence and logo. Every field may be absent. */
export const hostMarkFieldsSchema = z
  .object({
    displayName: hostNameSchema.nullable(),
    color: colorSchema.nullable(),
    welcome: welcomeSchema.nullable(),
    logoDataUrl: logoDataUrlSchema.nullable(),
  })
  .strict();
/** Name, one color, welcome sentence and logo. */
export type HostMarkFields = z.infer<typeof hostMarkFieldsSchema>;

/** Body of `PUT /families/{id}/branding`. All null clears the mark. */
export const putFamilyBrandingRequestSchema = hostMarkFieldsSchema.meta({
  id: 'PutFamilyBrandingRequest',
});
/** Body of `PUT /families/{id}/branding`. */
export type PutFamilyBrandingRequest = z.infer<typeof putFamilyBrandingRequestSchema>;

/** Stored host mark of one family. */
export const familyBrandingSchema = hostMarkFieldsSchema
  .extend({
    familyId: uuidSchema,
    version: z.int().min(1),
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'FamilyBranding' });
/** Stored host mark of one family. */
export type FamilyBranding = z.infer<typeof familyBrandingSchema>;

/** Response of `GET` and `PUT /families/{id}/branding`. `branding` is null when the family has not set one. */
export const familyBrandingResponseSchema = z
  .object({ branding: familyBrandingSchema.nullable() })
  .strict()
  .meta({ id: 'FamilyBrandingResponse' });
/** Response of the branding routes. */
export type FamilyBrandingResponse = z.infer<typeof familyBrandingResponseSchema>;

/**
 * What a sheet or a public page shows in place of a product mark.
 * `product` is the DomuSafe mark. `none` shows nothing. `host` is the family's own mark.
 */
export const sheetMarkSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('product') }).strict(),
    z.object({ kind: z.literal('none') }).strict(),
    z
      .object({
        kind: z.literal('host'),
        displayName: hostNameSchema.nullable(),
        color: colorSchema.nullable(),
        welcome: welcomeSchema.nullable(),
        logoDataUrl: logoDataUrlSchema.nullable(),
      })
      .strict(),
  ])
  .meta({ id: 'SheetMark' });
/** Mark drawn on a sheet or a public page. */
export type SheetMark = z.infer<typeof sheetMarkSchema>;

/**
 * Chooses the mark for a plan and a stored host mark.
 *
 * Preconditions: `tier` is the effective plan. `branding` is the stored row, or null.
 * Postconditions: Free and Basic return `product` even when a row is left over.
 * Advanced returns `none`. Premium returns `host` only when the row has at least one value.
 * Data contract: the result never includes vault fields.
 *
 * @param tier - Effective plan.
 * @param branding - Stored host mark, or null.
 * @returns The mark to draw.
 */
export function sheetMarkFor(tier: PlanTier, branding: HostMarkFields | null): SheetMark {
  if (PLAN_DEFINITIONS[tier].watermark) {
    return { kind: 'product' };
  }
  if (
    !hasFeature(tier, 'branding') ||
    branding === null ||
    (branding.displayName === null &&
      branding.color === null &&
      branding.welcome === null &&
      branding.logoDataUrl === null)
  ) {
    return { kind: 'none' };
  }
  return {
    kind: 'host',
    displayName: branding.displayName,
    color: branding.color,
    welcome: branding.welcome,
    logoDataUrl: branding.logoDataUrl,
  };
}
