/**
 * Sessione sync E2EE per account entro la Famiglia.
 * Path: blobs/{familyId}.{accountId}.syncsession.json — evita overwrite tra membri.
 * Blob già cifrato con data-key account (client).
 */

import { NextResponse } from 'next/server';
import {
  assertFamilyMember,
  getAccountById,
  getSession,
  type EncryptedAccountBlob,
  getAppDataDir,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

type Ctx = { params: Promise<{ familyId: string }> };

function syncSessionPath(familyId: string, accountId: string): string {
  return path.join(
    getAppDataDir(),
    'blobs',
    `${familyId}.${accountId}.syncsession.json`
  );
}

async function requireMember(familyId: string) {
  const token = await readSessionToken();
  const session = await getSession(token);
  if (!session) return null;
  const account = await getAccountById(session.accountId);
  if (!account) return null;
  await assertFamilyMember(familyId, account.accountId);
  return account;
}

export async function GET(_request: Request, context: Ctx) {
  try {
    const { familyId } = await context.params;
    const account = await requireMember(familyId);
    if (!account) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    try {
      const raw = await readFile(
        syncSessionPath(familyId, account.accountId),
        'utf8'
      );
      return NextResponse.json({
        blob: JSON.parse(raw) as EncryptedAccountBlob,
      });
    } catch {
      return NextResponse.json({ blob: null });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    const status = message.includes('Accesso') ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request, context: Ctx) {
  try {
    const { familyId } = await context.params;
    const account = await requireMember(familyId);
    if (!account) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    const body = (await request.json()) as { blob?: EncryptedAccountBlob };
    if (
      !body.blob ||
      body.blob.version !== 'enc-1' ||
      !body.blob.ivBase64 ||
      !body.blob.ciphertextBase64
    ) {
      return NextResponse.json(
        { error: 'Envelope cifrato non valido' },
        { status: 400 }
      );
    }
    const blob: EncryptedAccountBlob = {
      ...body.blob,
      updatedAt: new Date().toISOString(),
    };
    const target = syncSessionPath(familyId, account.accountId);
    await mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(blob), 'utf8');
    await rename(tmp, target);
    return NextResponse.json({ ok: true, blob });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    const status = message.includes('Accesso') ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const { familyId } = await context.params;
    const account = await requireMember(familyId);
    if (!account) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    await unlink(syncSessionPath(familyId, account.accountId)).catch(
      () => undefined
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
