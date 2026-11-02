'use client';

/**
 * SOS SMS/WhatsApp — Premium (allowSmsAlerts).
 * Provider pluggable lato server (log/webhook/twilio); nessun SDK nel client.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquareWarning, Phone } from 'lucide-react';
import type { EmergencyContact, ResidentHealthRecord } from '@/types/domus';
import type { SosChannel, SosDispatchResult } from '@/types/premium';
import { FieldLabel, TouchTextarea } from '@/components/TouchField';

interface SosAlertsPanelProps {
  familyId: string;
  houseName?: string;
  residents: ResidentHealthRecord[];
  onStatus?: (msg: string) => void;
}

function collectIceContacts(
  residents: ResidentHealthRecord[]
): EmergencyContact[] {
  const seen = new Set<string>();
  const out: EmergencyContact[] = [];
  for (const r of residents) {
    for (const c of r.iceContacts) {
      const key = c.phoneNumber.replace(/\s/g, '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  return out.sort((a, b) => a.priority - b.priority);
}

export function SosAlertsPanel({
  familyId,
  houseName,
  residents,
  onStatus,
}: SosAlertsPanelProps) {
  const contacts = useMemo(() => collectIceContacts(residents), [residents]);
  const [message, setMessage] = useState(
    `SOS DomuSafe${houseName ? ` · ${houseName}` : ''}: richiesta di aiuto. Contatta subito la famiglia.`
  );
  const [sms, setSms] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);
  const [provider, setProvider] = useState<string>('log');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SosDispatchResult | null>(null);

  useEffect(() => {
    fetch('/api/sos')
      .then((r) => r.json())
      .then((d: { provider?: string }) => {
        if (d.provider) setProvider(d.provider);
      })
      .catch(() => undefined);
  }, []);

  const send = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    setLastResult(null);
    const channels: SosChannel[] = [];
    if (sms) channels.push('sms');
    if (whatsapp) channels.push('whatsapp');
    if (channels.length === 0) {
      setError('Seleziona almeno un canale (SMS o WhatsApp).');
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyId,
          message,
          channels,
          houseName,
          dryRun,
          recipients: contacts.map((c) => ({
            name: c.name,
            phoneNumber: c.phoneNumber,
            relationship: c.relationship,
          })),
        }),
      });
      const data = (await res.json()) as {
        result?: SosDispatchResult;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Invio non riuscito');
      setLastResult(data.result ?? null);
      onStatus?.(
        dryRun
          ? 'Prova SOS completata (nessun messaggio reale se provider=log).'
          : `SOS inviato · ${data.result?.delivered ?? 0} recapiti ok`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="sos-title"
      className="rounded-lg border-2 border-[var(--brand-danger)] bg-[#fff5f7] p-4"
    >
      <h2
        id="sos-title"
        className="flex items-center gap-2 font-display text-lg font-black text-[var(--brand-danger)]"
      >
        <MessageSquareWarning className="size-6" aria-hidden />
        Avvisi SOS (SMS / WhatsApp)
      </h2>
      <p className="mt-1 text-sm text-zinc-700">
        Invia un messaggio ai contatti ICE. Provider attivo:{' '}
        <strong>{provider}</strong> (configurabile sull’host senza SDK a
        pagamento — vedi README).
      </p>

      {contacts.length === 0 ? (
        <p className="mt-3 font-semibold text-amber-950">
          Nessun contatto ICE con telefono nelle schede Emergenza.
        </p>
      ) : (
        <ul className="mt-3 space-y-1 text-sm">
          {contacts.map((c) => (
            <li key={`${c.priority}-${c.phoneNumber}`} className="font-medium">
              <Phone className="mr-1 inline size-4" aria-hidden />#{c.priority}{' '}
              {c.name} · {c.phoneNumber}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <FieldLabel>Messaggio</FieldLabel>
          <TouchTextarea
            value={message}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-bold">
          <label className="inline-flex min-h-12 items-center gap-2">
            <input
              type="checkbox"
              className="size-5 accent-[var(--brand-danger)]"
              checked={sms}
              onChange={(e) => setSms(e.target.checked)}
            />
            SMS
          </label>
          <label className="inline-flex min-h-12 items-center gap-2">
            <input
              type="checkbox"
              className="size-5 accent-[var(--brand-danger)]"
              checked={whatsapp}
              onChange={(e) => setWhatsapp(e.target.checked)}
            />
            WhatsApp
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || contacts.length === 0}
            onClick={() => void send(true)}
            className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold disabled:opacity-60"
          >
            Prova (dry-run)
          </button>
          <button
            type="button"
            disabled={busy || contacts.length === 0}
            onClick={() => void send(false)}
            className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-[var(--brand-danger)] bg-[var(--brand-danger)] px-4 font-bold text-white disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <MessageSquareWarning className="size-5" aria-hidden />
            )}
            Invia SOS
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 font-semibold text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {lastResult ? (
        <p className="mt-3 text-sm font-semibold text-zinc-800" role="status">
          Provider {lastResult.provider}
          {lastResult.dryRun ? ' · dry-run' : ''} · inviati{' '}
          {lastResult.delivered}, errori {lastResult.failed}
        </p>
      ) : null}
    </section>
  );
}
