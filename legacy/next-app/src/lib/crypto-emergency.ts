/**
 * Pacchetto break-glass L1+L2: AES-GCM con chiave casuale nel fragment URL.
 * Il server conserva solo ciphertext; la chiave non lascia il device/QR.
 */
import { base64ToBytes, bytesToBase64 } from '@/lib/crypto-bytes';
import type { EmergencyBreakGlassPack } from '@/types/domus';

export const EMERGENCY_PACK_ERROR_MESSAGE =
  'Pacchetto emergenza non valido o chiave errata';

export type SealedEmergencyBlob = {
  version: 'emg-1';
  ivBase64: string;
  ciphertextBase64: string;
};

function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return base64ToBytes(padded + pad);
}

/** Genera chiave AES-256 grezza per il QR break-glass. */
export function createEmergencyKeyRaw(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function encodeEmergencyKeyFragment(raw: Uint8Array): string {
  return toBase64Url(raw);
}

export function decodeEmergencyKeyFragment(fragmentKey: string): Uint8Array {
  return fromBase64Url(fragmentKey.trim());
}

async function importEmergencyKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(raw).buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Cifra il pacchetto L1+L2 con la chiave del QR. */
export async function sealEmergencyPack(
  pack: EmergencyBreakGlassPack,
  keyRaw: Uint8Array
): Promise<SealedEmergencyBlob> {
  const key = await importEmergencyKey(keyRaw);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(pack));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );
  return {
    version: 'emg-1',
    ivBase64: bytesToBase64(iv),
    ciphertextBase64: bytesToBase64(new Uint8Array(cipher)),
  };
}

/** Apre il pacchetto con la chiave dal fragment `#k=…`. */
export async function openEmergencyPack(
  blob: SealedEmergencyBlob,
  keyRaw: Uint8Array
): Promise<EmergencyBreakGlassPack> {
  try {
    const key = await importEmergencyKey(keyRaw);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(base64ToBytes(blob.ivBase64)) },
      key,
      new Uint8Array(base64ToBytes(blob.ciphertextBase64))
    );
    const parsed = JSON.parse(
      new TextDecoder().decode(plain)
    ) as EmergencyBreakGlassPack;
    if (parsed.version !== '1.0.0') {
      throw new Error(EMERGENCY_PACK_ERROR_MESSAGE);
    }
    return parsed;
  } catch {
    throw new Error(EMERGENCY_PACK_ERROR_MESSAGE);
  }
}

/** Costruisce URL pubblico `/e/{token}#k={key}`. */
export function buildEmergencyUrl(
  origin: string,
  token: string,
  keyRaw: Uint8Array
): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/e/${encodeURIComponent(token)}#k=${encodeEmergencyKeyFragment(keyRaw)}`;
}

export function parseEmergencyKeyFromHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const k = params.get('k');
  return k?.trim() || null;
}
