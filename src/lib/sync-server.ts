/**
 * Store sync self-host (solo Node / Route Handler).
 * Persiste envelope JSON opachi su filesystem — zero plaintext, zero DB.
 *
 * Directory: `DOMUSAFE_SYNC_DIR` oppure `./data/sync` (montare volume in Docker).
 */

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { SyncEnvelope } from '@/lib/crypto-sync';

const SYNC_ID_RE = /^[a-f0-9]{64}$/u;

export function getSyncDataDir(): string {
  const fromEnv = process.env.DOMUSAFE_SYNC_DIR?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return path.resolve(process.cwd(), 'data', 'sync');
}

export function isValidSyncId(syncId: string): boolean {
  return SYNC_ID_RE.test(syncId);
}

function envelopePath(syncId: string): string {
  return path.join(getSyncDataDir(), `${syncId}.json`);
}

export async function ensureSyncDir(): Promise<void> {
  await mkdir(getSyncDataDir(), { recursive: true });
}

export async function readEnvelope(
  syncId: string
): Promise<SyncEnvelope | null> {
  if (!isValidSyncId(syncId)) {
    return null;
  }
  try {
    const raw = await readFile(envelopePath(syncId), 'utf8');
    const parsed = JSON.parse(raw) as SyncEnvelope;
    if (parsed?.format !== 'domusync-1') {
      return null;
    }
    return parsed;
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: string }).code
        : undefined;
    if (code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Scrive envelope cifrato. Rifiuta se `!force` e revisione server > client
 * (hook versioning economico; history completa = step PREMIUM).
 */
export async function writeEnvelope(
  syncId: string,
  envelope: SyncEnvelope,
  force = false
): Promise<{ ok: true; envelope: SyncEnvelope } | { ok: false; status: 409; current: SyncEnvelope }> {
  if (!isValidSyncId(syncId)) {
    throw new Error('INVALID_SYNC_ID');
  }
  if (envelope.format !== 'domusync-1') {
    throw new Error('INVALID_FORMAT');
  }
  if (
    typeof envelope.revision !== 'number' ||
    !Number.isFinite(envelope.revision) ||
    envelope.revision < 1
  ) {
    throw new Error('INVALID_REVISION');
  }

  await ensureSyncDir();
  const current = await readEnvelope(syncId);
  if (current && !force && current.revision > envelope.revision) {
    return { ok: false, status: 409, current };
  }

  const target = envelopePath(syncId);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  const body = JSON.stringify(envelope, null, 0);
  await writeFile(tmp, body, 'utf8');
  await rename(tmp, target);
  return { ok: true, envelope };
}

/**
 * Invariante runtime: il blob persistito non deve contenere indizi di plaintext
 * tipici (houseName in chiaro nelle chiavi note). Usato dagli smoke, non in prod path.
 */
export function envelopeLooksEncrypted(envelope: SyncEnvelope): boolean {
  if (!envelope.ciphertextBase64 || !envelope.ivBase64) {
    return false;
  }
  const lower = envelope.ciphertextBase64.toLowerCase();
  // Ciphertext Base64 non deve decodificare a JSON con level1_public in chiaro.
  // Controllo euristico: assenza di sottostringhe ASCII tipiche del documento.
  if (
    lower.includes('level1') ||
    envelope.ciphertextBase64.includes('houseName')
  ) {
    return false;
  }
  return true;
}
