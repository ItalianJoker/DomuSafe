import { NextResponse } from 'next/server';
import {
  createInviteOnServer,
  getAccountById,
  getSession,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';
import type { SealedKeyBlob } from '@/types/account';

export async function POST(request: Request) {
  try {
    const token = await readSessionToken();
    const session = await getSession(token);
    if (!session) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    const account = await getAccountById(session.accountId);
    if (!account?.familyId) {
      return NextResponse.json(
        { error: 'Nessuna Famiglia collegata' },
        { status: 400 }
      );
    }
    const body = (await request.json()) as {
      sealedFamilyKey?: SealedKeyBlob;
      clientToken?: string;
    };
    if (!body.sealedFamilyKey || !body.clientToken) {
      return NextResponse.json(
        { error: 'Chiave Famiglia o token invito mancanti' },
        { status: 400 }
      );
    }
    const result = await createInviteOnServer({
      familyId: account.familyId,
      createdByAccountId: account.accountId,
      sealedFamilyKey: body.sealedFamilyKey,
      clientToken: body.clientToken,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invito non creato';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
