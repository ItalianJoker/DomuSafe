import { NextResponse } from 'next/server';
import {
  createInviteOnServer,
  getAccountById,
  getSession,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';

export async function POST() {
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
    const result = await createInviteOnServer({
      familyId: account.familyId,
      createdByAccountId: account.accountId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invito non creato';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
