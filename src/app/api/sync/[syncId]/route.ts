/**
 * API sync self-host — riceve/restituisce *solo* SyncEnvelope cifrati.
 * Nessuna decifratura lato server: storage filesystem opaco.
 */

import { NextResponse } from 'next/server';
import {
  isValidSyncId,
  readEnvelope,
  writeEnvelope,
} from '@/lib/sync-server';
import type { SyncEnvelope } from '@/lib/crypto-sync';

type RouteContext = { params: Promise<{ syncId: string }> };

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<Response> {
  const { syncId } = await context.params;
  if (!isValidSyncId(syncId)) {
    return NextResponse.json({ error: 'syncId non valido' }, { status: 400 });
  }
  const envelope = await readEnvelope(syncId);
  if (!envelope) {
    return NextResponse.json({ error: 'Non trovato' }, { status: 404 });
  }
  return NextResponse.json(envelope);
}

export async function PUT(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const { syncId } = await context.params;
  if (!isValidSyncId(syncId)) {
    return NextResponse.json({ error: 'syncId non valido' }, { status: 400 });
  }

  let body: { envelope?: SyncEnvelope; force?: boolean };
  try {
    body = (await request.json()) as { envelope?: SyncEnvelope; force?: boolean };
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }

  const envelope = body.envelope;
  if (!envelope || envelope.format !== 'domusync-1') {
    return NextResponse.json(
      { error: 'Envelope sync non valido' },
      { status: 400 }
    );
  }

  // Difesa in profondità: rifiuta payload che sembrano plaintext JSON di runbook.
  if (
    typeof envelope.ciphertextBase64 !== 'string' ||
    envelope.ciphertextBase64.includes('level1_public') ||
    envelope.ciphertextBase64.includes('houseName')
  ) {
    return NextResponse.json(
      { error: 'Solo ciphertext ammesso' },
      { status: 400 }
    );
  }

  try {
    const result = await writeEnvelope(syncId, envelope, Boolean(body.force));
    if (!result.ok) {
      return NextResponse.json(
        {
          code: 'REVISION_CONFLICT',
          message: 'Conflitto di versione sync',
          current: result.current,
        },
        { status: 409 }
      );
    }
    return NextResponse.json(result.envelope);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sync';
    if (message === 'INVALID_REVISION' || message === 'INVALID_FORMAT') {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Errore di scrittura' }, { status: 500 });
  }
}
