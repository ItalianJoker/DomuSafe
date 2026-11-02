import type { EncryptedVaultPayload } from '@/types/domus';

/**
 * 100.000 iterazioni standard raccomandate da OWASP per PBKDF2 con SHA-256.
 * Rallenta attacchi di forza bruta mantenendo la decifratura sul telefono sotto i 60ms.
 */
const PBKDF2_ITERATIONS = 100_000;

/** Messaggio italiano mostrato all'utente quando PIN o ciphertext non sono validi. */
export const VAULT_PIN_ERROR_MESSAGE = 'PIN errato o dati non validi';

export interface EncryptedVaultBlob {
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
}

/** Converte Uint8Array → Base64 senza dipendenze Node (browser + edge). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** Converte Base64 → Uint8Array. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Deriva una CryptoKey AES-GCM a 256-bit partendo dal PIN/Passphrase
 * dell'utente e da un salt casuale a 16 byte.
 */
export async function deriveKey(
  pin: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Copy into a fresh ArrayBuffer — SubtleCrypto rejects SharedArrayBuffer views.
  const saltBuffer = new Uint8Array(salt).buffer;

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Cifra il payload della cassaforte patrimoniale (Livello 3).
 * IV a 12 byte (96-bit): dimensione raccomandata NIST per AES-GCM;
 * 16 byte aumenterebbero solo lo spazio senza guadagno di sicurezza.
 */
export async function encryptVault(
  payload: EncryptedVaultPayload,
  pin: string
): Promise<EncryptedVaultBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(payload));

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  return {
    saltBase64: bytesToBase64(salt),
    ivBase64: bytesToBase64(iv),
    ciphertextBase64: bytesToBase64(new Uint8Array(cipherBuffer)),
  };
}

/**
 * Decifra il payload della cassaforte verificando l'integrità tramite tag GCM.
 * In caso di PIN errato o dati manomessi restituisce un Error con messaggio
 * italiano amichevole — non lascia propagare OperationError del browser.
 */
export async function decryptVault(
  encryptedData: EncryptedVaultBlob,
  pin: string
): Promise<EncryptedVaultPayload> {
  try {
    const salt = base64ToBytes(encryptedData.saltBase64);
    const iv = base64ToBytes(encryptedData.ivBase64);
    const ciphertext = base64ToBytes(encryptedData.ciphertextBase64);

    const key = await deriveKey(pin, salt);
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      new Uint8Array(ciphertext)
    );

    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decryptedBuffer)) as EncryptedVaultPayload;
  } catch {
    throw new Error(VAULT_PIN_ERROR_MESSAGE);
  }
}

/** True se l'errore è il fallimento PIN/integrità gestito da decryptVault. */
export function isVaultPinError(error: unknown): boolean {
  return error instanceof Error && error.message === VAULT_PIN_ERROR_MESSAGE;
}
