/**
 * Audit log Famiglia — Premium (auditLog).
 * GET: elenco accessi/scan. POST: voce manuale (membro autenticato).
 */
import { NextResponse } from 'next/server';
import {
  appendAuditEntry,
  assertFamilyMember,
  ensureFamilyScanToken,
  getAccountById,
  getSession,
  readAuditLog,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';
import {
  PREMIUM_REQUIRED_MESSAGE,
  accountCanAccess,
} from '@/lib/premium-gate';
import type { AuditEventKind } from '@/types/premium';

type Ctx = { params: Promise<{ familyId: string }> };

async function requirePremiumMember(familyId: string) {
  const token = await readSessionToken();
  const session = await getSession(token);
  if (!session) return null;
  const account = await getAccountById(session.accountId);
  if (!account) return null;
  await assertFamilyMember(familyId, account.accountId);
  if (!accountCanAccess(account.license, 'auditLog')) {
    throw new Error(PREMIUM_REQUIRED_MESSAGE);
  }
  return account;
}

export async function GET(_request: Request, context: Ctx) {
  try {
    const { familyId } = await context.params;
    const account = await requirePremiumMember(familyId);
    if (!account) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    const family = await ensureFamilyScanToken(familyId);
    const log = await readAuditLog(familyId);
    return NextResponse.json({
      log,
      scanToken: family.scanToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    const status = message.includes('Premium')
      ? 403
      : message.includes('Accesso')
        ? 403
        : 401;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { familyId } = await context.params;
    const account = await requirePremiumMember(familyId);
    if (!account) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    const body = (await request.json()) as {
      kind?: AuditEventKind;
      note?: string;
      houseName?: string;
    };
    const kind: AuditEventKind =
      body.kind === 'SOS' || body.kind === 'SCAN' ? body.kind : 'MANUAL';
    const log = await appendAuditEntry(familyId, {
      kind,
      actorLabel: account.displayName || account.email,
      note: body.note,
      houseName: body.houseName,
    });
    return NextResponse.json({ ok: true, log });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    const status = message.includes('Premium')
      ? 403
      : message.includes('Accesso')
        ? 403
        : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
