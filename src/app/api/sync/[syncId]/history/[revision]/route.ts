/**
 * Scarica un envelope storico cifrato (Premium versioning).
 * Nessuna decifratura server — stesso contratto di GET /api/sync/[syncId].
 */

import { NextResponse } from 'next/server';
import {
  isValidSyncId,
  readEnvelope,
  readEnvelopeRevision,
} from '@/lib/sync-server';
import { errorStatus, requireCloudSyncMember } from '@/lib/sync-auth';

type RouteContext = {
  params: Promise<{ syncId: string; revision: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<Response> {
  const { syncId, revision: revisionRaw } = await context.params;
  if (!isValidSyncId(syncId)) {
    return NextResponse.json({ error: 'syncId non valido' }, { status: 400 });
  }
  const revision = Number(revisionRaw);
  if (!Number.isFinite(revision) || revision < 1) {
    return NextResponse.json({ error: 'revisione non valida' }, { status: 400 });
  }

  const current = await readEnvelope(syncId);
  if (!current?.familyId) {
    return NextResponse.json({ error: 'Non trovato' }, { status: 404 });
  }

  try {
    await requireCloudSyncMember(current.familyId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Accesso negato';
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }

  const envelope = await readEnvelopeRevision(syncId, revision);
  if (!envelope) {
    return NextResponse.json(
      { error: 'Revisione storica non trovata' },
      { status: 404 }
    );
  }
  return NextResponse.json(envelope);
}
