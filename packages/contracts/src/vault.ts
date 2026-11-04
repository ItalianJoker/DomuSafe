import { z } from 'zod';
import { base64UrlSchema, instantSchema, pageSchema, uuidSchema, uuidV7Schema } from './common.js';

/** Family-vault sections stored in this slice. Personal sections and succession stay out. */
export const FAMILY_VAULT_SECTIONS = [
  'family_accounts',
  'mortgages',
  'credit_protection',
  'insurance_policies',
  'bills_and_cancellations',
  'digital_legacy',
] as const;
/** A family-vault section. */
export type FamilyVaultSection = (typeof FAMILY_VAULT_SECTIONS)[number];

/** Browser Argon2id parameters for the vault code (phase 2 §8.17). The server rejects any other cost. */
export const vaultKdfSchema = z
  .object({
    memoryKib: z.literal(65_536),
    iterations: z.literal(3),
    parallelism: z.literal(1),
  })
  .strict();
/** Browser Argon2id parameters for the vault code. */
export type VaultKdf = z.infer<typeof vaultKdfSchema>;

/** Platforms accepted for a paired device. */
export const DEVICE_PLATFORMS = ['android', 'ios', 'windows', 'macos', 'linux', 'other'] as const;

const LONG_DIGIT_RUN = /\d{8,}/u;

/**
 * Rejects a string that could hold a full account number, card number or similar secret.
 *
 * @param value - Text the person typed.
 * @returns `false` when eight or more digits appear in a row.
 */
function noFullSecret(value: string): boolean {
  return !LONG_DIGIT_RUN.test(value);
}

const shortText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => shortText(max).optional();
const metadataText = (max: number) => shortText(max).refine(noFullSecret, 'full_secret');
const optionalMetadata = (max: number) => metadataText(max).optional();

/** Bank relationship stored as metadata. Full numbers, codes and passwords are rejected. */
export const familyAccountPayloadSchema = z
  .object({
    schema: z.literal(1),
    institution: metadataText(120),
    relationship: z.enum(['current_account', 'savings', 'investment', 'other']),
    holder: metadataText(120),
    branch: optionalMetadata(120),
    referenceHint: optionalMetadata(12),
    notes: optionalMetadata(2000),
  })
  .strict();
/** Bank relationship stored as metadata. */
export type FamilyAccountPayload = z.infer<typeof familyAccountPayloadSchema>;

/** Mortgage cover note. The ciphertext is the only copy the server stores. */
export const mortgagePayloadSchema = z
  .object({
    schema: z.literal(1),
    lender: shortText(120),
    property: shortText(300),
    notes: optionalText(2000),
  })
  .strict();
/** Mortgage cover note. */
export type MortgagePayload = z.infer<typeof mortgagePayloadSchema>;

/** Credit-protection cover note. */
export const creditProtectionPayloadSchema = z
  .object({
    schema: z.literal(1),
    provider: shortText(120),
    covers: shortText(500),
    notes: optionalText(2000),
  })
  .strict();
/** Credit-protection cover note. */
export type CreditProtectionPayload = z.infer<typeof creditProtectionPayloadSchema>;

const beneficiarySchema = z
  .object({
    name: shortText(80),
    relationship: optionalText(80),
    share: optionalText(40),
  })
  .strict();

/** Insurance policy and the people it pays. */
export const insurancePayloadSchema = z
  .object({
    schema: z.literal(1),
    company: shortText(120),
    kind: shortText(120),
    beneficiaries: z.array(beneficiarySchema).max(12),
    notes: optionalText(2000),
  })
  .strict();
/** Insurance policy and the people it pays. */
export type InsurancePayload = z.infer<typeof insurancePayloadSchema>;

const cancellationSchema = z
  .object({
    name: shortText(120),
    howToCancel: shortText(500),
  })
  .strict();

/** Where bills are kept, and subscriptions the family would cancel. */
export const billsPayloadSchema = z
  .object({
    schema: z.literal(1),
    billsLocation: shortText(500),
    subscriptions: z.array(cancellationSchema).max(40),
    notes: optionalText(2000),
  })
  .strict();
/** Where bills are kept, and subscriptions the family would cancel. */
export type BillsPayload = z.infer<typeof billsPayloadSchema>;

/** Digital legacy: Apple heir contact, Google inactive account, and where the recovery kit is. */
export const digitalLegacyPayloadSchema = z
  .object({
    schema: z.literal(1),
    appleHeirContact: optionalText(300),
    googleInactiveAccount: optionalText(300),
    passwordKitLocation: optionalText(300),
    notes: optionalText(2000),
  })
  .strict()
  .refine(
    (value) =>
      value.appleHeirContact !== undefined ||
      value.googleInactiveAccount !== undefined ||
      value.passwordKitLocation !== undefined ||
      value.notes !== undefined,
    'empty',
  );
/** Digital legacy notes. */
export type DigitalLegacyPayload = z.infer<typeof digitalLegacyPayloadSchema>;

/** Plaintext of one family-vault section, validated in the browser before encryption. */
export type VaultPayload =
  | FamilyAccountPayload
  | MortgagePayload
  | CreditProtectionPayload
  | InsurancePayload
  | BillsPayload
  | DigitalLegacyPayload;

const PAYLOADS = {
  family_accounts: familyAccountPayloadSchema,
  mortgages: mortgagePayloadSchema,
  credit_protection: creditProtectionPayloadSchema,
  insurance_policies: insurancePayloadSchema,
  bills_and_cancellations: billsPayloadSchema,
  digital_legacy: digitalLegacyPayloadSchema,
} as const;

/**
 * Validates the plaintext of a family-vault section.
 *
 * Preconditions: `section` is one of `FAMILY_VAULT_SECTIONS`.
 * Postconditions: the result matches that section's schema, version 1.
 * Data contract: bank relationships cannot contain a run of eight digits. The server never receives this object.
 *
 * @param section - Vault section.
 * @param value - Candidate plaintext.
 * @returns The parsed payload.
 */
export function parseVaultPayload(section: FamilyVaultSection, value: unknown): VaultPayload {
  return PAYLOADS[section].parse(value);
}

/** Account key material the browser may see without the recovery phrase. */
export const accountKeysSchema = z
  .object({
    state: z.literal('ready'),
    publicKey: base64UrlSchema,
    wrappedPrivateKey: base64UrlSchema,
    recoveryPublicKey: base64UrlSchema,
    vaultPublicKey: base64UrlSchema.nullable(),
    wrappedVaultPrivateKey: base64UrlSchema.nullable(),
    recoverySealedVaultKey: base64UrlSchema.nullable(),
    fingerprint: z.string().regex(/^[a-z]+( [a-z]+){5}$/u),
  })
  .strict()
  .meta({ id: 'AccountKeys' });
/** Account key material returned by `GET /me/keys` when keys exist. */
export type AccountKeys = z.infer<typeof accountKeysSchema>;

/** `GET /me/keys` when the account has not created keys yet. */
export const missingAccountKeysSchema = z
  .object({ state: z.literal('missing') })
  .strict()
  .meta({ id: 'MissingAccountKeys' });

/** Response of `GET /me/keys`. Recovery-wrapped keys are not included. */
export const accountKeysResponseSchema = z.discriminatedUnion('state', [
  missingAccountKeysSchema,
  accountKeysSchema,
]);
/** Response of `GET /me/keys`. */
export type AccountKeysResponse = z.infer<typeof accountKeysResponseSchema>;

/** Body of `PUT /me/keys`. Sent once, after the person has confirmed the recovery phrase. */
export const putAccountKeysRequestSchema = z
  .object({
    publicKey: base64UrlSchema,
    wrappedPrivateKey: base64UrlSchema,
    recoveryPublicKey: base64UrlSchema,
    recoveryWrappedPrivateKey: base64UrlSchema,
    recoveryWrappedAccountKey: base64UrlSchema,
    recoveryVerifierSha256: base64UrlSchema,
    fingerprint: z.string().regex(/^[a-z]+( [a-z]+){5}$/u),
  })
  .strict()
  .meta({ id: 'PutAccountKeysRequest' });
/** Body of `PUT /me/keys`. */
export type PutAccountKeysRequest = z.infer<typeof putAccountKeysRequestSchema>;

/** A device and the account key wrapped for its device key. */
export const deviceSchema = z
  .object({
    id: uuidV7Schema,
    label: z.string().trim().min(1).max(80),
    platform: z.enum(DEVICE_PLATFORMS),
    wrappedAccountKey: base64UrlSchema,
    pairedVia: z.enum(['signup', 'pairing', 'recovery']),
  })
  .strict()
  .meta({ id: 'Device' });
/** A paired device. */
export type Device = z.infer<typeof deviceSchema>;

/** Body of `POST /me/devices`. */
export const registerDeviceRequestSchema = deviceSchema.meta({ id: 'RegisterDeviceRequest' });
/** Body of `POST /me/devices`. */
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;

/** Path of `GET /me/devices/{deviceId}`. */
export const deviceParamsSchema = z.object({ deviceId: uuidV7Schema }).strict();

/** Body of `POST /me/recovery/verify`. */
export const verifyRecoveryRequestSchema = z
  .object({ verifier: base64UrlSchema })
  .strict()
  .meta({ id: 'VerifyRecoveryRequest' });
/** Body of `POST /me/recovery/verify`. */
export type VerifyRecoveryRequest = z.infer<typeof verifyRecoveryRequestSchema>;

/** Recovery-wrapped copies, returned only after the phrase verifier matches. */
export const recoveryMaterialSchema = z
  .object({
    recoveryPublicKey: base64UrlSchema,
    recoveryWrappedPrivateKey: base64UrlSchema,
    recoveryWrappedAccountKey: base64UrlSchema,
  })
  .strict()
  .meta({ id: 'RecoveryMaterial' });
/** Recovery-wrapped copies. */
export type RecoveryMaterial = z.infer<typeof recoveryMaterialSchema>;

/** Response of `GET /me/vault-pin`. */
export const vaultPinStatusSchema = z
  .object({
    state: z.enum(['not_set', 'active', 'locked']),
    salt: base64UrlSchema.nullable(),
    kdf: vaultKdfSchema.nullable(),
    remainingAttempts: z.int().min(0).max(5),
    pinGeneration: z.int().min(1).nullable(),
  })
  .strict()
  .meta({ id: 'VaultPinStatus' });
/** Response of `GET /me/vault-pin`. */
export type VaultPinStatus = z.infer<typeof vaultPinStatusSchema>;

/** Body of `PUT /me/vault-pin`. The code itself is never sent. */
export const setVaultPinRequestSchema = z
  .object({
    salt: base64UrlSchema,
    kdf: vaultKdfSchema,
    verifier: base64UrlSchema,
    serverShare: base64UrlSchema,
    wrappedVaultPrivateKey: base64UrlSchema,
    pinGeneration: z.int().min(1),
    vaultPublicKey: base64UrlSchema.optional(),
    recoverySealedVaultKey: base64UrlSchema.optional(),
  })
  .strict()
  .meta({ id: 'SetVaultPinRequest' });
/** Body of `PUT /me/vault-pin`. */
export type SetVaultPinRequest = z.infer<typeof setVaultPinRequestSchema>;

/** Body of `POST /me/vault-pin/unlock`. */
export const unlockVaultRequestSchema = z
  .object({ verifier: base64UrlSchema })
  .strict()
  .meta({ id: 'UnlockVaultRequest' });
/** Body of `POST /me/vault-pin/unlock`. */
export type UnlockVaultRequest = z.infer<typeof unlockVaultRequestSchema>;

/** Response of a successful unlock. `serverShare` exists only in this response. */
export const unlockVaultResponseSchema = z
  .object({
    serverShare: base64UrlSchema,
    unlockedUntil: instantSchema,
    pinGeneration: z.int().min(1),
  })
  .strict()
  .meta({ id: 'UnlockVaultResponse' });
/** Response of a successful unlock. */
export type UnlockVaultResponse = z.infer<typeof unlockVaultResponseSchema>;

/** Body of `POST /me/vault-pin/reset`. The recovery phrase is not sent, only its verifier. */
export const resetVaultPinRequestSchema = setVaultPinRequestSchema
  .extend({ recoveryVerifier: base64UrlSchema })
  .strict()
  .meta({ id: 'ResetVaultPinRequest' });
/** Body of `POST /me/vault-pin/reset`. */
export type ResetVaultPinRequest = z.infer<typeof resetVaultPinRequestSchema>;

/** Family vault scope and the caller's grant, if one exists. */
export const vaultScopeSchema = z
  .object({
    scopeId: uuidV7Schema.nullable(),
    version: z.int().min(1).nullable(),
    grant: base64UrlSchema.nullable(),
  })
  .strict()
  .meta({ id: 'VaultScope' });
/** Family vault scope. */
export type VaultScope = z.infer<typeof vaultScopeSchema>;

/** Body of `PUT /families/{familyId}/vault/scope`. */
export const putVaultScopeRequestSchema = z
  .object({
    scopeId: uuidV7Schema,
    grant: base64UrlSchema,
  })
  .strict()
  .meta({ id: 'PutVaultScopeRequest' });
/** Body of `PUT /families/{familyId}/vault/scope`. */
export type PutVaultScopeRequest = z.infer<typeof putVaultScopeRequestSchema>;

/** One family-vault document. The server stores and returns ciphertext only. */
export const vaultItemSchema = z
  .object({
    id: uuidV7Schema,
    section: z.enum(FAMILY_VAULT_SECTIONS),
    version: z.int().min(1),
    sealed: z
      .object({
        scopeId: uuidV7Schema,
        keyVersion: z.int().min(1),
        dek: base64UrlSchema,
        payload: base64UrlSchema,
      })
      .strict(),
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'VaultItem' });
/** One family-vault document. */
export type VaultItem = z.infer<typeof vaultItemSchema>;

/** Page of family-vault documents. */
export const vaultItemPageSchema = pageSchema(vaultItemSchema).meta({ id: 'VaultItemPage' });
/** Page of family-vault documents. */
export type VaultItemPage = z.infer<typeof vaultItemPageSchema>;

/** Query of `GET /families/{familyId}/vault/items`. */
export const vaultListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.string().max(512).optional(),
    section: z.enum(FAMILY_VAULT_SECTIONS).optional(),
  })
  .strict();
/** Query of the vault item list. */
export type VaultListQuery = z.infer<typeof vaultListQuerySchema>;

/** Body of `POST /families/{familyId}/vault/items`. */
export const createVaultItemRequestSchema = z
  .object({
    id: uuidV7Schema,
    section: z.enum(FAMILY_VAULT_SECTIONS),
    sealed: vaultItemSchema.shape.sealed,
  })
  .strict()
  .meta({ id: 'CreateVaultItemRequest' });
/** Body of `POST /families/{familyId}/vault/items`. */
export type CreateVaultItemRequest = z.infer<typeof createVaultItemRequestSchema>;

/** Body of `PATCH /families/{familyId}/vault/items/{itemId}`. */
export const updateVaultItemRequestSchema = z
  .object({ sealed: vaultItemSchema.shape.sealed })
  .strict()
  .meta({ id: 'UpdateVaultItemRequest' });
/** Body of `PATCH /families/{familyId}/vault/items/{itemId}`. */
export type UpdateVaultItemRequest = z.infer<typeof updateVaultItemRequestSchema>;

/** Path of one vault item. */
export const vaultItemParamsSchema = z.object({ familyId: uuidSchema, itemId: uuidV7Schema }).strict();
