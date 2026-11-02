/**
 * API sync self-host — riceve/restituisce *solo* SyncEnvelope cifrati.
 * Family-scoped + Premium (allowCloudSync / trial): auth obbligatoria.
 * Nessuna decifratura lato server: storage filesystem opaco.
 */

import { NextResponse } from 'next/server';
import {
  isValidSyncId,
  readEnvelope,
  writeEnvelope,
} from '@/lib/sync-server';
import type { SyncEnvelope } from '@/lib/crypto-sync';
import {
  assertFamilyMember,
  getAccountById,
  getSession,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';
import { canAccessFeature, resolveEffectiveTier } from '@/lib/licensing';

type RouteContext = { params: Promise<{ syncId: string }> };

async function requireCloudSyncMember(familyId: string) {
  const token = await readSessionToken();
  const session = await getSession(token);
  if (!session) {
    throw Object.assign(new Error('Non autenticato'), { status: 401 });
  }
  const account = await getAccountById(session.accountId);
  if (!account) {
    throw Object.assign(new Error('Non autenticato'), { status: 401 });
  }
  await assertFamilyMember(familyId, account.accountId);
  const tier = resolveEffectiveTier(account.license);
  if (!canAccessFeature(tier, 'allowCloudSync')) {
    throw Object.assign(
      new Error(
        'Sync cloud riservata al piano Premium (o prova Premium attiva)'
      ),
      { status: 403 }
    );
  }
  return account;
}

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
  try {
    if (!envelope.familyId) {
      return NextResponse.json(
        { error: 'Envelope sync senza Famiglia' },
        { status: 400 }
      );
    }
    await requireCloudSyncMember(envelope.familyId);
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'status' in error
        ? Number((error as { status: number }).status)
        : 401;
    const message = error instanceof Error ? error.message : 'Accesso negato';
    return NextResponse.json({ error: message }, { status });
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
    body = (await request.json()) as {
      envelope?: SyncEnvelope;
      force?: boolean;
    };
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
  if (!envelope.familyId || typeof envelope.familyId !== 'string') {
    return NextResponse.json(
      { error: 'familyId obbligatorio sull’envelope sync' },
      { status: 400 }
    );
  }

  try {
    await requireCloudSyncMember(envelope.familyId);
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'status' in error
        ? Number((error as { status: number }).status)
        : 401;
    const message = error instanceof Error ? error.message : 'Accesso negato';
    return NextResponse.json({ error: message }, { status });
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

  // Se esiste già, la Famiglia non può cambiare (anti-hijack stanza).
  const existing = await readEnvelope(syncId);
  if (
    existing?.familyId &&
    existing.familyId !== envelope.familyId
  ) {
    return NextResponse.json(
      { error: 'Stanza sync già legata a un’altra Famiglia' },
      { status: 403 }
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
