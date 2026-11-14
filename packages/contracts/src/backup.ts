import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, uuidSchema } from './common.js';

/**
 * Export modules the family backup can include.
 * Each module maps to one or more tables; ciphertext envelopes stay sealed as stored.
 */
export const EXPORT_MODULES = [
  'residents',
  'pets',
  'contacts',
  'utilities',
  'inventory',
  'house',
  'deadlines',
  'vault',
  'personale',
  'calendar',
] as const;
/** One export module. */
export type ExportModule = (typeof EXPORT_MODULES)[number];

const exportModuleSchema = z.enum(EXPORT_MODULES);
const limitField = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE);
const cursorField = z.string().max(512).optional();

/** Path parameters of family export routes. */
export const exportFamilyParamsSchema = z.object({ familyId: uuidSchema }).strict();

/**
 * Query of `GET /families/{familyId}/export/records`.
 * Omit `module` to walk every module the caller may read, in catalogue order.
 */
export const exportRecordsQuerySchema = z
  .object({
    module: exportModuleSchema.optional(),
    limit: limitField,
    cursor: cursorField,
  })
  .strict();
/** Parsed export records query. */
export type ExportRecordsQuery = z.infer<typeof exportRecordsQuerySchema>;

/** JSON scalar values allowed in an export row. */
const exportScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * One family row for backup assembly in the browser.
 * `data` is JSON: class C fields in clear, class A/B envelopes as stored (`sealed` base64url).
 */
export const exportRecordSchema = z
  .object({
    module: exportModuleSchema,
    table: z.string().min(1).max(64),
    id: uuidSchema,
    version: z.int().min(1),
    data: z.record(
      z.string(),
      z.union([exportScalarSchema, z.array(exportScalarSchema), z.record(z.string(), exportScalarSchema)]),
    ),
  })
  .strict()
  .meta({ id: 'ExportRecord' });
/** One family row for backup assembly. */
export type ExportRecord = z.infer<typeof exportRecordSchema>;

/** Response of `GET /families/{familyId}/export/records`. */
export const exportRecordsPageSchema = z
  .object({
    items: z.array(exportRecordSchema),
    nextCursor: z.string().nullable(),
  })
  .strict()
  .meta({ id: 'ExportRecordsPage' });
/** Paginated export records. */
export type ExportRecordsPage = z.infer<typeof exportRecordsPageSchema>;

/** One module entry in the export catalog. */
export const exportCatalogModuleSchema = z
  .object({
    module: exportModuleSchema,
    readable: z.boolean(),
    tables: z.array(z.string().min(1).max(64)),
  })
  .strict()
  .meta({ id: 'ExportCatalogModule' });

/** Summary of modules available to the caller for CSV section pickers. */
export const exportCatalogSchema = z
  .object({
    modules: z.array(exportCatalogModuleSchema),
  })
  .strict()
  .meta({ id: 'ExportCatalog' });
/** Catalog of export modules for the open family. */
export type ExportCatalog = z.infer<typeof exportCatalogSchema>;
