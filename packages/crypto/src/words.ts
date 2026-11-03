import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/italian.js';
import { copyBytes, randomBytes, sha256, type Bytes } from './bytes.js';
import { InvalidRecoveryPhraseError } from './errors.js';

/** Number of words in a recovery phrase (256 bits of entropy plus an 8-bit checksum). */
export const RECOVERY_WORD_COUNT = 24;
/** Recovery entropy length in bytes. */
export const RECOVERY_ENTROPY_LENGTH = 32;
/** Number of words in a public-key fingerprint (66 bits). */
export const FINGERPRINT_WORD_COUNT = 6;

const BITS_PER_WORD = 11;

/**
 * Maps the leading bits of `bytes` to words of the Italian BIP-39 list, 11 bits per word.
 *
 * @param bytes - Source bytes; must contain at least `count * 11` bits.
 * @param count - Number of words.
 * @returns The words, most significant bits first.
 * @throws RangeError when `bytes` is too short.
 */
export function bytesToWords(bytes: Uint8Array, count: number): string[] {
  const neededBits = count * BITS_PER_WORD;
  const neededBytes = Math.ceil(neededBits / 8);
  if (bytes.length < neededBytes) {
    throw new RangeError('Not enough bytes for the requested word count');
  }
  let value = 0n;
  for (const byte of bytes.subarray(0, neededBytes)) {
    value = (value << 8n) | BigInt(byte);
  }
  const totalBits = neededBytes * 8;
  const words: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const shift = BigInt(totalBits - BITS_PER_WORD * (index + 1));
    const wordIndex = Number((value >> shift) & 0x7ffn);
    words.push(wordlist[wordIndex] ?? '');
  }
  return words;
}

/**
 * Computes the 6-word fingerprint of a P-256 public key shown during access requests.
 *
 * @param publicKey - Uncompressed public key.
 * @returns Six Italian words derived from SHA-256 of the key.
 */
export async function publicKeyFingerprint(publicKey: Bytes): Promise<string[]> {
  return bytesToWords(await sha256(publicKey), FINGERPRINT_WORD_COUNT);
}

/**
 * Generates fresh recovery entropy.
 *
 * @returns 32 random bytes.
 */
export function generateRecoveryEntropy(): Bytes {
  return randomBytes(RECOVERY_ENTROPY_LENGTH);
}

/**
 * Encodes recovery entropy as 24 Italian words.
 *
 * @param entropy - 32 bytes.
 * @returns Space-separated phrase.
 */
export function recoveryPhraseFromEntropy(entropy: Bytes): string {
  if (entropy.length !== RECOVERY_ENTROPY_LENGTH) {
    throw new RangeError('Recovery entropy must be 32 bytes');
  }
  return entropyToMnemonic(entropy, wordlist);
}

/**
 * Decodes a recovery phrase typed by the user.
 *
 * @param phrase - 24 words; case, extra spaces and line breaks are ignored.
 * @returns The 32-byte entropy.
 * @throws InvalidRecoveryPhraseError when a word is unknown, the count is wrong or the checksum fails.
 */
export function recoveryEntropyFromPhrase(phrase: string): Bytes {
  const normalized = phrase.normalize('NFKD').trim().toLowerCase().split(/\s+/u).join(' ');
  if (normalized.split(' ').length !== RECOVERY_WORD_COUNT) {
    throw new InvalidRecoveryPhraseError('The recovery phrase must contain 24 words');
  }
  try {
    return copyBytes(mnemonicToEntropy(normalized, wordlist));
  } catch {
    throw new InvalidRecoveryPhraseError('The recovery phrase is not valid');
  }
}
