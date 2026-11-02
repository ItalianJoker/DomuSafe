/**
 * Licenza account: prova Premium (server-side) oppure chiave SaaS JWT/Ed25519.
 * Non accetta un `baseTier` arbitrario dal client (anti-escalation).
 */

import { NextResponse } from 'next/server';
import {
  getAccountById,
  getSession,
  saveAccount,
  toPublicAccount,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';
import { startPremiumTrial } from '@/lib/trial';
import { applySaasLicenseToken } from '@/lib/license-jwt';

export async function PUT(request: Request) {
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

    const body = (await request.json()) as {
      action?: string;
      saasToken?: string;
    };

    if (body.action === 'start_trial') {
      const license = startPremiumTrial(account.license);
      const next = {
        ...account,
        license,
        updatedAt: new Date().toISOString(),
      };
      await saveAccount(next);
      return NextResponse.json({ account: toPublicAccount(next) });
    }

    const saasToken =
      typeof body.saasToken === 'string' ? body.saasToken.trim() : '';

    if (
      (body.action === 'apply_saas' || body.action === undefined) &&
      saasToken
    ) {
      const verified = applySaasLicenseToken({
        token: saasToken,
        accountEmail: account.email,
      });
      const next = {
        ...account,
        license: {
          ...account.license,
          saasTier: verified.claims.tier,
          saasToken: verified.token,
          saasIssuedTo: verified.claims.issuedTo,
          saasExpiresAt: verified.expiresAt,
        },
        updatedAt: new Date().toISOString(),
      };
      await saveAccount(next);
      return NextResponse.json({ account: toPublicAccount(next) });
    }

    return NextResponse.json(
      {
        error:
          'Azione non valida: usa start_trial oppure applica una chiave SaaS (saasToken)',
      },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Aggiornamento licenza fallito';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
