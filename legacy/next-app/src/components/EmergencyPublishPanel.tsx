'use client';

/**
 * Pubblica / aggiorna QR break-glass L1+L2 (senza login per chi scansiona).
 * Chiave solo nel fragment URL — mai inviata al server.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link2, RefreshCw, Siren } from 'lucide-react';
import type { DomusRunbookDocument } from '@/types/domus';
import { buildEmergencyPack } from '@/lib/emergency-pack';
import {
  buildEmergencyUrl,
  createEmergencyKeyRaw,
  sealEmergencyPack,
} from '@/lib/crypto-emergency';
import { generateQrSvg } from '@/lib/qr';

interface EmergencyPublishPanelProps {
  familyId: string;
  familyName: string;
  document: DomusRunbookDocument;
  onStatus?: (msg: string) => void;
}

export function EmergencyPublishPanel({
  familyId,
  familyName,
  document,
  onStatus,
}: EmergencyPublishPanelProps) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(() => {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(`domusafe-emg-url:${familyId}`);
  });
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const publish = useCallback(
    async (rotateToken: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const keyRaw = createEmergencyKeyRaw();
        const pack = buildEmergencyPack({ familyName, document });
        const sealed = await sealEmergencyPack(pack, keyRaw);
        const res = await fetch(`/api/family/${familyId}/emergency`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rotateToken,
            blob: {
              ivBase64: sealed.ivBase64,
              ciphertextBase64: sealed.ciphertextBase64,
            },
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          token?: string;
        };
        if (!res.ok || !data.token) {
          throw new Error(data.error || 'Pubblicazione non riuscita');
        }
        const nextUrl = buildEmergencyUrl(
          window.location.origin,
          data.token,
          keyRaw
        );
        setUrl(nextUrl);
        const nextSvg = await generateQrSvg(nextUrl, 200);
        setSvg(nextSvg);
        // Conserva l’URL completo (con #k=) in sessionStorage per ristampa nella sessione.
        sessionStorage.setItem(`domusafe-emg-url:${familyId}`, nextUrl);
        onStatus?.(
          rotateToken
            ? 'Nuovo QR emergenza pubblicato (token ruotato).'
            : 'QR emergenza aggiornato con i dati attuali.'
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Errore pubblicazione');
      } finally {
        setBusy(false);
      }
    },
    [document, familyId, familyName, onStatus]
  );

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      void Promise.resolve().then(() => {
        if (!cancelled) setSvg(null);
      });
      return () => {
        cancelled = true;
      };
    }
    void generateQrSvg(url, 200)
      .then((next) => {
        if (!cancelled) setSvg(next);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <section className="space-y-4 rounded-lg border-2 border-red-900 bg-red-50 p-4">
      <header>
        <h2 className="flex items-center gap-2 text-lg font-black text-red-950">
          <Siren className="size-6" aria-hidden />
          QR emergenza (senza login)
        </h2>
        <p className="mt-1 text-sm text-red-950/80">
          Chi inquadra apre Casa e schede di emergenza sul telefono, senza account. Serve
          per il soccorso. Pubblica di nuovo dopo modifiche importanti.
        </p>
      </header>

      {error ? (
        <p className="font-semibold text-red-900" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-red-900 bg-red-700 px-4 font-bold text-white disabled:opacity-50"
          onClick={() => void publish(false)}
        >
          <RefreshCw className="size-5" aria-hidden />
          Pubblica / aggiorna
        </button>
        <button
          type="button"
          disabled={busy}
          className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold disabled:opacity-50"
          onClick={() => void publish(true)}
        >
          <Link2 className="size-5" aria-hidden />
          Nuovo QR (invalida il precedente)
        </button>
      </div>

      {svg && url ? (
        <div className="rounded-md border-2 border-zinc-900 bg-white p-3 text-center">
          <div
            className="mx-auto w-48 [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="mt-2 break-all text-xs text-zinc-600">{url}</p>
          <button
            type="button"
            className="mt-2 inline-flex min-h-12 items-center rounded-md border-2 border-zinc-900 bg-zinc-100 px-4 font-bold"
            onClick={() => void navigator.clipboard.writeText(url)}
          >
            Copia link emergenza
          </button>
        </div>
      ) : (
        <p className="text-sm text-zinc-700">
          Nessun QR in questa sessione: pubblica per generarne uno.
        </p>
      )}
    </section>
  );
}
