/**
 * Chiave Famiglia condivisa (AES-GCM) — case/successione cifrate con la stessa key.
 * Ogni membro ha un wrap della family-key con la propria account data-key.
 * Gli inviti trasportano un seal della family-key derivato dal token (E2EE, server opaco).
 */
import { base64ToBytes, bytesToBase64 } from '@/lib/crypto-bytes';
import {
  decryptJsonAtRest,
  encryptJsonAtRest,
  generateDataKey,
  importDataKey,
} from '@/lib/crypto-auth';

const INVITE_PBKDF2_ITERATIONS = 100_000;

export type SealedKeyBlob = {
  ivBase64: string;
  ciphertextBase64: string;
};

export const FAMILY_KEY_ERROR_MESSAGE =
  'Impossibile sbloccare la chiave Famiglia';

/** Genera una nuova family-key (raw esportabile per wrap/invite). */
export async function createFamilyKey(): Promise<{
  key: CryptoKey;
  raw: Uint8Array;
}> {
  return generateDataKey();
}

export async function importFamilyKey(raw: Uint8Array): Promise<CryptoKey> {
  return importDataKey(raw);
}

/** Avvolge la family-key con la data-key account (persistenza su Famiglia). */
export async function wrapFamilyKeyForMember(
  familyKeyRaw: Uint8Array,
  accountDataKey: CryptoKey
): Promise<SealedKeyBlob> {
  return encryptJsonAtRest(
    { keyBase64: bytesToBase64(familyKeyRaw) },
    accountDataKey
  );
}

export async function unwrapFamilyKeyForMember(
  sealed: SealedKeyBlob,
  accountDataKey: CryptoKey
): Promise<Uint8Array> {
  try {
    const parsed = await decryptJsonAtRest<{ keyBase64: string }>(
      sealed,
      accountDataKey
    );
    return base64ToBytes(parsed.keyBase64);
  } catch {
    throw new Error(FAMILY_KEY_ERROR_MESSAGE);
  }
}

/**
 * Deriva una wrapping-key dall'invite token (solo client).
 * Salt legato al familyId così il token non è riusabile cross-famiglia.
 */
async function deriveInviteWrappingKey(
  inviteToken: string,
  familyId: string
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(inviteToken),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  const salt = enc.encode(`domusafe-invite-v1:${familyId}`);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: INVITE_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Suggella la family-key per il QR/link invito (opaca al server). */
export async function sealFamilyKeyForInvite(
  familyKeyRaw: Uint8Array,
  inviteToken: string,
  familyId: string
): Promise<SealedKeyBlob> {
  const wrapping = await deriveInviteWrappingKey(inviteToken, familyId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrapping,
    new Uint8Array(familyKeyRaw)
  );
  return {
    ivBase64: bytesToBase64(iv),
    ciphertextBase64: bytesToBase64(new Uint8Array(cipher)),
  };
}

/** Apre la family-key dal seal presente sull'invito. */
export async function openFamilyKeyFromInvite(
  sealed: SealedKeyBlob,
  inviteToken: string,
  familyId: string
): Promise<Uint8Array> {
  try {
    const wrapping = await deriveInviteWrappingKey(inviteToken, familyId);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(base64ToBytes(sealed.ivBase64)) },
      wrapping,
      new Uint8Array(base64ToBytes(sealed.ciphertextBase64))
    );
    return new Uint8Array(plain);
  } catch {
    throw new Error(FAMILY_KEY_ERROR_MESSAGE);
  }
}
