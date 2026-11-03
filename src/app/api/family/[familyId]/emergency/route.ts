/**
 * Pubblica pacchetto break-glass L1+L2 (ciphertext). Solo membri Famiglia.
 * La chiave AES resta nel fragment del QR — mai inviata al server.
 */
import { NextResponse } from 'next/server';
import { readSessionToken } from '@/lib/session-cookie';
import {
  getAccountById,
  getSession,
  publishEmergencyPackOnServer,
  readEmergencyBlob,
} from '@/lib/account-server';

type Ctx = { params: Promise<{ familyId: string }> };

async function requireMember(familyId: string) {
  const token = await readSessionToken();
  const session = await getSession(token);
  if (!session) throw new Error('Non autenticato');
  const account = await getAccountById(session.accountId);
  if (!account) throw new Error('Non autenticato');
  if (account.familyId !== familyId) throw new Error('Accesso negato alla Famiglia');
  return account;
}

export async function GET(_request: Request, context: Ctx) {
  try {
    const { familyId } = await context.params;
    await requireMember(familyId);
    const blob = await readEmergencyBlob(familyId);
    return NextResponse.json({
      published: Boolean(blob),
      updatedAt: blob?.updatedAt ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    const status = message.includes('Accesso')
      ? 403
      : message.includes('autenticato')
        ? 401
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request, context: Ctx) {
  try {
    const { familyId } = await context.params;
    const account = await requireMember(familyId);
    const body = (await request.json()) as {
      blob?: {
        ivBase64?: string;
        ciphertextBase64?: string;
      };
      rotateToken?: boolean;
    };
    if (!body.blob?.ivBase64 || !body.blob?.ciphertextBase64) {
      return NextResponse.json(
        { error: 'Blob emergenza mancante' },
        { status: 400 }
      );
    }
    if (
      body.blob.ciphertextBase64.includes('level1_public') ||
      body.blob.ciphertextBase64.includes('houseName')
    ) {
      return NextResponse.json(
        { error: 'Payload non cifrato rifiutato' },
        { status: 400 }
      );
    }
    const { family, token } = await publishEmergencyPackOnServer({
      familyId,
      accountId: account.accountId,
      rotateToken: Boolean(body.rotateToken),
      blob: {
        version: 'enc-1',
        ivBase64: body.blob.ivBase64,
        ciphertextBase64: body.blob.ciphertextBase64,
        updatedAt: new Date().toISOString(),
      },
    });
    return NextResponse.json({
      ok: true,
      token,
      familyId: family.familyId,
      updatedAt: family.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    const status = message.includes('Accesso')
      ? 403
      : message.includes('autenticato')
        ? 401
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
