import { NextResponse } from 'next/server';
import {
  acceptInviteOnServer,
  findOpenInviteSeal,
  getAccountById,
  getFamily,
  getSession,
  saveAccount,
  toPublicAccount,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';

export async function POST(request: Request) {
  try {
    const token = await readSessionToken();
    const session = await getSession(token);
    if (!session) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    const account = await getAccountById(session.accountId);
    if (!account) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    if (account.familyId) {
      return NextResponse.json(
        { error: 'Hai già una Famiglia' },
        { status: 400 }
      );
    }
    const body = (await request.json()) as { inviteCode?: string };
    if (!body.inviteCode) {
      return NextResponse.json(
        { error: 'Codice invito obbligatorio' },
        { status: 400 }
      );
    }
    const parts = body.inviteCode.trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'df1') {
      return NextResponse.json(
        { error: 'Codice invito non valido' },
        { status: 400 }
      );
    }
    const familyId = parts[1]!;
    const inviteToken = parts[2]!;
    const before = await getFamily(familyId);
    if (!before) {
      return NextResponse.json(
        { error: 'Famiglia non trovata per questo invito' },
        { status: 400 }
      );
    }
    const sealedFamilyKey = findOpenInviteSeal(before, inviteToken);
    if (!sealedFamilyKey) {
      return NextResponse.json(
        {
          error:
            'Invito senza chiave Famiglia: chiedi un nuovo QR al proprietario',
        },
        { status: 400 }
      );
    }

    const family = await acceptInviteOnServer({
      inviteCode: body.inviteCode,
      accountId: account.accountId,
      email: account.email,
      displayName: account.displayName,
    });
    const next = {
      ...account,
      familyId: family.familyId,
      updatedAt: new Date().toISOString(),
    };
    await saveAccount(next);
    return NextResponse.json({
      family,
      account: toPublicAccount(next),
      sealedFamilyKey,
      inviteToken,
      familyId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Ingresso Famiglia non riuscito';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
