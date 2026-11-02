'use client';

/**
 * Audit log scansioni — Premium (auditLog).
 * Mostra chi/quando ha scansionato il QR di monitoraggio; QR ospiti + voce manuale.
 */

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Loader2, QrCode, RefreshCw } from 'lucide-react';
import type { AuditLogDocument } from '@/types/premium';
import { generateQrSvg } from '@/lib/qr';
import { FieldLabel, TouchInput } from '@/components/TouchField';

interface AuditLogPanelProps {
  familyId: string;
  houseName?: string;
  onStatus?: (msg: string) => void;
}

export function AuditLogPanel({
  familyId,
  houseName,
  onStatus,
}: AuditLogPanelProps) {
  const [log, setLog] = useState<AuditLogDocument | null>(null);
  const [scanToken, setScanToken] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanUrl =
    typeof window !== 'undefined' && scanToken
      ? `${window.location.origin}/s/${scanToken}${
          houseName ? `?house=${encodeURIComponent(houseName)}` : ''
        }`
      : '';

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/family/${familyId}/audit`);
      const data = (await res.json()) as {
        log?: AuditLogDocument;
        scanToken?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Caricamento fallito');
      setLog(data.log ?? null);
      setScanToken(data.scanToken ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    } finally {
      setBusy(false);
    }
  }, [familyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/family/${familyId}/audit`);
        const data = (await res.json()) as {
          log?: AuditLogDocument;
          scanToken?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Caricamento fallito');
        setLog(data.log ?? null);
        setScanToken(data.scanToken ?? null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Errore');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  useEffect(() => {
    if (!scanUrl) return;
    let cancelled = false;
    generateQrSvg(scanUrl, 160)
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setQrSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [scanUrl]);

  const addManual = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/family/${familyId}/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'MANUAL',
          note: note.trim() || 'Accesso annotato a mano',
          houseName,
        }),
      });
      const data = (await res.json()) as {
        log?: AuditLogDocument;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Salvataggio fallito');
      setLog(data.log ?? null);
      setNote('');
      onStatus?.('Voce aggiunta al registro accessi.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="audit-title"
      className="rounded-lg border-2 border-zinc-900 bg-white p-4"
    >
      <h2
        id="audit-title"
        className="flex items-center gap-2 font-display text-lg font-black"
      >
        <ClipboardList className="size-6" aria-hidden />
        Registro accessi (scan)
      </h2>
      <p className="mt-1 text-sm text-zinc-700">
        Piano Premium: vedi chi ha inquadrato il QR di monitoraggio e quando.
        Non espone dati sanitari o cassaforte.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 text-sm font-bold">
            <QrCode className="size-4" aria-hidden />
            QR per ospiti
          </p>
          {qrSvg && scanUrl ? (
            <div
              className="mx-auto w-40 [&_svg]:h-full [&_svg]:w-full sm:mx-0"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center border-2 border-dashed border-zinc-400 text-xs text-zinc-600">
              {busy ? '…' : 'QR in preparazione'}
            </div>
          )}
          {scanUrl ? (
            <p className="mt-2 break-all text-xs text-zinc-600">{scanUrl}</p>
          ) : null}
        </div>

        <div className="space-y-3">
          <div>
            <FieldLabel>Annotazione manuale</FieldLabel>
            <TouchInput
              value={note}
              placeholder="Es. controllo chiave, visita host…"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void addManual()}
              className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-zinc-950 px-4 font-bold text-white disabled:opacity-60"
            >
              Aggiungi voce
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-5" aria-hidden />
              )}
              Aggiorna
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-3 font-semibold text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
        {(log?.entries ?? []).length === 0 ? (
          <li className="text-sm text-zinc-600">Nessun accesso registrato.</li>
        ) : (
          log!.entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm"
            >
              <span className="font-bold uppercase tracking-wide text-[var(--brand-forest)]">
                {entry.kind}
              </span>
              <span className="mx-2 text-zinc-400">·</span>
              <time dateTime={entry.at}>
                {new Date(entry.at).toLocaleString('it-IT')}
              </time>
              <p className="font-semibold text-zinc-950">{entry.actorLabel}</p>
              {entry.houseName ? (
                <p className="text-xs text-zinc-600">Casa: {entry.houseName}</p>
              ) : null}
              {entry.note ? (
                <p className="text-xs text-zinc-700">{entry.note}</p>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
