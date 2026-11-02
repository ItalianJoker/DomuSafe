import { NextResponse } from 'next/server';
import {
  assertFamilyMember,
  getAccountById,
  getSession,
  putMemberKeyWrapOnServer,
  toPublicAccount,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';
import type { SealedKeyBlob } from '@/types/account';

type Ctx = { params: Promise<{ familyId: string }> };

/**
 * PUT — registra il wrap della family-key per l’account corrente.
 * Usato dopo create Famiglia, join con invito, o migrazione legacy.
 */
export async function PUT(request: Request, context: Ctx) {
  try {
    const { familyId } = await context.params;
    const token = await readSessionToken();
    const session = await getSession(token);
    if (!session) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    const account = await getAccountById(session.accountId);
    if (!account) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    await assertFamilyMember(familyId, account.accountId);
    const body = (await request.json()) as { wrap?: SealedKeyBlob };
    if (!body.wrap) {
      return NextResponse.json({ error: 'Wrap mancante' }, { status: 400 });
    }
    const family = await putMemberKeyWrapOnServer({
      familyId,
      accountId: account.accountId,
      wrap: body.wrap,
    });
    return NextResponse.json({
      family,
      account: toPublicAccount(account),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Salvataggio chiave fallito';
    const status = message.includes('Accesso') ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
