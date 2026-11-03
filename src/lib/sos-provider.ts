/**
 * Provider SOS pluggable (SMS / WhatsApp) — zero SDK a pagamento obbligatori.
 *
 * Provider (env `DOMUSAFE_SOS_PROVIDER`):
 * - `log` (default): scrive solo in console/audit — ideale self-host senza costo
 * - `webhook`: POST JSON a `DOMUSAFE_SOS_WEBHOOK_URL` (Bearer opzionale)
 * - `twilio`: REST Twilio via `fetch` (nessun pacchetto npm Twilio)
 *
 * Env Twilio (solo se provider=twilio):
 * - DOMUSAFE_TWILIO_ACCOUNT_SID
 * - DOMUSAFE_TWILIO_AUTH_TOKEN
 * - DOMUSAFE_TWILIO_FROM_NUMBER (SMS, es. +39…)
 * - DOMUSAFE_TWILIO_WHATSAPP_FROM (es. whatsapp:+14155238886)
 */
import type {
  SosChannel,
  SosDispatchRequest,
  SosDispatchResult,
} from '@/types/premium';

export type SosProviderId = 'log' | 'webhook' | 'twilio';

export function resolveSosProviderId(
  envValue: string | undefined = process.env.DOMUSAFE_SOS_PROVIDER
): SosProviderId {
  const v = envValue?.trim().toLowerCase();
  if (v === 'webhook' || v === 'twilio') return v;
  return 'log';
}

function normalizePhone(raw: string): string {
  return raw.replace(/[\s()-]/g, '').trim();
}

async function dispatchLog(
  req: SosDispatchRequest
): Promise<SosDispatchResult> {
  const details: SosDispatchResult['details'] = [];
  for (const recipient of req.recipients) {
    for (const channel of req.channels) {
      const phone = normalizePhone(recipient.phoneNumber);
      if (!phone) {
        details.push({
          phoneNumber: recipient.phoneNumber,
          channel,
          status: 'skipped',
          detail: 'Numero mancante',
        });
        continue;
      }
      console.info(
        `[DomuSafe SOS/${channel}] → ${recipient.name} <${phone}>: ${req.message.slice(0, 120)}`
      );
      details.push({
        phoneNumber: phone,
        channel,
        status: req.dryRun ? 'skipped' : 'sent',
        detail: req.dryRun ? 'dry-run' : 'log-provider',
      });
    }
  }
  return summarize('log', req.dryRun === true, details);
}

async function dispatchWebhook(
  req: SosDispatchRequest
): Promise<SosDispatchResult> {
  const url = process.env.DOMUSAFE_SOS_WEBHOOK_URL?.trim();
  if (!url) {
    return {
      ok: false,
      provider: 'webhook',
      dryRun: req.dryRun === true,
      delivered: 0,
      failed: req.recipients.length * req.channels.length,
      details: [
        {
          phoneNumber: '',
          channel: req.channels[0] ?? 'sms',
          status: 'error',
          detail: 'DOMUSAFE_SOS_WEBHOOK_URL non configurato',
        },
      ],
    };
  }

  if (req.dryRun) {
    return dispatchLog({ ...req, dryRun: true });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = process.env.DOMUSAFE_SOS_WEBHOOK_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const details: SosDispatchResult['details'] = [];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: 'domusafe',
        familyId: req.familyId,
        houseName: req.houseName,
        message: req.message,
        channels: req.channels,
        recipients: req.recipients.map((r) => ({
          name: r.name,
          phoneNumber: normalizePhone(r.phoneNumber),
          relationship: r.relationship,
        })),
      }),
    });
    const ok = res.ok;
    for (const recipient of req.recipients) {
      for (const channel of req.channels) {
        details.push({
          phoneNumber: normalizePhone(recipient.phoneNumber),
          channel,
          status: ok ? 'sent' : 'error',
          detail: ok ? `webhook ${res.status}` : `webhook HTTP ${res.status}`,
        });
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'webhook error';
    for (const recipient of req.recipients) {
      for (const channel of req.channels) {
        details.push({
          phoneNumber: normalizePhone(recipient.phoneNumber),
          channel,
          status: 'error',
          detail,
        });
      }
    }
  }
  return summarize('webhook', false, details);
}

/**
 * Twilio Messages API (form-urlencoded) — nessuna dipendenza npm.
 * @see https://www.twilio.com/docs/sms/api/message-resource
 */
async function dispatchTwilio(
  req: SosDispatchRequest
): Promise<SosDispatchResult> {
  const sid = process.env.DOMUSAFE_TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.DOMUSAFE_TWILIO_AUTH_TOKEN?.trim();
  const smsFrom = process.env.DOMUSAFE_TWILIO_FROM_NUMBER?.trim();
  const waFrom = process.env.DOMUSAFE_TWILIO_WHATSAPP_FROM?.trim();

  if (!sid || !token) {
    return {
      ok: false,
      provider: 'twilio',
      dryRun: req.dryRun === true,
      delivered: 0,
      failed: 1,
      details: [
        {
          phoneNumber: '',
          channel: 'sms',
          status: 'error',
          detail:
            'Twilio: imposta DOMUSAFE_TWILIO_ACCOUNT_SID e DOMUSAFE_TWILIO_AUTH_TOKEN',
        },
      ],
    };
  }

  if (req.dryRun) {
    return dispatchLog({ ...req, dryRun: true });
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const details: SosDispatchResult['details'] = [];

  for (const recipient of req.recipients) {
    const phone = normalizePhone(recipient.phoneNumber);
    for (const channel of req.channels) {
      if (!phone) {
        details.push({
          phoneNumber: recipient.phoneNumber,
          channel,
          status: 'skipped',
          detail: 'Numero mancante',
        });
        continue;
      }
      const from =
        channel === 'whatsapp'
          ? waFrom || (smsFrom ? `whatsapp:${smsFrom}` : '')
          : smsFrom;
      if (!from) {
        details.push({
          phoneNumber: phone,
          channel,
          status: 'error',
          detail:
            channel === 'whatsapp'
              ? 'DOMUSAFE_TWILIO_WHATSAPP_FROM mancante'
              : 'DOMUSAFE_TWILIO_FROM_NUMBER mancante',
        });
        continue;
      }
      const to = channel === 'whatsapp' ? `whatsapp:${phone}` : phone;
      try {
        const body = new URLSearchParams({
          To: to,
          From: from,
          Body: req.message,
        });
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        });
        details.push({
          phoneNumber: phone,
          channel,
          status: res.ok ? 'sent' : 'error',
          detail: res.ok ? 'twilio' : `twilio HTTP ${res.status}`,
        });
      } catch (error) {
        details.push({
          phoneNumber: phone,
          channel,
          status: 'error',
          detail: error instanceof Error ? error.message : 'twilio error',
        });
      }
    }
  }
  return summarize('twilio', false, details);
}

function summarize(
  provider: string,
  dryRun: boolean,
  details: SosDispatchResult['details']
): SosDispatchResult {
  const delivered = details.filter((d) => d.status === 'sent').length;
  const failed = details.filter((d) => d.status === 'error').length;
  return {
    ok: failed === 0 && (dryRun || delivered > 0 || details.length === 0),
    provider,
    dryRun,
    delivered,
    failed,
    details,
  };
}

/**
 * Spedisce SOS tramite il provider configurato in ambiente.
 * Nessun SDK a pagamento: solo `fetch` o log locale.
 */
export async function dispatchSos(
  req: SosDispatchRequest
): Promise<SosDispatchResult> {
  if (!req.message.trim()) {
    return {
      ok: false,
      provider: resolveSosProviderId(),
      dryRun: req.dryRun === true,
      delivered: 0,
      failed: 0,
      details: [
        {
          phoneNumber: '',
          channel: 'sms',
          status: 'error',
          detail: 'Messaggio di soccorso vuoto',
        },
      ],
    };
  }
  if (req.recipients.length === 0) {
    return {
      ok: false,
      provider: resolveSosProviderId(),
      dryRun: req.dryRun === true,
      delivered: 0,
      failed: 0,
      details: [
        {
          phoneNumber: '',
          channel: 'sms',
          status: 'skipped',
          detail: 'Nessun contatto di emergenza con telefono',
        },
      ],
    };
  }
  const channels =
    req.channels.length > 0 ? req.channels : (['sms'] as SosChannel[]);
  const normalized = { ...req, channels };
  const provider = resolveSosProviderId();
  if (provider === 'webhook') return dispatchWebhook(normalized);
  if (provider === 'twilio') return dispatchTwilio(normalized);
  return dispatchLog(normalized);
}
