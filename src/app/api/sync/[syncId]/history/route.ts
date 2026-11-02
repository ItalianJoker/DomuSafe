/**
 * Elenco revisioni storiche sync (Premium backup). Solo metadati revision/updatedAt.
 * L’envelope cifrato di una revisione si scarica da `/history/[revision]`.
 */

import { NextResponse } from 'next/server';
import {
  isValidSyncId,
  listEnvelopeHistory,
  readEnvelope,
} from '@/lib/sync-server';
import { errorStatus, requireCloudSyncMember } from '@/lib/sync-auth';

type RouteContext = { params: Promise<{ syncId: string }> };

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<Response> {
  const { syncId } = await context.params;
  if (!isValidSyncId(syncId)) {
    return NextResponse.json({ error: 'syncId non valido' }, { status: 400 });
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

  const history = await listEnvelopeHistory(syncId);
  return NextResponse.json({
    syncId,
    currentRevision: current.revision,
    currentUpdatedAt: current.updatedAt,
    history,
  });
}
