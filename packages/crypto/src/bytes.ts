/** Byte array backed by a plain `ArrayBuffer`, the shape Web Crypto accepts as `BufferSource`. */
export type Bytes = Uint8Array<ArrayBuffer>;

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const BASE64URL_LOOKUP = new Map<string, number>(
  Array.from({ length: BASE64URL_ALPHABET.length }, (_, index) => [BASE64URL_ALPHABET.charAt(index), index]),
);
const MAX_RANDOM_CHUNK = 65_536;

/**
 * Concatenates byte arrays into a new buffer.
 *
 * @param parts - Arrays to join, in order.
 * @returns A fresh array whose length is the sum of the part lengths.
 */
export function concatBytes(...parts: readonly Uint8Array[]): Bytes {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Copies any `Uint8Array` view into a `Bytes` value with its own `ArrayBuffer`.
 *
 * @param view - Source bytes (may be a view on a shared or larger buffer).
 * @returns An independent copy.
 */
export function copyBytes(view: Uint8Array): Bytes {
  const out = new Uint8Array(view.length);
  out.set(view);
  return out;
}

/**
 * Encodes text as UTF-8.
 *
 * @param text - Any string.
 * @returns UTF-8 bytes.
 */
export function utf8(text: string): Bytes {
  return copyBytes(new TextEncoder().encode(text));
}

/**
 * Decodes UTF-8 bytes, rejecting invalid sequences.
 *
 * @param bytes - UTF-8 encoded text.
 * @returns The decoded string.
 * @throws TypeError when the input is not valid UTF-8.
 */
export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/**
 * Encodes bytes as base64url without padding (RFC 4648 §5).
 *
 * @param bytes - Bytes to encode.
 * @returns The base64url string.
 */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  let index = 0;
  for (; index + 2 < bytes.length; index += 3) {
    const n = ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    out +=
      BASE64URL_ALPHABET.charAt((n >> 18) & 63) +
      BASE64URL_ALPHABET.charAt((n >> 12) & 63) +
      BASE64URL_ALPHABET.charAt((n >> 6) & 63) +
      BASE64URL_ALPHABET.charAt(n & 63);
  }
  const rest = bytes.length - index;
  if (rest === 1) {
    const n = (bytes[index] ?? 0) << 16;
    out += BASE64URL_ALPHABET.charAt((n >> 18) & 63) + BASE64URL_ALPHABET.charAt((n >> 12) & 63);
  } else if (rest === 2) {
    const n = ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8);
    out +=
      BASE64URL_ALPHABET.charAt((n >> 18) & 63) +
      BASE64URL_ALPHABET.charAt((n >> 12) & 63) +
      BASE64URL_ALPHABET.charAt((n >> 6) & 63);
  }
  return out;
}

/**
 * Decodes base64url without padding.
 *
 * @param text - Base64url text; padding characters are rejected.
 * @returns The decoded bytes.
 * @throws TypeError when the text contains characters outside the alphabet or has an impossible length.
 */
export function fromBase64Url(text: string): Bytes {
  if (text.length % 4 === 1) {
    throw new TypeError('Invalid base64url length');
  }
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (const char of text) {
    const value = BASE64URL_LOOKUP.get(char);
    if (value === undefined) {
      throw new TypeError('Invalid base64url character');
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[offset] = (buffer >> bits) & 0xff;
      offset += 1;
    }
  }
  return out;
}

/**
 * Encodes bytes as lowercase hexadecimal.
 *
 * @param bytes - Bytes to encode.
 * @returns Hex string of length `2 * bytes.length`.
 */
export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Decodes hexadecimal text.
 *
 * @param text - Even-length hex string, upper or lower case.
 * @returns The decoded bytes.
 * @throws TypeError when the text is not valid hex.
 */
export function fromHex(text: string): Bytes {
  if (text.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(text)) {
    throw new TypeError('Invalid hex string');
  }
  const out = new Uint8Array(text.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(text.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

/**
 * Returns cryptographically secure random bytes from `crypto.getRandomValues`.
 *
 * @param length - Number of bytes, at least 0.
 * @returns Fresh random bytes.
 */
export function randomBytes(length: number): Bytes {
  const out = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += MAX_RANDOM_CHUNK) {
    crypto.getRandomValues(out.subarray(offset, Math.min(length, offset + MAX_RANDOM_CHUNK)));
  }
  return out;
}

/**
 * Compares two byte arrays in time that depends only on their lengths.
 *
 * @param a - First array.
 * @param b - Second array.
 * @returns `true` when both arrays have the same length and content.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}

/**
 * Encodes an unsigned integer as big-endian bytes.
 *
 * @param value - Integer in `[0, 2^(8*length))`.
 * @param length - Output length in bytes (1 to 6).
 * @returns Big-endian encoding.
 * @throws RangeError when the value does not fit.
 */
export function uintBE(value: number, length: number): Bytes {
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** (8 * length)) {
    throw new RangeError(`Value ${value} does not fit in ${length} bytes`);
  }
  const out = new Uint8Array(length);
  let rest = value;
  for (let index = length - 1; index >= 0; index -= 1) {
    out[index] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  return out;
}

/**
 * Reads a big-endian unsigned integer.
 *
 * @param bytes - Source array.
 * @param offset - Start index.
 * @param length - Number of bytes (1 to 6).
 * @returns The decoded integer.
 */
export function readUintBE(bytes: Uint8Array, offset: number, length: number): number {
  let value = 0;
  for (let index = 0; index < length; index += 1) {
    value = value * 256 + (bytes[offset + index] ?? 0);
  }
  return value;
}

/**
 * Computes SHA-256.
 *
 * @param data - Input bytes.
 * @returns 32-byte digest.
 */
export async function sha256(data: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}
