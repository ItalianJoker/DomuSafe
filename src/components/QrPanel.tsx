'use client';

/**
 * Pannello QR leggero (Livello 1): genera SVG dal payload URL corrente.
 */

import { useEffect, useState } from 'react';
import { QrCode } from 'lucide-react';
import { generateQrSvg } from '@/lib/qr';

interface QrPanelProps {
  payload: string;
  onSvgReady?: (svg: string) => void;
}

export function QrPanel({ payload, onSvgReady }: QrPanelProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    generateQrSvg(payload, 180)
      .then((next) => {
        if (cancelled) return;
        setError(null);
        setSvg(next);
        onSvgReady?.(next);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Impossibile generare il QR.');
        setSvg(null);
      });

    return () => {
      cancelled = true;
    };
  }, [payload, onSvgReady]);

  return (
    <section
      aria-labelledby="qr-title"
      className="rounded-lg border-2 border-zinc-900 bg-white p-4"
    >
      <h2
        id="qr-title"
        className="mb-2 flex items-center gap-2 text-lg font-bold text-zinc-950"
      >
        <QrCode className="size-6" aria-hidden />
        QR di accesso
      </h2>
      <p className="mb-3 text-sm text-zinc-700">
        Inquadra per aprire questo manuale sul telefono (uso locale /
        self-host).
      </p>
      {error ? (
        <p className="font-semibold text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {svg ? (
        <div
          className="mx-auto w-44 [&_svg]:h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="mx-auto flex h-44 w-44 items-center justify-center border-2 border-dashed border-zinc-400 text-sm text-zinc-600">
          Generazione…
        </div>
      )}
      <p className="mt-2 break-all text-center text-xs text-zinc-600">{payload}</p>
    </section>
  );
}
