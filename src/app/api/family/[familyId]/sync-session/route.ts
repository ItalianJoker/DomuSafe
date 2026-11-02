import { NextResponse } from 'next/server';
import {
  assertFamilyMember,
  getAccountById,
  getSession,
  type EncryptedAccountBlob,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { getAppDataDir } from '@/lib/account-server';

type Ctx = { params: Promise<{ familyId: string }> };

function syncSessionPath(familyId: string): string {
  return path.join(getAppDataDir(), 'blobs', `${familyId}.syncsession.json`);
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
    await requireMember(familyId);
    try {
      const raw = await readFile(syncSessionPath(familyId), 'utf8');
      return NextResponse.json({ blob: JSON.parse(raw) as EncryptedAccountBlob });
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
    await requireMember(familyId);
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
    const target = syncSessionPath(familyId);
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
    await requireMember(familyId);
    const { unlink } = await import('node:fs/promises');
    await unlink(syncSessionPath(familyId)).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
