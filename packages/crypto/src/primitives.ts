import { concatBytes, copyBytes, utf8, type Bytes } from './bytes.js';
import { DecryptionError } from './errors.js';

/** Length in bytes of every symmetric key in DomuSafe (AES-256, HKDF outputs). */
export const KEY_LENGTH = 32;
/** AES-GCM IV length in bytes (96 bits). */
export const IV_LENGTH = 12;
/** AES-GCM tag length in bytes (128 bits). */
export const TAG_LENGTH = 16;
/** Length of an uncompressed P-256 public key in bytes. */
export const P256_PUBLIC_KEY_LENGTH = 65;

const EMPTY: Bytes = new Uint8Array(0);
const ECDH_P256 = { name: 'ECDH', namedCurve: 'P-256' } as const;

/**
 * Builds an HKDF `info` value from a label and optional binary context.
 *
 * @param label - One of `HKDF_LABELS`.
 * @param context - Bytes appended after the UTF-8 label (for example public keys).
 * @returns The info bytes.
 */
export function hkdfInfo(label: string, ...context: readonly Uint8Array[]): Bytes {
  return concatBytes(utf8(label), ...context);
}

/**
 * HKDF-SHA-256 (RFC 5869) through Web Crypto.
 *
 * @param ikm - Input keying material.
 * @param info - Context and label (see `hkdfInfo`).
 * @param options - `salt` defaults to empty (RFC 5869 zero salt); `length` defaults to 32 bytes.
 * @returns Derived bytes of the requested length.
 */
export async function hkdf(
  ikm: Bytes,
  info: Bytes,
  options: { salt?: Bytes; length?: number } = {},
): Promise<Bytes> {
  const baseKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: options.salt ?? EMPTY, info },
    baseKey,
    (options.length ?? KEY_LENGTH) * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Imports 32 raw bytes as an AES-256-GCM key.
 *
 * @param raw - Exactly 32 bytes.
 * @param extractable - `true` only when the key must later be wrapped or granted.
 * @returns A `CryptoKey` usable for encrypt and decrypt.
 * @throws RangeError when `raw` is not 32 bytes.
 */
export async function importAesKey(raw: Bytes, extractable = false): Promise<CryptoKey> {
  if (raw.length !== KEY_LENGTH) {
    throw new RangeError('AES keys must be 32 bytes');
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, extractable, ['encrypt', 'decrypt']);
}

/**
 * Generates a non-extractable AES-256-GCM key, used as the device key stored in IndexedDB.
 *
 * @returns A key that can encrypt and decrypt but never leave the browser.
 */
export async function generateDeviceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypts with AES-256-GCM and a 128-bit tag.
 *
 * @param key - AES-GCM key.
 * @param iv - 12-byte IV, unique per key.
 * @param plaintext - Data to encrypt.
 * @param additionalData - Associated data bound to the ciphertext.
 * @returns Ciphertext followed by the tag.
 */
export async function aesGcmEncrypt(
  key: CryptoKey,
  iv: Bytes,
  plaintext: Bytes,
  additionalData: Bytes,
): Promise<Bytes> {
  return new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData, tagLength: TAG_LENGTH * 8 },
      key,
      plaintext,
    ),
  );
}

/**
 * Decrypts AES-256-GCM and verifies the tag.
 *
 * @param key - AES-GCM key.
 * @param iv - IV used for encryption.
 * @param ciphertext - Ciphertext followed by the tag.
 * @param additionalData - Associated data used for encryption.
 * @returns The plaintext.
 * @throws DecryptionError when authentication fails.
 */
export async function aesGcmDecrypt(
  key: CryptoKey,
  iv: Bytes,
  ciphertext: Bytes,
  additionalData: Bytes,
): Promise<Bytes> {
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData, tagLength: TAG_LENGTH * 8 },
        key,
        ciphertext,
      ),
    );
  } catch {
    throw new DecryptionError('Authenticated decryption failed');
  }
}

/**
 * Generates an extractable ECDH P-256 key pair (the private key is exported only to be wrapped).
 *
 * @returns The key pair.
 */
export async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDH_P256, true, ['deriveBits']);
}

/**
 * Exports a P-256 public key in uncompressed form.
 *
 * @param publicKey - ECDH public key.
 * @returns 65 bytes starting with `0x04`.
 */
export async function exportPublicKey(publicKey: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
}

/**
 * Imports an uncompressed P-256 public key.
 *
 * @param raw - 65 bytes starting with `0x04`.
 * @returns ECDH public key.
 * @throws RangeError when the length or prefix is wrong.
 */
export async function importPublicKey(raw: Bytes): Promise<CryptoKey> {
  if (raw.length !== P256_PUBLIC_KEY_LENGTH || raw[0] !== 0x04) {
    throw new RangeError('P-256 public keys must be 65 bytes in uncompressed form');
  }
  return crypto.subtle.importKey('raw', raw, ECDH_P256, true, []);
}

/**
 * Exports an ECDH private key as PKCS#8.
 *
 * @param privateKey - Extractable ECDH private key.
 * @returns PKCS#8 bytes.
 */
export async function exportPrivateKey(privateKey: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey));
}

/**
 * Imports a PKCS#8 ECDH private key.
 *
 * @param pkcs8 - PKCS#8 bytes.
 * @param extractable - `false` unless the key must be re-wrapped later.
 * @returns ECDH private key usable for `deriveBits`.
 */
export async function importPrivateKey(pkcs8: Bytes, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pkcs8, ECDH_P256, extractable, ['deriveBits']);
}

/**
 * Computes the ECDH shared secret (x coordinate, 32 bytes).
 *
 * @param privateKey - Own ECDH private key.
 * @param publicKey - Peer ECDH public key.
 * @returns 32-byte shared secret.
 */
export async function ecdhSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256));
}

/**
 * Exports the raw bytes of an extractable AES key.
 *
 * @param key - Extractable AES key.
 * @returns 32 raw bytes.
 */
export async function exportRawKey(key: CryptoKey): Promise<Bytes> {
  return copyBytes(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}
