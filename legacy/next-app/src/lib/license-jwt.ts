/**
 * Licenza SaaS JWT firmata Ed25519 (EdDSA) — Feature Gate PRD §3/§6.
 * Zero dipendenze: solo `node:crypto`. Verifica server-side con
 * `DOMUSAFE_LICENSE_PUBLIC_KEY` (PEM SPKI o Base64 DER SPKI).
 *
 * Formato JWT compatto: header.payload.signature (Base64url).
 * Claim obbligatori: `tier`, `issuedTo`, `iat`. Opzionali: `exp`, `sub` (email).
 */

import {
  createPublicKey,
  createPrivateKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';
import type { LicenseTier } from '@/types/domus';

const VALID_TIERS: ReadonlySet<string> = new Set([
  'FREE',
  'BASIC',
  'ADVANCED',
  'PREMIUM',
]);

export const LICENSE_TOKEN_INVALID_MESSAGE =
  'Chiave di licenza non valida o non firmata correttamente';

export const LICENSE_TOKEN_EXPIRED_MESSAGE =
  'Chiave di licenza scaduta';

export const LICENSE_PUBLIC_KEY_MISSING_MESSAGE =
  'Questo server non accetta chiavi SaaS (manca DOMUSAFE_LICENSE_PUBLIC_KEY)';

export const LICENSE_EMAIL_MISMATCH_MESSAGE =
  'La chiave di licenza è intestata a un altro indirizzo email';

/** Claim JWT DomuSafe (payload). */
export interface DomuLicenseClaims {
  /** Piano concesso dalla chiave firmata. */
  tier: LicenseTier;
  /** Intestatario leggibile (es. ragione sociale / nome). */
  issuedTo: string;
  /** Issued-at Unix seconds (JWT standard). */
  iat: number;
  /** Expiry Unix seconds (opzionale). */
  exp?: number;
  /** Email account vincolata (opzionale; se presente deve coincidere). */
  sub?: string;
}

export interface VerifiedSaasLicense {
  claims: DomuLicenseClaims;
  token: string;
  expiresAt?: string;
}

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function parseB64urlJson<T>(part: string): T {
  const json = Buffer.from(part, 'base64url').toString('utf8');
  return JSON.parse(json) as T;
}

/**
 * Carica chiave pubblica Ed25519 da env.
 * Accetta PEM SPKI (`-----BEGIN PUBLIC KEY-----`) oppure Base64/Base64url del DER SPKI.
 */
export function loadLicensePublicKey(
  raw: string | undefined = process.env.DOMUSAFE_LICENSE_PUBLIC_KEY
): KeyObject | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.includes('BEGIN PUBLIC KEY')) {
      return createPublicKey(trimmed);
    }
    const der = Buffer.from(
      trimmed.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    );
    return createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    return null;
  }
}

/**
 * Carica chiave privata Ed25519 (solo tooling / smoke / issuer).
 * PEM PKCS8 oppure Base64 DER PKCS8.
 */
export function loadLicensePrivateKey(
  raw: string | undefined = process.env.DOMUSAFE_LICENSE_PRIVATE_KEY
): KeyObject | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.includes('BEGIN PRIVATE KEY')) {
      return createPrivateKey(trimmed);
    }
    const der = Buffer.from(
      trimmed.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    );
    return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  } catch {
    return null;
  }
}

/** Genera coppia Ed25519 (smoke / bootstrap issuer). */
export function generateLicenseKeyPair(): {
  publicKeyPem: string;
  privateKeyPem: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
  };
}

/**
 * Firma un JWT EdDSA. Usato da smoke e da chi emette chiavi SaaS.
 * Non espone la privata nell’app runtime — solo tooling.
 */
export function signLicenseToken(
  claims: DomuLicenseClaims,
  privateKey: KeyObject
): string {
  if (!VALID_TIERS.has(claims.tier)) {
    throw new Error('tier non valido');
  }
  const header = b64urlJson({ alg: 'EdDSA', typ: 'JWT' });
  const payload = b64urlJson(claims);
  const signingInput = `${header}.${payload}`;
  const signature = sign(null, Buffer.from(signingInput, 'utf8'), privateKey);
  return `${signingInput}.${signature.toString('base64url')}`;
}

/**
 * Verifica firma Ed25519 + claim minimi. Non controlla email account
 * (vedi `applySaasLicenseToken` per il match `sub`).
 */
export function verifyLicenseToken(
  token: string,
  publicKey: KeyObject,
  nowSec: number = Math.floor(Date.now() / 1000)
): DomuLicenseClaims {
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new Error(LICENSE_TOKEN_INVALID_MESSAGE);
  }
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  let header: { alg?: string; typ?: string };
  try {
    header = parseB64urlJson(headerB64);
  } catch {
    throw new Error(LICENSE_TOKEN_INVALID_MESSAGE);
  }
  if (header.alg !== 'EdDSA') {
    throw new Error(LICENSE_TOKEN_INVALID_MESSAGE);
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  let signature: Buffer;
  try {
    signature = Buffer.from(sigB64, 'base64url');
  } catch {
    throw new Error(LICENSE_TOKEN_INVALID_MESSAGE);
  }
  const ok = verify(
    null,
    Buffer.from(signingInput, 'utf8'),
    publicKey,
    signature
  );
  if (!ok) {
    throw new Error(LICENSE_TOKEN_INVALID_MESSAGE);
  }

  let claims: Partial<DomuLicenseClaims>;
  try {
    claims = parseB64urlJson(payloadB64);
  } catch {
    throw new Error(LICENSE_TOKEN_INVALID_MESSAGE);
  }

  if (
    !claims.tier ||
    !VALID_TIERS.has(claims.tier) ||
    typeof claims.issuedTo !== 'string' ||
    !claims.issuedTo.trim() ||
    typeof claims.iat !== 'number'
  ) {
    throw new Error(LICENSE_TOKEN_INVALID_MESSAGE);
  }

  if (typeof claims.exp === 'number' && claims.exp <= nowSec) {
    throw new Error(LICENSE_TOKEN_EXPIRED_MESSAGE);
  }

  return {
    tier: claims.tier,
    issuedTo: claims.issuedTo.trim(),
    iat: claims.iat,
    exp: typeof claims.exp === 'number' ? claims.exp : undefined,
    sub:
      typeof claims.sub === 'string' && claims.sub.trim()
        ? claims.sub.trim().toLowerCase()
        : undefined,
  };
}

/**
 * Applica una chiave SaaS all’account: verifica firma, scadenza, eventuale `sub`.
 * Richiede `DOMUSAFE_LICENSE_PUBLIC_KEY` sul server.
 */
export function applySaasLicenseToken(input: {
  token: string;
  accountEmail: string;
  publicKey?: KeyObject | null;
  nowMs?: number;
}): VerifiedSaasLicense {
  const nowMs = input.nowMs ?? Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const publicKey =
    input.publicKey === undefined
      ? loadLicensePublicKey()
      : input.publicKey;
  if (!publicKey) {
    throw new Error(LICENSE_PUBLIC_KEY_MISSING_MESSAGE);
  }

  const claims = verifyLicenseToken(input.token, publicKey, nowSec);
  if (claims.sub && claims.sub !== input.accountEmail.trim().toLowerCase()) {
    throw new Error(LICENSE_EMAIL_MISMATCH_MESSAGE);
  }

  return {
    claims,
    token: input.token.trim(),
    expiresAt:
      typeof claims.exp === 'number'
        ? new Date(claims.exp * 1000).toISOString()
        : undefined,
  };
}
