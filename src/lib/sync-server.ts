/**
 * Store sync self-host (solo Node / Route Handler).
 * Persiste envelope JSON opachi su filesystem — zero plaintext, zero DB.
 *
 * Directory: `DOMUSAFE_SYNC_DIR` oppure `./data/sync` (montare volume in Docker).
 * PREMIUM: ogni overwrite archivia la revisione precedente in `history/<syncId>/`.
 */

import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { SyncEnvelope } from '@/lib/crypto-sync';

const SYNC_ID_RE = /^[a-f0-9]{64}$/u;

/** Quante revisioni storiche tenere per syncId (Premium backup storico). */
export const SYNC_HISTORY_MAX = 20;

export interface SyncHistoryEntry {
  revision: number;
  updatedAt: string;
}

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

function historyDir(syncId: string): string {
  return path.join(getSyncDataDir(), 'history', syncId);
}

function historyRevisionPath(syncId: string, revision: number): string {
  return path.join(historyDir(syncId), `${revision}.json`);
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
 * Archivia l'envelope corrente prima di un overwrite (versioning storico Premium).
 * Cap a SYNC_HISTORY_MAX revisioni per stanza.
 */
async function archiveEnvelopeRevision(
  syncId: string,
  envelope: SyncEnvelope
): Promise<void> {
  if (
    typeof envelope.revision !== 'number' ||
    !Number.isFinite(envelope.revision)
  ) {
    return;
  }
  const dir = historyDir(syncId);
  await mkdir(dir, { recursive: true });
  const target = historyRevisionPath(syncId, envelope.revision);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(envelope, null, 0), 'utf8');
  await rename(tmp, target);

  const files = await readdir(dir);
  const revisions = files
    .map((name) => {
      const m = /^(\d+)\.json$/u.exec(name);
      return m ? Number(m[1]) : NaN;
    })
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);

  for (const oldRev of revisions.slice(SYNC_HISTORY_MAX)) {
    await unlink(historyRevisionPath(syncId, oldRev)).catch(() => undefined);
  }
}

/**
 * Elenco revisioni storiche (più recenti prima). Solo metadati — ciphertext
 * resta nel file per-revision scaricabile a parte.
 */
export async function listEnvelopeHistory(
  syncId: string
): Promise<SyncHistoryEntry[]> {
  if (!isValidSyncId(syncId)) {
    return [];
  }
  const dir = historyDir(syncId);
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: string }).code
        : undefined;
    if (code === 'ENOENT') return [];
    throw error;
  }

  const entries: SyncHistoryEntry[] = [];
  for (const name of files) {
    const m = /^(\d+)\.json$/u.exec(name);
    if (!m) continue;
    const revision = Number(m[1]);
    try {
      const raw = await readFile(path.join(dir, name), 'utf8');
      const parsed = JSON.parse(raw) as SyncEnvelope;
      if (parsed?.format !== 'domusync-1') continue;
      entries.push({
        revision,
        updatedAt:
          typeof parsed.updatedAt === 'string'
            ? parsed.updatedAt
            : new Date(0).toISOString(),
      });
    } catch {
      // skip corrupt history files
    }
  }
  entries.sort((a, b) => b.revision - a.revision);
  return entries;
}

/** Legge una revisione storica archiviata (non la current). */
export async function readEnvelopeRevision(
  syncId: string,
  revision: number
): Promise<SyncEnvelope | null> {
  if (!isValidSyncId(syncId) || !Number.isFinite(revision) || revision < 1) {
    return null;
  }
  try {
    const raw = await readFile(historyRevisionPath(syncId, revision), 'utf8');
    const parsed = JSON.parse(raw) as SyncEnvelope;
    if (parsed?.format !== 'domusync-1') return null;
    return parsed;
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: string }).code
        : undefined;
    if (code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Scrive envelope cifrato. Rifiuta se `!force` e revisione server > client.
 * Prima di sovrascrivere, archivia la revisione corrente (backup storico Premium).
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

  if (current && current.revision !== envelope.revision) {
    await archiveEnvelopeRevision(syncId, current);
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
