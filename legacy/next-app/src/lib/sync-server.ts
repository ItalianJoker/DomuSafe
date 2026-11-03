/**
 * Store sync SaaS (Postgres) — envelope JSON opachi E2EE.
 * Zero plaintext. Tabella `sync_envelopes` + `sync_history`.
 */

import { and, desc, eq, lt } from 'drizzle-orm';
import type { SyncEnvelope } from '@/lib/crypto-sync';
import { ensureDbSchema, getDb } from '@/db/client';
import { syncEnvelopes, syncHistory } from '@/db/schema';

const SYNC_ID_RE = /^[a-f0-9]{64}$/u;

/** Quante revisioni storiche tenere per syncId (Premium backup storico). */
export const SYNC_HISTORY_MAX = 20;

export interface SyncHistoryEntry {
  revision: number;
  updatedAt: string;
}

/** @deprecated filesystem — sync è su Postgres. */
export function getSyncDataDir(): string {
  return process.env.DATABASE_URL?.trim()
    ? 'postgres://(DATABASE_URL)/sync'
    : '(DATABASE_URL missing)';
}

export function isValidSyncId(syncId: string): boolean {
  return SYNC_ID_RE.test(syncId);
}

export async function ensureSyncDir(): Promise<void> {
  await ensureDbSchema();
}

export async function readEnvelope(
  syncId: string
): Promise<SyncEnvelope | null> {
  if (!isValidSyncId(syncId)) {
    return null;
  }
  await ensureDbSchema();
  const rows = await getDb()
    .select()
    .from(syncEnvelopes)
    .where(eq(syncEnvelopes.syncId, syncId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const parsed = row.envelope as SyncEnvelope;
  if (parsed?.format !== 'domusync-1') return null;
  return parsed;
}

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
  const updatedAt =
    typeof envelope.updatedAt === 'string'
      ? envelope.updatedAt
      : new Date().toISOString();
  await getDb()
    .insert(syncHistory)
    .values({
      syncId,
      revision: envelope.revision,
      envelope,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [syncHistory.syncId, syncHistory.revision],
      set: {
        envelope,
        updatedAt,
      },
    });

  const rows = await getDb()
    .select({ revision: syncHistory.revision })
    .from(syncHistory)
    .where(eq(syncHistory.syncId, syncId))
    .orderBy(desc(syncHistory.revision));

  const old = rows.slice(SYNC_HISTORY_MAX);
  for (const item of old) {
    await getDb()
      .delete(syncHistory)
      .where(
        and(
          eq(syncHistory.syncId, syncId),
          eq(syncHistory.revision, item.revision)
        )
      );
  }
  // Extra safety: delete anything older than the keep set
  if (rows.length > SYNC_HISTORY_MAX) {
    const cutoff = rows[SYNC_HISTORY_MAX - 1]?.revision;
    if (typeof cutoff === 'number') {
      await getDb()
        .delete(syncHistory)
        .where(
          and(eq(syncHistory.syncId, syncId), lt(syncHistory.revision, cutoff))
        );
    }
  }
}

export async function listEnvelopeHistory(
  syncId: string
): Promise<SyncHistoryEntry[]> {
  if (!isValidSyncId(syncId)) {
    return [];
  }
  await ensureDbSchema();
  const rows = await getDb()
    .select()
    .from(syncHistory)
    .where(eq(syncHistory.syncId, syncId))
    .orderBy(desc(syncHistory.revision));

  return rows
    .map((row) => {
      const parsed = row.envelope as SyncEnvelope;
      if (parsed?.format !== 'domusync-1') return null;
      return {
        revision: row.revision,
        updatedAt:
          typeof parsed.updatedAt === 'string'
            ? parsed.updatedAt
            : row.updatedAt,
      };
    })
    .filter((e): e is SyncHistoryEntry => e !== null);
}

export async function readEnvelopeRevision(
  syncId: string,
  revision: number
): Promise<SyncEnvelope | null> {
  if (!isValidSyncId(syncId) || !Number.isFinite(revision) || revision < 1) {
    return null;
  }
  await ensureDbSchema();
  const rows = await getDb()
    .select()
    .from(syncHistory)
    .where(
      and(eq(syncHistory.syncId, syncId), eq(syncHistory.revision, revision))
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const parsed = row.envelope as SyncEnvelope;
  if (parsed?.format !== 'domusync-1') return null;
  return parsed;
}

export async function writeEnvelope(
  syncId: string,
  envelope: SyncEnvelope,
  force = false
): Promise<
  | { ok: true; envelope: SyncEnvelope }
  | { ok: false; status: 409; current: SyncEnvelope }
> {
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

  await ensureDbSchema();
  const current = await readEnvelope(syncId);
  if (current && !force && current.revision > envelope.revision) {
    return { ok: false, status: 409, current };
  }

  if (current && current.revision !== envelope.revision) {
    await archiveEnvelopeRevision(syncId, current);
  }

  const updatedAt =
    typeof envelope.updatedAt === 'string'
      ? envelope.updatedAt
      : new Date().toISOString();

  await getDb()
    .insert(syncEnvelopes)
    .values({
      syncId,
      envelope,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: syncEnvelopes.syncId,
      set: {
        envelope,
        updatedAt,
      },
    });

  return { ok: true, envelope };
}

/**
 * Invariante: blob persistito non deve contenere plaintext tipici.
 */
export function envelopeLooksEncrypted(envelope: SyncEnvelope): boolean {
  if (!envelope.ciphertextBase64 || !envelope.ivBase64) {
    return false;
  }
  const lower = envelope.ciphertextBase64.toLowerCase();
  if (
    lower.includes('level1') ||
    envelope.ciphertextBase64.includes('houseName')
  ) {
    return false;
  }
  return true;
}
