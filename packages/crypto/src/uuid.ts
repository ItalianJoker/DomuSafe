import { randomBytes, toHex } from './bytes.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Generates a UUIDv7 (RFC 9562): 48-bit Unix milliseconds, version 7, variant 10, 74 random bits.
 * Ids of encrypted rows are generated in the browser because they are part of the associated data.
 *
 * @param now - Timestamp in milliseconds; defaults to the current time.
 * @returns Lowercase canonical UUID string.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  let time = Math.floor(now);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const hex = toHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Checks that a string is a canonical lowercase UUIDv7.
 *
 * @param value - Candidate id.
 * @returns `true` for version-7, variant-10 UUIDs.
 */
export function isUuidV7(value: string): boolean {
  return UUID_V7.test(value);
}
