'use client';

/**
 * Conferma scansione QR pubblico — Livello accesso: beacon Premium.
 * Chiama /api/scan/[token] e mostra messaggio host (white-label se presente).
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { DomuSafeLogo } from '@/components/DomuSafeLogo';

interface ScanAckProps {
  token: string;
}

interface ScanPayload {
  ok?: boolean;
  familyName?: string;
  hostDisplayName?: string | null;
  tagline?: string | null;
  accentColor?: string | null;
  message?: string;
  error?: string;
}

export function ScanAck({ token }: ScanAckProps) {
  const [data, setData] = useState<ScanPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const house =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('house')
        : null;
    const qs = house ? `?house=${encodeURIComponent(house)}` : '';
    fetch(`/api/scan/${encodeURIComponent(token)}${qs}`)
      .then(async (res) => {
        const json = (await res.json()) as ScanPayload;
        if (!res.ok) throw new Error(json.error || 'QR non valido');
        if (!cancelled) setData(json);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Errore di rete');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const brand = data?.hostDisplayName?.trim() || 'DomuSafe';
  const accent = data?.accentColor || '#0b1f17';

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-4 py-10"
      style={{
        background: `linear-gradient(180deg, ${accent} 0%, #eef3f0 55%)`,
      }}
    >
      <div className="w-full max-w-md rounded-lg border-2 border-zinc-900 bg-white p-6 text-center shadow-sm">
        {!data && !error ? (
          <p className="inline-flex items-center gap-2 font-semibold text-zinc-800">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Registrazione accesso…
          </p>
        ) : null}

        {error ? (
          <div role="alert">
            <ShieldAlert className="mx-auto size-10 text-red-800" aria-hidden />
            <p className="mt-3 font-bold text-red-900">{error}</p>
          </div>
        ) : null}

        {data ? (
          <>
            <div className="mx-auto mb-3 flex justify-center">
              <DomuSafeLogo size={56} />
            </div>
            <p className="font-display text-2xl font-black" style={{ color: accent }}>
              {brand}
            </p>
            {data.tagline ? (
              <p className="mt-1 text-sm text-zinc-600">{data.tagline}</p>
            ) : null}
            <p className="mt-4 inline-flex items-center justify-center gap-2 font-semibold text-emerald-900">
              <CheckCircle2 className="size-5" aria-hidden />
              Accesso registrato
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700">
              {data.message}
            </p>
            {data.familyName ? (
              <p className="mt-4 text-xs text-zinc-500">
                Famiglia · {data.familyName}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
