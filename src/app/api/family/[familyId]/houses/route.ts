import { NextResponse } from 'next/server';
import {
  assertFamilyMember,
  getAccountById,
  getSession,
  readHousesBlob,
  writeHousesBlob,
  type EncryptedAccountBlob,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';

type Ctx = { params: Promise<{ familyId: string }> };

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
    const blob = await readHousesBlob(familyId);
    return NextResponse.json({ blob });
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
    // Server rifiuta plaintext accidentale (euristica).
    if (
      body.blob.ciphertextBase64.includes('level1_public') ||
      body.blob.ciphertextBase64.includes('houseName')
    ) {
      return NextResponse.json(
        { error: 'Payload non cifrato rifiutato' },
        { status: 400 }
      );
    }
    const blob: EncryptedAccountBlob = {
      ...body.blob,
      updatedAt: new Date().toISOString(),
    };
    await writeHousesBlob(familyId, blob);
    return NextResponse.json({ ok: true, blob });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    const status = message.includes('Accesso') ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
