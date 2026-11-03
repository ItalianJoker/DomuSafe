import { argon2id } from 'hash-wasm';
import { concatBytes, copyBytes, sha256, type Bytes } from './bytes.js';
import { HKDF_LABELS } from './labels.js';
import { hkdf, hkdfInfo } from './primitives.js';

/** Argon2id cost parameters (memory in KiB). */
export interface Argon2Params {
  readonly memoryKib: number;
  readonly iterations: number;
  readonly parallelism: number;
}

/** Browser-side Argon2id parameters for the vault PIN verifier (phase 2, §8.17). */
export const PIN_KDF_PARAMS: Argon2Params = { memoryKib: 65_536, iterations: 3, parallelism: 1 };
/** Browser-side Argon2id parameters for the backup passphrase (phase 2, §8.17). */
export const BACKUP_KDF_PARAMS: Argon2Params = { memoryKib: 65_536, iterations: 3, parallelism: 1 };
/** Length of the per-account PIN salt and of the backup salt. */
export const KDF_SALT_LENGTH = 16;

/** Outcome of local PIN validation; the server never sees the PIN, so this check runs in the browser. */
export type PinValidation = { readonly ok: true } | { readonly ok: false; readonly reason: 'too_short' | 'too_long' | 'trivial' };

const MIN_PIN_LENGTH = 6;
const MAX_PIN_LENGTH = 64;

async function argon2(secret: string, salt: Bytes, params: Argon2Params): Promise<Bytes> {
  const output = await argon2id({
    password: secret.normalize('NFKC'),
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKib,
    hashLength: 32,
    outputType: 'binary',
  });
  return copyBytes(output);
}

function graphemes(text: string): string[] {
  return Array.from(new Intl.Segmenter('it', { granularity: 'grapheme' }).segment(text), (part) => part.segment);
}

function isSequential(pin: string): boolean {
  if (!/^\d+$/.test(pin)) {
    return false;
  }
  const digits = Array.from(pin, Number);
  const ascending = digits.every((digit, index) => index === 0 || digit === ((digits[index - 1] ?? 0) + 1) % 10);
  const descending = digits.every((digit, index) => index === 0 || digit === ((digits[index - 1] ?? 0) + 9) % 10);
  return ascending || descending;
}

/**
 * Validates a vault PIN before it is used: 6–64 characters, not all equal, not a digit sequence,
 * and not one of the caller-supplied forbidden values (for example the linked resident's birth date).
 *
 * @param pin - Candidate PIN.
 * @param forbidden - Values the PIN must not equal after normalisation.
 * @returns Validation result with the first failing reason.
 */
export function validatePin(pin: string, forbidden: readonly string[] = []): PinValidation {
  const normalized = pin.normalize('NFKC');
  const characters = graphemes(normalized);
  if (characters.length < MIN_PIN_LENGTH) {
    return { ok: false, reason: 'too_short' };
  }
  if (characters.length > MAX_PIN_LENGTH) {
    return { ok: false, reason: 'too_long' };
  }
  const allSame = characters.every((char) => char === characters[0]);
  const forbiddenMatch = forbidden.some((value) => value.normalize('NFKC') === normalized);
  if (allSame || isSequential(normalized) || forbiddenMatch) {
    return { ok: false, reason: 'trivial' };
  }
  return { ok: true };
}

/**
 * Derives the 32-byte PIN verifier sent to the server: `Argon2id(PIN, salt)`.
 *
 * @param pin - PIN typed by the user (NFKC-normalised here).
 * @param salt - 16-byte per-account salt from `account_pins.pin_salt`.
 * @param params - Cost parameters stored with the account.
 * @returns The verifier.
 */
export async function derivePinVerifier(pin: string, salt: Bytes, params: Argon2Params = PIN_KDF_PARAMS): Promise<Bytes> {
  return argon2(pin, salt, params);
}

/**
 * Derives the 32-byte backup key from the passphrase chosen for a `DS-BACKUP v1` file.
 *
 * @param passphrase - Passphrase of at least 12 characters (checked by the caller's UI schema).
 * @param salt - 16-byte random salt stored in the backup header.
 * @param params - Cost parameters stored in the backup header.
 * @returns Raw AES-256 key bytes.
 */
export async function deriveBackupKey(
  passphrase: string,
  salt: Bytes,
  params: Argon2Params = BACKUP_KDF_PARAMS,
): Promise<Bytes> {
  return argon2(passphrase, salt, params);
}

/**
 * Derives the device-side vault secret from the account key.
 *
 * @param accountKey - 32-byte account key.
 * @returns `HKDF(AK, "domusafe/v1/vault-secret")`.
 */
export async function deriveVaultSecret(accountKey: Bytes): Promise<Bytes> {
  return hkdf(accountKey, hkdfInfo(HKDF_LABELS.vaultSecret));
}

/**
 * Derives the vault unlock key from the device-side secret and the server share released after the PIN.
 *
 * @param vaultSecret - Output of `deriveVaultSecret`.
 * @param serverShare - 32-byte share returned by `POST /me/vault-pin/unlock`.
 * @returns `HKDF(vaultSecret ‖ serverShare, "domusafe/v1/vault-unlock")`.
 */
export async function deriveVaultUnlockKey(vaultSecret: Bytes, serverShare: Bytes): Promise<Bytes> {
  return hkdf(concatBytes(vaultSecret, serverShare), hkdfInfo(HKDF_LABELS.vaultUnlock));
}

/**
 * Derives the KEK that wraps the account's general private key.
 *
 * @param accountKey - 32-byte account key.
 * @returns `HKDF(AK, "domusafe/v1/account-private-key-kek")`.
 */
export async function deriveAccountPrivateKeyKek(accountKey: Bytes): Promise<Bytes> {
  return hkdf(accountKey, hkdfInfo(HKDF_LABELS.accountPrivateKeyKek));
}

/** Keys derived from the 256-bit recovery entropy. */
export interface RecoveryMaterial {
  readonly accountKeyKek: Bytes;
  readonly privateKeyKek: Bytes;
  readonly verifier: Bytes;
}

/**
 * Derives the recovery KEKs and the server verifier from the recovery entropy.
 *
 * @param entropy - 32 bytes decoded from the 24-word phrase.
 * @returns The two KEKs and the verifier sent to the server (which stores only its SHA-256).
 */
export async function deriveRecoveryMaterial(entropy: Bytes): Promise<RecoveryMaterial> {
  const [accountKeyKek, privateKeyKek, verifier] = await Promise.all([
    hkdf(entropy, hkdfInfo(HKDF_LABELS.recoveryAccountKeyKek)),
    hkdf(entropy, hkdfInfo(HKDF_LABELS.recoveryPrivateKeyKek)),
    hkdf(entropy, hkdfInfo(HKDF_LABELS.recoveryVerifier)),
  ]);
  return { accountKeyKek, privateKeyKek, verifier };
}

/**
 * Computes the value the server stores for a recovery verifier.
 *
 * @param verifier - 32-byte verifier from `deriveRecoveryMaterial`.
 * @returns SHA-256 of the verifier.
 */
export async function recoveryVerifierDigest(verifier: Bytes): Promise<Bytes> {
  return sha256(verifier);
}
