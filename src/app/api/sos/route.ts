/**
 * SOS SMS/WhatsApp — Premium (allowSmsAlerts).
 * Provider pluggable via env (log | webhook | twilio) — vedi lib/sos-provider.ts.
 */
import { NextResponse } from 'next/server';
import {
  appendAuditEntry,
  assertFamilyMember,
  getAccountById,
  getSession,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';
import {
  PREMIUM_REQUIRED_MESSAGE,
  accountCanAccess,
} from '@/lib/premium-gate';
import { dispatchSos, resolveSosProviderId } from '@/lib/sos-provider';
import type { SosChannel, SosRecipient } from '@/types/premium';

export async function GET() {
  return NextResponse.json({
    provider: resolveSosProviderId(),
    configured: true,
  });
}

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
    if (!accountCanAccess(account.license, 'allowSmsAlerts')) {
      return NextResponse.json(
        { error: PREMIUM_REQUIRED_MESSAGE },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      familyId?: string;
      message?: string;
      channels?: SosChannel[];
      recipients?: SosRecipient[];
      houseName?: string;
      dryRun?: boolean;
    };

    if (!body.familyId || !body.message?.trim()) {
      return NextResponse.json(
        { error: 'Servono familyId e messaggio' },
        { status: 400 }
      );
    }
    await assertFamilyMember(body.familyId, account.accountId);

    const channels = (body.channels ?? ['sms']).filter(
      (c): c is SosChannel => c === 'sms' || c === 'whatsapp'
    );
    const recipients = (body.recipients ?? []).filter(
      (r) => r && typeof r.phoneNumber === 'string' && r.phoneNumber.trim()
    );

    const result = await dispatchSos({
      familyId: body.familyId,
      message: body.message.trim().slice(0, 600),
      channels: channels.length > 0 ? channels : ['sms'],
      recipients: recipients.slice(0, 20),
      houseName: body.houseName?.slice(0, 120),
      dryRun: body.dryRun === true,
    });

    await appendAuditEntry(body.familyId, {
      kind: 'SOS',
      actorLabel: account.displayName || account.email,
      note: result.dryRun
        ? `Prova SOS (${result.provider})`
        : `SOS inviato via ${result.provider} · ${result.delivered} ok / ${result.failed} errori`,
      houseName: body.houseName,
    });

    return NextResponse.json({ ok: result.ok, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    const status = message.includes('Accesso')
      ? 403
      : message.includes('Premium')
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
