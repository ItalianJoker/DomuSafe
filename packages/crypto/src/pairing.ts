import { fromBase64Url, toBase64Url, type Bytes } from './bytes.js';
import { CryptoFormatError } from './errors.js';
import { HKDF_LABELS } from './labels.js';
import { P256_PUBLIC_KEY_LENGTH, hkdf, hkdfInfo } from './primitives.js';
import { bytesToWords } from './words.js';

/** Length of the pairing secret carried in the QR code. */
export const PAIRING_SECRET_LENGTH = 16;
/** Number of verification words both devices display. */
export const PAIRING_WORD_COUNT = 4;

const QR_PREFIX = 'domusafe-pair:1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Content of the pairing QR shown by the already-paired device. */
export interface PairingQr {
  readonly channelId: string;
  readonly publicKey: Bytes;
  readonly secret: Bytes;
}

/** Material both devices derive from the ECDH secret. */
export interface PairingMaterial {
  readonly verificationWords: readonly string[];
  readonly transferKey: Bytes;
}

/**
 * Serialises the pairing QR: `domusafe-pair:1:<channelId>:<public key>:<secret>` (base64url).
 *
 * @param qr - Channel id, ephemeral public key of the existing device and 16-byte pairing secret.
 * @returns QR payload text.
 */
export function encodePairingQr(qr: PairingQr): string {
  return `${QR_PREFIX}:${qr.channelId}:${toBase64Url(qr.publicKey)}:${toBase64Url(qr.secret)}`;
}

/**
 * Parses a pairing QR payload.
 *
 * @param text - Scanned text.
 * @returns The decoded QR content.
 * @throws CryptoFormatError when the payload is not a version-1 pairing QR.
 */
export function decodePairingQr(text: string): PairingQr {
  const parts = text.split(':');
  if (parts.length !== 5 || `${parts[0] ?? ''}:${parts[1] ?? ''}` !== QR_PREFIX) {
    throw new CryptoFormatError('Not a DomuSafe pairing code');
  }
  const channelId = parts[2] ?? '';
  const publicKey = fromBase64Url(parts[3] ?? '');
  const secret = fromBase64Url(parts[4] ?? '');
  if (!UUID.test(channelId) || publicKey.length !== P256_PUBLIC_KEY_LENGTH || secret.length !== PAIRING_SECRET_LENGTH) {
    throw new CryptoFormatError('Malformed pairing code');
  }
  return { channelId, publicKey, secret };
}

/**
 * Derives the verification words and the transfer key on either device.
 * Both devices must pass the public keys in the same order: existing device first.
 *
 * @param input - ECDH shared secret, pairing secret from the QR, and both public keys.
 * @returns Four Italian words (44 bits) and the 32-byte key that encrypts the account key in transit.
 */
export async function derivePairingMaterial(input: {
  readonly sharedSecret: Bytes;
  readonly pairingSecret: Bytes;
  readonly existingDevicePublicKey: Bytes;
  readonly newDevicePublicKey: Bytes;
}): Promise<PairingMaterial> {
  const keys = [input.existingDevicePublicKey, input.newDevicePublicKey] as const;
  const [sas, transferKey] = await Promise.all([
    hkdf(input.sharedSecret, hkdfInfo(HKDF_LABELS.pairingSas, ...keys), { salt: input.pairingSecret, length: 6 }),
    hkdf(input.sharedSecret, hkdfInfo(HKDF_LABELS.pairingTransferKey, ...keys), { salt: input.pairingSecret }),
  ]);
  return { verificationWords: bytesToWords(sas, PAIRING_WORD_COUNT), transferKey };
}
