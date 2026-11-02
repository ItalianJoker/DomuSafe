/**
 * Sync cloud E2EE (Premium / trial): cifra la collezione case *prima* di qualsiasi rete.
 * Family-scoped: envelope porta `familyId` (metadato); chiave mai sul wire HTTP.
 *
 * Invarianti di sicurezza:
 * - Il server riceve solo salt/iv/ciphertext + metadati di revisione/Famiglia.
 * - La chiave grezza (32 byte) non lascia mai il client verso `/api/sync`.
 * - IV AES-GCM a 12 byte (96-bit NIST); salt PBKDF2 a 16 byte solo in modalità PIN.
 * - PIN/chiave errati → errore italiano, mai OperationError grezzo del browser.
 * - Sessione sync: cifrata con data-key account, persistita su account→Famiglia (no IndexedDB SoT).
 */

import type { DomusHouseCollection } from '@/lib/storage';
import {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64,
  bytesToBase64Url,
} from '@/lib/crypto-bytes';

/** Iterazioni PBKDF2 allineate al vault (OWASP SHA-256). */
const PBKDF2_ITERATIONS = 100_000;

/** Messaggio UX per chiave/PIN sync errati o blob manomesso. */
export const SYNC_CREDENTIALS_ERROR_MESSAGE =
  'Chiave sync errata o dati non validi';

/** Prefisso deep-link / hash QR multi-dispositivo (compatto per limiti QR). */
export const SYNC_PAIRING_PREFIX = 'ds1';

/** Envelope opaco persistito dal server (nessun plaintext). */
export interface SyncEnvelope {
  format: 'domusync-1';
  /** Revisione monotona client-side: conflitto se server > client. */
  revision: number;
  updatedAt: string;
  ivBase64: string;
  ciphertextBase64: string;
  /**
   * Presente solo se la chiave è derivata da PIN (bootstrap senza QR).
   * Assente quando la chiave grezza arriva dal QR di pairing.
   */
  saltBase64?: string;
  /** Famiglia owner della stanza (metadato non segreto; scoping server). */
  familyId?: string;
}

/**
 * Sessione sync per account (cifrata a riposo sull’account Famiglia).
 * Contiene syncId + chiave grezza — mai inviata in chiaro al server.
 */
export interface SyncSession {
  syncId: string;
  /** Chiave AES-256 grezza in Base64 (solo ciphertext sull’account). */
  keyBase64: string;
  revision: number;
  updatedAt: string;
  familyId?: string;
}

export interface EncryptSyncResult {
  envelope: SyncEnvelope;
  /** Chiave usata (grezza o derivata); da salvare in sessione account. */
  keyBytes: Uint8Array;
}

/**
 * Deriva AES-GCM 256-bit da PIN sync + salt (stesso schema del vault Livello 3).
 * Usato per ripristino multi-device *senza* QR, digitando il PIN.
 */
export async function deriveSyncKey(
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
    true,
    ['encrypt', 'decrypt']
  );
}

/** Importa una chiave grezza a 32 byte come CryptoKey AES-GCM non-estraibile. */
async function importRawSyncKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(keyBytes),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Genera syncId (32 byte hex = 256-bit capability URL) e chiave AES grezza.
 * Il syncId è il “segreto di indirizzo”: chi non lo conosce non trova il blob.
 */
export function createSyncIdentity(): {
  syncId: string;
  keyBytes: Uint8Array;
} {
  const idBytes = crypto.getRandomValues(new Uint8Array(32));
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const syncId = Array.from(idBytes, (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
  return { syncId, keyBytes };
}

/**
 * Cifra la collezione case con chiave grezza (bootstrap QR) o PIN (salt nuovo).
 * `revision` deve essere ≥ revisione precedente del device mittente.
 * `familyId` è metadato di scoping Famiglia (non segreto).
 */
export async function encryptHouseCollection(
  collection: DomusHouseCollection,
  options: {
    revision: number;
    familyId: string;
    keyBytes?: Uint8Array;
    pin?: string;
  }
): Promise<EncryptSyncResult> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(collection));
  const updatedAt = new Date().toISOString();

  let key: CryptoKey;
  let keyBytes: Uint8Array;
  let saltBase64: string | undefined;

  if (options.keyBytes) {
    keyBytes = options.keyBytes;
    key = await importRawSyncKey(keyBytes);
  } else if (options.pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    saltBase64 = bytesToBase64(salt);
    const derived = await deriveSyncKey(options.pin, salt);
    const raw = await crypto.subtle.exportKey('raw', derived);
    keyBytes = new Uint8Array(raw);
    key = await importRawSyncKey(keyBytes);
  } else {
    throw new Error('Serve keyBytes o pin per cifrare la sync');
  }

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  return {
    keyBytes,
    envelope: {
      format: 'domusync-1',
      revision: options.revision,
      updatedAt,
      ivBase64: bytesToBase64(iv),
      ciphertextBase64: bytesToBase64(new Uint8Array(cipherBuffer)),
      saltBase64,
      familyId: options.familyId,
    },
  };
}

/**
 * Decifra un envelope sync. Priorità chiave: keyBytes grezzi, altrimenti PIN+salt.
 * Fallimenti → SYNC_CREDENTIALS_ERROR_MESSAGE (stesso pattern del vault).
 */
export async function decryptHouseCollection(
  envelope: SyncEnvelope,
  options: { keyBytes?: Uint8Array; pin?: string }
): Promise<DomusHouseCollection> {
  try {
    if (envelope.format !== 'domusync-1') {
      throw new Error('format');
    }
    const iv = base64ToBytes(envelope.ivBase64);
    const ciphertext = base64ToBytes(envelope.ciphertextBase64);

    let key: CryptoKey;
    if (options.keyBytes) {
      key = await importRawSyncKey(options.keyBytes);
    } else if (options.pin && envelope.saltBase64) {
      const salt = base64ToBytes(envelope.saltBase64);
      const derived = await deriveSyncKey(options.pin, salt);
      const raw = await crypto.subtle.exportKey('raw', derived);
      key = await importRawSyncKey(new Uint8Array(raw));
    } else {
      throw new Error('credentials');
    }

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      new Uint8Array(ciphertext)
    );
    const parsed = JSON.parse(
      new TextDecoder().decode(decrypted)
    ) as DomusHouseCollection;
    if (
      !parsed ||
      parsed.version !== '1.0.0' ||
      !Array.isArray(parsed.houses)
    ) {
      throw new Error('payload');
    }
    return parsed;
  } catch {
    throw new Error(SYNC_CREDENTIALS_ERROR_MESSAGE);
  }
}

export function isSyncCredentialsError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === SYNC_CREDENTIALS_ERROR_MESSAGE
  );
}

/**
 * Codifica il payload di pairing QR/deep-link.
 * Formato compatto: `ds1.<syncId>.<keyBase64url>` — resta sotto i limiti tipici QR.
 * La chiave viaggia *nel canale QR locale*, non nella richiesta HTTP di sync.
 */
export function encodePairingPayload(
  syncId: string,
  keyBytes: Uint8Array
): string {
  return `${SYNC_PAIRING_PREFIX}.${syncId}.${bytesToBase64Url(keyBytes)}`;
}

/**
 * Costruisce URL di pairing sulla stessa origin (hash, non query):
 * così il frammento non finisce nei log del server HTTP.
 */
export function buildPairingUrl(
  origin: string,
  syncId: string,
  keyBytes: Uint8Array
): string {
  const base = origin.replace(/\/$/u, '');
  return `${base}/#${encodePairingPayload(syncId, keyBytes)}`;
}

/**
 * Estrae syncId + chiave da hash/URL/payload grezzo.
 * Accetta `#ds1.…`, URL completi o stringa `ds1.…`.
 */
export function parsePairingPayload(raw: string): {
  syncId: string;
  keyBytes: Uint8Array;
} | null {
  const trimmed = raw.trim();
  let token = trimmed;
  try {
    if (trimmed.includes('://') || trimmed.startsWith('/')) {
      const url = new URL(
        trimmed,
        typeof window !== 'undefined'
          ? window.location.origin
          : 'http://localhost'
      );
      token = url.hash.replace(/^#/u, '') || url.searchParams.get('sync') || '';
    } else if (trimmed.startsWith('#')) {
      token = trimmed.slice(1);
    }
  } catch {
    token = trimmed.replace(/^#/u, '');
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== SYNC_PAIRING_PREFIX) {
    return null;
  }
  const syncId = parts[1]!;
  const keyPart = parts[2]!;
  if (!/^[a-f0-9]{64}$/iu.test(syncId)) {
    return null;
  }
  try {
    const keyBytes = base64UrlToBytes(keyPart);
    if (keyBytes.length !== 32) {
      return null;
    }
    return { syncId: syncId.toLowerCase(), keyBytes };
  } catch {
    return null;
  }
}

export function sessionFromIdentity(
  syncId: string,
  keyBytes: Uint8Array,
  revision: number,
  updatedAt: string,
  familyId?: string
): SyncSession {
  return {
    syncId,
    keyBase64: bytesToBase64(keyBytes),
    revision,
    updatedAt,
    familyId,
  };
}

export function keyBytesFromSession(session: SyncSession): Uint8Array {
  return base64ToBytes(session.keyBase64);
}

/**
 * Ricostruisce i 32 byte chiave da sessione QR oppure da PIN+salt envelope.
 * Usato dopo un download riuscito per persistere la sessione sull’account.
 */
export async function resolveSyncKeyBytes(
  envelope: SyncEnvelope,
  options: { keyBytes?: Uint8Array; pin?: string }
): Promise<Uint8Array> {
  if (options.keyBytes && options.keyBytes.length === 32) {
    return options.keyBytes;
  }
  if (options.pin && envelope.saltBase64) {
    const salt = base64ToBytes(envelope.saltBase64);
    const derived = await deriveSyncKey(options.pin, salt);
    return new Uint8Array(await crypto.subtle.exportKey('raw', derived));
  }
  throw new Error(SYNC_CREDENTIALS_ERROR_MESSAGE);
}
