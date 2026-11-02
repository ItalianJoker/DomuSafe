/**
 * Client HTTP sync: upload/download *solo* di SyncEnvelope cifrati.
 * Cookie di sessione inclusi: PUT gated Premium sul server.
 * Nessuna serializzazione plaintext verso la rete — cifratura in crypto-sync.
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
 * Richiede sessione Famiglia (family-scoped).
 */
export async function fetchSyncEnvelope(
  syncId: string,
  baseUrl = apiBase()
): Promise<SyncEnvelope | null> {
  const res = await fetch(`${baseUrl}/api/sync/${encodeURIComponent(syncId)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 404) {
    return null;
  }
  if (res.status === 401 || res.status === 403) {
    throw new SyncHttpError(
      'Accesso sync negato: serve Premium (o prova) e membership Famiglia',
      res.status
    );
  }
  if (!res.ok) {
    throw new SyncHttpError('Download sync non riuscito', res.status);
  }
  return (await res.json()) as SyncEnvelope;
}

/**
 * Carica un envelope già cifrato. `force` ignora conflitto di revisione (409).
 * Server: auth + allowCloudSync + family membership.
 */
export async function uploadSyncEnvelope(
  syncId: string,
  envelope: SyncEnvelope,
  options: { force?: boolean; baseUrl?: string } = {}
): Promise<SyncEnvelope> {
  const baseUrl = options.baseUrl ?? apiBase();
  const res = await fetch(`${baseUrl}/api/sync/${encodeURIComponent(syncId)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      envelope,
      force: Boolean(options.force),
    }),
  });

  if (res.status === 401 || res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new SyncHttpError(
      body.error ??
        'Upload sync negato: serve Premium (o prova) e membership Famiglia',
      res.status
    );
  }

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
