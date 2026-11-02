/**
 * Licenza account: prova Premium (server-side) oppure chiave SaaS JWT/Ed25519.
 * Non accetta `baseTier` / campi trial arbitrari dal client (anti-spoof).
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

/**
 * Mutazioni licenza consentite:
 * - `start_premium_trial` — avvio prova Premium (una sola volta)
 * - `apply_saas` + `saasToken` — JWT Ed25519 verificato con DOMUSAFE_LICENSE_PUBLIC_KEY
 */
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

    if (body.action === 'start_premium_trial') {
      const license = startPremiumTrial(account.license);
      const next = {
        ...account,
        license,
        updatedAt: new Date().toISOString(),
      };
      await saveAccount(next);
      return NextResponse.json({ account: toPublicAccount(next) });
    }

    if (body.action === 'apply_saas') {
      const saasToken =
        typeof body.saasToken === 'string' ? body.saasToken.trim() : '';
      if (!saasToken) {
        return NextResponse.json(
          { error: 'saasToken obbligatorio' },
          { status: 400 }
        );
      }
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
      { error: 'Azione licenza non consentita' },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Aggiornamento licenza fallito';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
