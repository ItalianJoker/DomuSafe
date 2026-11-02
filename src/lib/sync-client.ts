/**
 * Client HTTP sync: upload/download *solo* di SyncEnvelope cifrati.
 * Nessuna serializzazione plaintext verso la rete — cifratura avviene in crypto-sync.
 */

import type { SyncEnvelope } from '@/lib/crypto-sync';

export class SyncHttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'SyncHttpError';
    this.status = status;
    this.code = code;
  }
}

function apiBase(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

/**
 * Scarica l'envelope cifrato. 404 → null (stanza vuota / id nuovo).
 */
export async function fetchSyncEnvelope(
  syncId: string,
  baseUrl = apiBase()
): Promise<SyncEnvelope | null> {
  const res = await fetch(`${baseUrl}/api/sync/${encodeURIComponent(syncId)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new SyncHttpError('Download sync non riuscito', res.status);
  }
  return (await res.json()) as SyncEnvelope;
}

/**
 * Carica un envelope già cifrato. `force` ignora conflitto di revisione (409).
 */
export async function uploadSyncEnvelope(
  syncId: string,
  envelope: SyncEnvelope,
  options: { force?: boolean; baseUrl?: string } = {}
): Promise<SyncEnvelope> {
  const baseUrl = options.baseUrl ?? apiBase();
  const res = await fetch(`${baseUrl}/api/sync/${encodeURIComponent(syncId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      envelope,
      force: Boolean(options.force),
    }),
  });

  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    throw new SyncHttpError(
      body.message ?? 'Conflitto di versione sync',
      409,
      body.code ?? 'REVISION_CONFLICT'
    );
  }

  if (!res.ok) {
    throw new SyncHttpError('Upload sync non riuscito', res.status);
  }

  return (await res.json()) as SyncEnvelope;
}
