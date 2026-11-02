'use client';

/**
 * Inviti Famiglia: genera link + QR per aggiungere membri.
 */

import { useEffect, useState } from 'react';
import { Copy, Loader2, QrCode, Users } from 'lucide-react';
import type { DomuFamily } from '@/types/account';
import { buildInviteUrl } from '@/lib/family';
import { generateQrSvg } from '@/lib/qr';

interface FamilyInvitePanelProps {
  family: DomuFamily;
  onCreateInvite: () => Promise<{ inviteCode: string } | null>;
}

export function FamilyInvitePanel({
  family,
  onCreateInvite,
}: FamilyInvitePanelProps) {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteCode) return;
    let active = true;
    const url = buildInviteUrl(
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
      inviteCode
    );
    generateQrSvg(url)
      .then((svg) => {
        if (active) setQrSvg(svg);
      })
      .catch(() => {
        if (active) setQrSvg(null);
      });
    return () => {
      active = false;
    };
  }, [inviteCode]);

  const create = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const result = await onCreateInvite();
      if (result) {
        setQrSvg(null);
        setInviteCode(result.inviteCode);
        setStatus('Invito creato: condividi link o QR.');
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Invito non creato');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!inviteCode) return;
    const url = buildInviteUrl(window.location.origin, inviteCode);
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Link copiato.');
    } catch {
      setStatus(url);
    }
  };

  return (
    <section className="rounded-lg border-2 border-zinc-900 bg-white p-4">
      <h3 className="inline-flex items-center gap-2 text-lg font-black">
        <Users className="size-5" aria-hidden />
        Famiglia «{family.name}»
      </h3>
      <p className="mt-1 text-sm text-zinc-700">
        Membri: {family.members.map((m) => m.displayName).join(', ')}
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => void create()}
        className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-zinc-950 px-4 font-bold text-white disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : (
          <QrCode className="size-5" aria-hidden />
        )}
        Crea invito + QR
      </button>

      {inviteCode ? (
        <div className="mt-4 space-y-3">
          <p className="break-all rounded-md bg-zinc-100 px-3 py-2 font-mono text-xs">
            {inviteCode}
          </p>
          <button
            type="button"
            className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold"
            onClick={() => void copy()}
          >
            <Copy className="size-5" aria-hidden />
            Copia link invito
          </button>
          {qrSvg ? (
            <div
              className="mx-auto w-48 [&_svg]:size-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : null}
        </div>
      ) : null}

      {status ? (
        <p className="mt-3 text-sm font-semibold text-zinc-800" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}
