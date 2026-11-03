import { concatBytes, randomBytes, readUintBE, uintBE, utf8, type Bytes } from './bytes.js';
import { CryptoFormatError } from './errors.js';
import { HKDF_LABELS } from './labels.js';
import {
  IV_LENGTH,
  P256_PUBLIC_KEY_LENGTH,
  TAG_LENGTH,
  aesGcmDecrypt,
  aesGcmEncrypt,
  ecdhSharedSecret,
  exportPublicKey,
  generateEcdhKeyPair,
  hkdf,
  hkdfInfo,
  importAesKey,
  importPublicKey,
} from './primitives.js';

/** Version byte of `DS-ENV v1`. */
export const ENVELOPE_VERSION = 0x01;
/** Smallest valid `DS-ENV v1`: version + IV + tag (empty plaintext). */
export const MIN_ENVELOPE_LENGTH = 1 + IV_LENGTH + TAG_LENGTH;
/** Version byte of `DS-GRANT v1`. */
export const GRANT_VERSION = 0x01;
/** Plaintext chunk size of `DS-STREAM v1` (1 MiB). */
export const STREAM_CHUNK_SIZE = 1_048_576;
/** Header length of `DS-STREAM v1`: magic (4) + version (1) + nonce prefix (7). */
export const STREAM_HEADER_LENGTH = 12;
/** First byte of a class S server secret (`S1`). */
export const S1_PREFIX = 0x53;

const STREAM_MAGIC = utf8('DSS1');
const STREAM_VERSION = 0x01;
const STREAM_PREFIX_LENGTH = 7;
const MAX_STREAM_CHUNKS = 2 ** 32;

/**
 * Seals data in `DS-ENV v1`: `0x01 ‖ IV(12) ‖ AES-256-GCM(ciphertext ‖ tag)`.
 *
 * @param key - AES-256-GCM key.
 * @param plaintext - Data to protect.
 * @param additionalData - Associated data from `aad.*`.
 * @returns The envelope; a fresh random IV is used on every call.
 */
export async function sealEnvelope(key: CryptoKey, plaintext: Bytes, additionalData: Bytes): Promise<Bytes> {
  const iv = randomBytes(IV_LENGTH);
  const ciphertext = await aesGcmEncrypt(key, iv, plaintext, additionalData);
  return concatBytes(Uint8Array.of(ENVELOPE_VERSION), iv, ciphertext);
}

/**
 * Opens a `DS-ENV v1` envelope.
 *
 * @param key - AES-256-GCM key used to seal.
 * @param envelope - Envelope bytes.
 * @param additionalData - Associated data used to seal.
 * @returns The plaintext.
 * @throws CryptoFormatError for an unknown version or a truncated envelope.
 * @throws DecryptionError when the key, associated data or bytes do not match.
 */
export async function openEnvelope(key: CryptoKey, envelope: Bytes, additionalData: Bytes): Promise<Bytes> {
  if (envelope.length < MIN_ENVELOPE_LENGTH) {
    throw new CryptoFormatError('Envelope too short');
  }
  if (envelope[0] !== ENVELOPE_VERSION) {
    throw new CryptoFormatError('Unsupported envelope version');
  }
  return aesGcmDecrypt(key, envelope.slice(1, 1 + IV_LENGTH), envelope.slice(1 + IV_LENGTH), additionalData);
}

async function grantKek(
  sharedSecret: Bytes,
  ephemeralPublic: Bytes,
  recipientPublic: Bytes,
): Promise<CryptoKey> {
  const kek = await hkdf(sharedSecret, hkdfInfo(HKDF_LABELS.grant, ephemeralPublic, recipientPublic));
  return importAesKey(kek);
}

/**
 * Seals a secret for a P-256 public key in `DS-GRANT v1` (ECIES with a fresh ephemeral key pair).
 *
 * @param recipientPublicKey - Uncompressed recipient public key (65 bytes).
 * @param secret - Bytes to deliver, typically a 32-byte scope key.
 * @param additionalData - Associated data from `aad.grant` or `aad.recoveryVaultKey`.
 * @returns `0x01 ‖ ephemeral public key(65) ‖ DS-ENV v1`.
 */
export async function sealGrant(
  recipientPublicKey: Bytes,
  secret: Bytes,
  additionalData: Bytes,
): Promise<Bytes> {
  const recipient = await importPublicKey(recipientPublicKey);
  const ephemeral = await generateEcdhKeyPair();
  const ephemeralPublic = await exportPublicKey(ephemeral.publicKey);
  const shared = await ecdhSharedSecret(ephemeral.privateKey, recipient);
  const kek = await grantKek(shared, ephemeralPublic, recipientPublicKey);
  const envelope = await sealEnvelope(kek, secret, additionalData);
  return concatBytes(Uint8Array.of(GRANT_VERSION), ephemeralPublic, envelope);
}

/**
 * Opens a `DS-GRANT v1` blob with the recipient's private key.
 *
 * @param recipientPrivateKey - ECDH private key matching `recipientPublicKey`.
 * @param recipientPublicKey - Uncompressed recipient public key, bound into the KEK derivation.
 * @param grant - Grant bytes.
 * @param additionalData - Associated data used to seal.
 * @returns The delivered secret.
 * @throws CryptoFormatError for an unknown version or truncated grant.
 * @throws DecryptionError when the grant was not sealed for this key or context.
 */
export async function openGrant(
  recipientPrivateKey: CryptoKey,
  recipientPublicKey: Bytes,
  grant: Bytes,
  additionalData: Bytes,
): Promise<Bytes> {
  if (grant.length < 1 + P256_PUBLIC_KEY_LENGTH + MIN_ENVELOPE_LENGTH) {
    throw new CryptoFormatError('Grant too short');
  }
  if (grant[0] !== GRANT_VERSION) {
    throw new CryptoFormatError('Unsupported grant version');
  }
  const ephemeralPublic = grant.slice(1, 1 + P256_PUBLIC_KEY_LENGTH);
  const shared = await ecdhSharedSecret(recipientPrivateKey, await importPublicKey(ephemeralPublic));
  const kek = await grantKek(shared, ephemeralPublic, recipientPublicKey);
  return openEnvelope(kek, grant.slice(1 + P256_PUBLIC_KEY_LENGTH), additionalData);
}

function streamNonce(prefix: Bytes, index: number, last: boolean): Bytes {
  return concatBytes(prefix, uintBE(index, 4), Uint8Array.of(last ? 0x01 : 0x00));
}

/**
 * Seals data in `DS-STREAM v1`: header `"DSS1" ‖ 0x01 ‖ nonce prefix(7)` followed by AES-GCM chunks
 * of at most 1 MiB plaintext. The nonce of chunk `i` is `prefix ‖ uint32(i) ‖ lastFlag`.
 *
 * @param key - AES-256-GCM key (a per-file DEK or the backup key).
 * @param plaintext - Whole content; an empty input yields a single empty final chunk.
 * @param additionalData - Associated data from `aad.file` or `aad.backup`, bound to every chunk.
 * @returns The stream bytes.
 */
export async function sealStream(key: CryptoKey, plaintext: Bytes, additionalData: Bytes): Promise<Bytes> {
  const prefix = randomBytes(STREAM_PREFIX_LENGTH);
  const chunkCount = Math.max(1, Math.ceil(plaintext.length / STREAM_CHUNK_SIZE));
  const parts: Bytes[] = [concatBytes(STREAM_MAGIC, Uint8Array.of(STREAM_VERSION), prefix)];
  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = plaintext.slice(index * STREAM_CHUNK_SIZE, (index + 1) * STREAM_CHUNK_SIZE);
    parts.push(
      await aesGcmEncrypt(key, streamNonce(prefix, index, index === chunkCount - 1), chunk, additionalData),
    );
  }
  return concatBytes(...parts);
}

/**
 * Opens a `DS-STREAM v1` blob, detecting truncation, reordering and extension.
 *
 * @param key - AES-256-GCM key used to seal.
 * @param data - Stream bytes.
 * @param additionalData - Associated data used to seal.
 * @returns The concatenated plaintext.
 * @throws CryptoFormatError for a wrong magic, version or impossible layout.
 * @throws DecryptionError when any chunk fails authentication.
 */
export async function openStream(key: CryptoKey, data: Bytes, additionalData: Bytes): Promise<Bytes> {
  if (data.length < STREAM_HEADER_LENGTH + TAG_LENGTH) {
    throw new CryptoFormatError('Stream too short');
  }
  for (let index = 0; index < STREAM_MAGIC.length; index += 1) {
    if (data[index] !== STREAM_MAGIC[index]) {
      throw new CryptoFormatError('Not a DS-STREAM blob');
    }
  }
  if (data[4] !== STREAM_VERSION) {
    throw new CryptoFormatError('Unsupported stream version');
  }
  const prefix = data.slice(5, STREAM_HEADER_LENGTH);
  const fullChunk = STREAM_CHUNK_SIZE + TAG_LENGTH;
  const parts: Bytes[] = [];
  let offset = STREAM_HEADER_LENGTH;
  for (let index = 0; offset < data.length; index += 1) {
    if (index >= MAX_STREAM_CHUNKS) {
      throw new CryptoFormatError('Stream has too many chunks');
    }
    const remaining = data.length - offset;
    const last = remaining <= fullChunk;
    const length = last ? remaining : fullChunk;
    if (length < TAG_LENGTH) {
      throw new CryptoFormatError('Truncated stream chunk');
    }
    parts.push(
      await aesGcmDecrypt(
        key,
        streamNonce(prefix, index, last),
        data.slice(offset, offset + length),
        additionalData,
      ),
    );
    offset += length;
  }
  return concatBytes(...parts);
}

/**
 * Seals a class S server secret: `0x53 ‖ keyVersion(uint16) ‖ IV(12) ‖ ciphertext ‖ tag`.
 *
 * @param key - AES-256-GCM key of master-key version `keyVersion`.
 * @param keyVersion - Master-key version in `[1, 65535]`.
 * @param plaintext - Secret bytes.
 * @param additionalData - `aad.serverSecret(table, column, rowId)`.
 * @returns The `S1` blob.
 */
export async function sealS1(
  key: CryptoKey,
  keyVersion: number,
  plaintext: Bytes,
  additionalData: Bytes,
): Promise<Bytes> {
  const iv = randomBytes(IV_LENGTH);
  const ciphertext = await aesGcmEncrypt(key, iv, plaintext, additionalData);
  return concatBytes(Uint8Array.of(S1_PREFIX), uintBE(keyVersion, 2), iv, ciphertext);
}

/**
 * Reads the master-key version of an `S1` blob without decrypting it.
 *
 * @param blob - `S1` bytes.
 * @returns The key version.
 * @throws CryptoFormatError when the blob is not `S1`.
 */
export function s1KeyVersion(blob: Bytes): number {
  if (blob.length < 3 + IV_LENGTH + TAG_LENGTH || blob[0] !== S1_PREFIX) {
    throw new CryptoFormatError('Not an S1 blob');
  }
  return readUintBE(blob, 1, 2);
}

/**
 * Opens an `S1` blob with the key of its version.
 *
 * @param key - AES-256-GCM key of the version reported by `s1KeyVersion`.
 * @param blob - `S1` bytes.
 * @param additionalData - Associated data used to seal.
 * @returns The secret.
 * @throws CryptoFormatError when the blob is not `S1`.
 * @throws DecryptionError when authentication fails.
 */
export async function openS1(key: CryptoKey, blob: Bytes, additionalData: Bytes): Promise<Bytes> {
  s1KeyVersion(blob);
  return aesGcmDecrypt(key, blob.slice(3, 3 + IV_LENGTH), blob.slice(3 + IV_LENGTH), additionalData);
}
