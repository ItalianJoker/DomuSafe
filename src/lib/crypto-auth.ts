/**
 * Crittografia client: PBKDF2 + AES-GCM per wrapping data-key e payload account.
 * Stessi invarianti del vault (100k iter, IV 12 byte). Zero dipendenze esterne.
 */
import { base64ToBytes, bytesToBase64 } from '@/lib/crypto-bytes';

const PBKDF2_ITERATIONS = 100_000;

export const DATA_KEY_ERROR_MESSAGE =
  'Impossibile sbloccare i dati cifrati';

async function importPasswordMaterial(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
}

/** Chiave AES-GCM derivata dalla password (wrap/unwrap data-key). */
export async function deriveWrappingKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const material = await importPasswordMaterial(password);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt).buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Genera una data-key AES-GCM esportabile (cifra runbook / checklist a riposo). */
export async function generateDataKey(): Promise<{
  key: CryptoKey;
  raw: Uint8Array;
}> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  return { key, raw };
}

export async function importDataKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(raw).buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function wrapDataKey(
  rawDataKey: Uint8Array,
  wrappingKey: CryptoKey
): Promise<{ wrappedBase64: string; ivBase64: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    new Uint8Array(rawDataKey)
  );
  return {
    wrappedBase64: bytesToBase64(new Uint8Array(cipher)),
    ivBase64: bytesToBase64(iv),
  };
}

export async function unwrapDataKey(
  wrappedBase64: string,
  ivBase64: string,
  wrappingKey: CryptoKey
): Promise<Uint8Array> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(base64ToBytes(ivBase64)) },
      wrappingKey,
      new Uint8Array(base64ToBytes(wrappedBase64))
    );
    return new Uint8Array(plain);
  } catch {
    throw new Error(DATA_KEY_ERROR_MESSAGE);
  }
}

/**
 * Cifra JSON con data-key (baseline at-rest prima dell'upload account).
 */
export async function encryptJsonAtRest<T>(
  value: T,
  dataKey: CryptoKey
): Promise<{ ivBase64: string; ciphertextBase64: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    dataKey,
    plaintext
  );
  return {
    ivBase64: bytesToBase64(iv),
    ciphertextBase64: bytesToBase64(new Uint8Array(cipher)),
  };
}

export async function decryptJsonAtRest<T>(
  blob: { ivBase64: string; ciphertextBase64: string },
  dataKey: CryptoKey
): Promise<T> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(base64ToBytes(blob.ivBase64)) },
      dataKey,
      new Uint8Array(base64ToBytes(blob.ciphertextBase64))
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    throw new Error(DATA_KEY_ERROR_MESSAGE);
  }
}

/** Prepara material wrapping per registrazione (salt + wrap data-key). */
export async function prepareRegistrationCrypto(password: string): Promise<{
  dataKey: CryptoKey;
  dataKeySaltBase64: string;
  wrappedDataKeyBase64: string;
  wrappedDataKeyIvBase64: string;
}> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrappingKey = await deriveWrappingKey(password, salt);
  const { key, raw } = await generateDataKey();
  const wrapped = await wrapDataKey(raw, wrappingKey);
  return {
    dataKey: key,
    dataKeySaltBase64: bytesToBase64(salt),
    wrappedDataKeyBase64: wrapped.wrappedBase64,
    wrappedDataKeyIvBase64: wrapped.ivBase64,
  };
}

/** Dopo login: sblocca data-key in memoria da material account. */
export async function unlockDataKeyFromAccount(
  password: string,
  material: {
    dataKeySaltBase64: string;
    wrappedDataKeyBase64: string;
    wrappedDataKeyIvBase64: string;
  }
): Promise<CryptoKey> {
  const salt = base64ToBytes(material.dataKeySaltBase64);
  const wrappingKey = await deriveWrappingKey(password, salt);
  const raw = await unwrapDataKey(
    material.wrappedDataKeyBase64,
    material.wrappedDataKeyIvBase64,
    wrappingKey
  );
  return importDataKey(raw);
}
