import { fromUtf8, randomBytes, utf8, type Bytes } from './bytes.js';
import { openEnvelope, openGrant, sealEnvelope, sealGrant } from './formats.js';
import {
  KDF_SALT_LENGTH,
  PIN_KDF_PARAMS,
  deriveAccountPrivateKeyKek,
  derivePinVerifier,
  deriveRecoveryMaterial,
  deriveVaultSecret,
  deriveVaultUnlockKey,
  recoveryVerifierDigest,
  type Argon2Params,
} from './kdf.js';
import { aad, type GranteeKind } from './labels.js';
import {
  KEY_LENGTH,
  exportPrivateKey,
  exportPublicKey,
  generateEcdhKeyPair,
  importAesKey,
  importPrivateKey,
} from './primitives.js';
import { generateRecoveryEntropy, publicKeyFingerprint, recoveryEntropyFromPhrase, recoveryPhraseFromEntropy } from './words.js';

/** Server-side copy of an account's key material (`account_keys` without the vault columns). */
export interface AccountKeyBundle {
  readonly publicKey: Bytes;
  readonly wrappedPrivateKey: Bytes;
  readonly recoveryPublicKey: Bytes;
  readonly recoveryWrappedPrivateKey: Bytes;
  readonly recoveryWrappedAccountKey: Bytes;
  readonly recoveryVerifierSha256: Bytes;
  readonly fingerprint: readonly string[];
}

/** Secrets that exist only in the browser right after `createAccountKeys`. */
export interface AccountKeySecrets {
  readonly accountKey: Bytes;
  readonly privateKey: CryptoKey;
  readonly recoveryPhrase: string;
}

/** Request body for setting or resetting the vault PIN (phase 3, §6.5). */
export interface VaultPinSetup {
  readonly salt: Bytes;
  readonly kdf: Argon2Params;
  readonly verifier: Bytes;
  readonly serverShare: Bytes;
  readonly vaultPublicKey: Bytes;
  readonly wrappedVaultPrivateKey: Bytes;
  readonly recoverySealedVaultKey: Bytes;
  readonly pinGeneration: number;
}

/** Encrypted A/B record as stored in the `enc_*` columns. */
export interface SealedRecord {
  readonly scopeId: string;
  readonly keyVersion: number;
  readonly dek: Bytes;
  readonly payload: Bytes;
}

async function wrapWith(kekBytes: Bytes, secret: Bytes, additionalData: Bytes): Promise<Bytes> {
  return sealEnvelope(await importAesKey(kekBytes), secret, additionalData);
}

async function unwrapWith(kekBytes: Bytes, envelope: Bytes, additionalData: Bytes): Promise<Bytes> {
  return openEnvelope(await importAesKey(kekBytes), envelope, additionalData);
}

/**
 * Creates the full key set of a new account in the browser (phase 2, §8.6): account key, general and
 * recovery key pairs, 24-word recovery phrase and all server-side wrapped copies.
 *
 * @param accountId - Account id (bound into every associated data).
 * @returns `bundle` to upload and `secrets` to keep in memory; the phrase is shown once and discarded.
 */
export async function createAccountKeys(
  accountId: string,
): Promise<{ bundle: AccountKeyBundle; secrets: AccountKeySecrets }> {
  const accountKey = randomBytes(KEY_LENGTH);
  const entropy = generateRecoveryEntropy();
  const [general, recovery, material] = await Promise.all([
    generateEcdhKeyPair(),
    generateEcdhKeyPair(),
    deriveRecoveryMaterial(entropy),
  ]);
  const [publicKey, recoveryPublicKey, generalPkcs8, recoveryPkcs8] = await Promise.all([
    exportPublicKey(general.publicKey),
    exportPublicKey(recovery.publicKey),
    exportPrivateKey(general.privateKey),
    exportPrivateKey(recovery.privateKey),
  ]);
  const [wrappedPrivateKey, recoveryWrappedPrivateKey, recoveryWrappedAccountKey, recoveryVerifierSha256, fingerprint] =
    await Promise.all([
      wrapWith(await deriveAccountPrivateKeyKek(accountKey), generalPkcs8, aad.accountPrivateKey(accountId)),
      wrapWith(material.privateKeyKek, recoveryPkcs8, aad.recoveryPrivateKey(accountId)),
      wrapWith(material.accountKeyKek, accountKey, aad.recoveryAccountKey(accountId)),
      recoveryVerifierDigest(material.verifier),
      publicKeyFingerprint(publicKey),
    ]);
  return {
    bundle: {
      publicKey,
      wrappedPrivateKey,
      recoveryPublicKey,
      recoveryWrappedPrivateKey,
      recoveryWrappedAccountKey,
      recoveryVerifierSha256,
      fingerprint,
    },
    secrets: {
      accountKey,
      privateKey: await importPrivateKey(generalPkcs8),
      recoveryPhrase: recoveryPhraseFromEntropy(entropy),
    },
  };
}

/**
 * Opens the general private key with the account key.
 *
 * @param accountKey - 32-byte account key.
 * @param wrappedPrivateKey - `account_keys.wrapped_private_key`.
 * @param accountId - Account id.
 * @returns Non-extractable ECDH private key.
 */
export async function openAccountPrivateKey(
  accountKey: Bytes,
  wrappedPrivateKey: Bytes,
  accountId: string,
): Promise<CryptoKey> {
  const pkcs8 = await unwrapWith(await deriveAccountPrivateKeyKek(accountKey), wrappedPrivateKey, aad.accountPrivateKey(accountId));
  return importPrivateKey(pkcs8);
}

/**
 * Wraps the account key for one device with its non-extractable device key.
 *
 * @param deviceKey - Device AES key from `generateDeviceKey`.
 * @param accountKey - 32-byte account key.
 * @param accountId - Account id.
 * @param deviceId - Device id (UUIDv7 generated in the browser).
 * @returns `devices.wrapped_account_key`.
 */
export async function wrapAccountKeyForDevice(
  deviceKey: CryptoKey,
  accountKey: Bytes,
  accountId: string,
  deviceId: string,
): Promise<Bytes> {
  return sealEnvelope(deviceKey, accountKey, aad.deviceAccountKey(accountId, deviceId));
}

/**
 * Opens the account key on its device.
 *
 * @param deviceKey - Device AES key.
 * @param wrapped - `devices.wrapped_account_key`.
 * @param accountId - Account id.
 * @param deviceId - Device id.
 * @returns 32-byte account key.
 */
export async function openAccountKeyForDevice(
  deviceKey: CryptoKey,
  wrapped: Bytes,
  accountId: string,
  deviceId: string,
): Promise<Bytes> {
  return openEnvelope(deviceKey, wrapped, aad.deviceAccountKey(accountId, deviceId));
}

/**
 * Recovers the account key and the recovery private key from the 24-word phrase.
 *
 * @param phrase - Recovery phrase typed by the user.
 * @param bundle - Recovery columns of `account_keys`.
 * @param accountId - Account id.
 * @returns Account key, recovery private key and the verifier to prove possession to the server.
 * @throws InvalidRecoveryPhraseError for an invalid phrase; DecryptionError when the phrase belongs to another account.
 */
export async function recoverWithPhrase(
  phrase: string,
  bundle: Pick<AccountKeyBundle, 'recoveryWrappedAccountKey' | 'recoveryWrappedPrivateKey'>,
  accountId: string,
): Promise<{ accountKey: Bytes; recoveryPrivateKey: CryptoKey; verifier: Bytes }> {
  const material = await deriveRecoveryMaterial(recoveryEntropyFromPhrase(phrase));
  const [accountKey, recoveryPkcs8] = await Promise.all([
    unwrapWith(material.accountKeyKek, bundle.recoveryWrappedAccountKey, aad.recoveryAccountKey(accountId)),
    unwrapWith(material.privateKeyKek, bundle.recoveryWrappedPrivateKey, aad.recoveryPrivateKey(accountId)),
  ]);
  return { accountKey, recoveryPrivateKey: await importPrivateKey(recoveryPkcs8), verifier: material.verifier };
}

/**
 * Prepares the first vault PIN or a PIN change/reset (phase 2, §8.7). A new vault key pair is created
 * only when `existingVaultPrivateKey` is absent; otherwise the existing key is re-wrapped.
 *
 * @param input - Account id and key, PIN, recovery public key, next PIN generation, optional existing
 *   extractable vault private key.
 * @returns Request body for the server and the vault private key to keep in memory.
 */
export async function prepareVaultPin(input: {
  readonly accountId: string;
  readonly accountKey: Bytes;
  readonly pin: string;
  readonly recoveryPublicKey: Bytes;
  readonly pinGeneration: number;
  readonly existingVaultPrivateKey?: CryptoKey;
  readonly existingVaultPublicKey?: Bytes;
}): Promise<{ setup: VaultPinSetup; vaultPrivateKey: CryptoKey }> {
  const salt = randomBytes(KDF_SALT_LENGTH);
  const serverShare = randomBytes(KEY_LENGTH);
  let privateKey = input.existingVaultPrivateKey;
  let vaultPublicKey = input.existingVaultPublicKey;
  if (privateKey === undefined || vaultPublicKey === undefined) {
    const pair = await generateEcdhKeyPair();
    privateKey = pair.privateKey;
    vaultPublicKey = await exportPublicKey(pair.publicKey);
  }
  const pkcs8 = await exportPrivateKey(privateKey);
  const unlockKey = await deriveVaultUnlockKey(await deriveVaultSecret(input.accountKey), serverShare);
  const [verifier, wrappedVaultPrivateKey, recoverySealedVaultKey] = await Promise.all([
    derivePinVerifier(input.pin, salt, PIN_KDF_PARAMS),
    wrapWith(unlockKey, pkcs8, aad.vaultPrivateKey(input.accountId, input.pinGeneration)),
    sealGrant(input.recoveryPublicKey, pkcs8, aad.recoveryVaultKey(input.accountId)),
  ]);
  return {
    setup: {
      salt,
      kdf: PIN_KDF_PARAMS,
      verifier,
      serverShare,
      vaultPublicKey,
      wrappedVaultPrivateKey,
      recoverySealedVaultKey,
      pinGeneration: input.pinGeneration,
    },
    vaultPrivateKey: await importPrivateKey(pkcs8, true),
  };
}

/**
 * Opens the vault private key after a successful PIN check.
 *
 * @param input - Account id and key, server share, wrapped key and its PIN generation.
 * @param extractable - `true` only for a PIN change, which re-wraps the key.
 * @returns ECDH private key that opens `vault` grants.
 */
export async function openVaultPrivateKey(
  input: {
    readonly accountId: string;
    readonly accountKey: Bytes;
    readonly serverShare: Bytes;
    readonly wrappedVaultPrivateKey: Bytes;
    readonly pinGeneration: number;
  },
  extractable = false,
): Promise<CryptoKey> {
  const unlockKey = await deriveVaultUnlockKey(await deriveVaultSecret(input.accountKey), input.serverShare);
  const pkcs8 = await unwrapWith(unlockKey, input.wrappedVaultPrivateKey, aad.vaultPrivateKey(input.accountId, input.pinGeneration));
  return importPrivateKey(pkcs8, extractable);
}

/**
 * Opens the vault private key with the recovery private key (offline unlock and PIN reset).
 *
 * @param input - Recovery key pair, sealed copy from `account_keys.recovery_sealed_vault_key`, account id.
 * @returns Extractable vault private key (so a reset can re-wrap it).
 */
export async function openVaultPrivateKeyWithRecovery(input: {
  readonly recoveryPrivateKey: CryptoKey;
  readonly recoveryPublicKey: Bytes;
  readonly recoverySealedVaultKey: Bytes;
  readonly accountId: string;
}): Promise<CryptoKey> {
  const pkcs8 = await openGrant(
    input.recoveryPrivateKey,
    input.recoveryPublicKey,
    input.recoverySealedVaultKey,
    aad.recoveryVaultKey(input.accountId),
  );
  return importPrivateKey(pkcs8, true);
}

/**
 * Generates a new scope key (one per scope version).
 *
 * @returns 32 random bytes; kept extractable in memory because it is granted to other members.
 */
export function generateScopeKey(): Bytes {
  return randomBytes(KEY_LENGTH);
}

/**
 * Grants a scope key version to a recipient public key.
 *
 * @param input - Scope id and version, scope key, grantee kind and id, grantee public key.
 * @returns `DS-GRANT v1` blob for `scope_key_grants.grant_blob`.
 */
export async function grantScopeKey(input: {
  readonly scopeId: string;
  readonly version: number;
  readonly scopeKey: Bytes;
  readonly grantee: GranteeKind;
  readonly granteeId: string;
  readonly granteePublicKey: Bytes;
}): Promise<Bytes> {
  return sealGrant(
    input.granteePublicKey,
    input.scopeKey,
    aad.grant(input.scopeId, input.version, input.grantee, input.granteeId),
  );
}

/**
 * Opens a scope-key grant.
 *
 * @param input - Grant blob, scope id and version, grantee kind and id, own key pair.
 * @returns The 32-byte scope key.
 */
export async function openScopeKeyGrant(input: {
  readonly grantBlob: Bytes;
  readonly scopeId: string;
  readonly version: number;
  readonly grantee: GranteeKind;
  readonly granteeId: string;
  readonly privateKey: CryptoKey;
  readonly publicKey: Bytes;
}): Promise<Bytes> {
  return openGrant(
    input.privateKey,
    input.publicKey,
    input.grantBlob,
    aad.grant(input.scopeId, input.version, input.grantee, input.granteeId),
  );
}

/**
 * Encrypts a record payload with a fresh DEK wrapped by the current scope key (phase 2, §8.6).
 *
 * @param input - Table, record id, record version being written, scope id and version, scope key, JSON payload.
 * @returns The four `enc_*` column values.
 */
export async function sealRecord(input: {
  readonly table: string;
  readonly recordId: string;
  readonly version: number;
  readonly scopeId: string;
  readonly scopeVersion: number;
  readonly scopeKey: Bytes;
  readonly payload: unknown;
}): Promise<SealedRecord> {
  const dekBytes = randomBytes(KEY_LENGTH);
  const [payload, dek] = await Promise.all([
    wrapWith(dekBytes, utf8(JSON.stringify(input.payload)), aad.record(input.table, input.recordId, input.version)),
    wrapWith(input.scopeKey, dekBytes, aad.dek(input.table, input.recordId, input.scopeId, input.scopeVersion)),
  ]);
  return { scopeId: input.scopeId, keyVersion: input.scopeVersion, dek, payload };
}

/**
 * Decrypts a record payload.
 *
 * @param input - Table, record id and version, sealed columns, scope key of `sealed.keyVersion`.
 * @returns The parsed JSON payload (validate it with the section schema before use).
 */
export async function openRecord(input: {
  readonly table: string;
  readonly recordId: string;
  readonly version: number;
  readonly sealed: SealedRecord;
  readonly scopeKey: Bytes;
}): Promise<unknown> {
  const dekBytes = await unwrapWith(
    input.scopeKey,
    input.sealed.dek,
    aad.dek(input.table, input.recordId, input.sealed.scopeId, input.sealed.keyVersion),
  );
  const plaintext = await unwrapWith(dekBytes, input.sealed.payload, aad.record(input.table, input.recordId, input.version));
  return JSON.parse(fromUtf8(plaintext)) as unknown;
}
