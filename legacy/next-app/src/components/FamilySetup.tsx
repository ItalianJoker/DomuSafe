'use client';

/**
 * Post-registrazione: crea Famiglia (primo utente) o unisciti via invito/QR.
 */

import { useState } from 'react';
import { Home, Loader2, QrCode, Users } from 'lucide-react';
import { DomuSafeLogo } from '@/components/DomuSafeLogo';
import { TouchField } from '@/components/TouchField';
import { useSession } from '@/lib/session-context';

export function FamilySetup() {
  const { createOwnedFamily, joinFamily, logout, error, peekInviteFromHash } =
    useSession();
  const [mode, setMode] = useState<'create' | 'join'>(() =>
    peekInviteFromHash() ? 'join' : 'create'
  );
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState(
    () => peekInviteFromHash() ?? ''
  );
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setLocalError(null);
    try {
      if (mode === 'create') {
        await createOwnedFamily(familyName);
      } else {
        await joinFamily(inviteCode);
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Operazione non riuscita');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(100%_80%_at_50%_0%,#1a3d2e_0%,#0b1f17_100%)] px-4 py-10 text-[var(--brand-cream)]">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <DomuSafeLogo size={48} />
          <div>
            <h1 className="font-display text-2xl font-black text-white">
              La tua Famiglia
            </h1>
            <p className="text-sm text-emerald-100/80">
              Workspace condiviso per case e runbook
            </p>
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md border-2 px-3 font-bold ${
              mode === 'create'
                ? 'border-[var(--brand-gold)] bg-[var(--brand-gold)] text-[var(--brand-ink)]'
                : 'border-emerald-200/40 text-white'
            }`}
            onClick={() => setMode('create')}
          >
            <Home className="size-5" aria-hidden />
            Crea
          </button>
          <button
            type="button"
            className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md border-2 px-3 font-bold ${
              mode === 'join'
                ? 'border-[var(--brand-gold)] bg-[var(--brand-gold)] text-[var(--brand-ink)]'
                : 'border-emerald-200/40 text-white'
            }`}
            onClick={() => setMode('join')}
          >
            <QrCode className="size-5" aria-hidden />
            Unisciti
          </button>
        </div>

        <section className="rounded-2xl border-2 border-[var(--brand-gold)]/40 bg-[var(--brand-ink)]/80 p-5">
          {mode === 'create' ? (
            <>
              <p className="mb-3 flex items-start gap-2 text-sm text-emerald-50">
                <Users className="mt-0.5 size-5 shrink-0" aria-hidden />
                Sei il primo? Crea la Famiglia: poi invita gli altri con link o
                QR.
              </p>
              <TouchField
                label="Nome Famiglia"
                value={familyName}
                onChange={setFamilyName}
                placeholder="Es. Famiglia Rossi"
                labelClassName="text-emerald-50"
              />
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-emerald-50">
                Incolla il codice invito o il link ricevuto (anche da QR).
              </p>
              <TouchField
                label="Codice / link invito"
                value={inviteCode}
                onChange={setInviteCode}
                placeholder="df1.… oppure link con #invite="
                labelClassName="text-emerald-50"
              />
            </>
          )}

          {(localError || error) && (
            <p
              className="mt-3 rounded-md border-2 border-red-400 bg-red-950/60 px-3 py-2 text-sm font-semibold text-red-100"
              role="alert"
            >
              {localError || error}
            </p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border-2 border-[var(--brand-gold)] bg-[var(--brand-gold)] px-4 font-black text-[var(--brand-ink)] disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : null}
            {mode === 'create' ? 'Crea Famiglia' : 'Entra nella Famiglia'}
          </button>
        </section>

        <button
          type="button"
          className="mt-4 min-h-12 w-full rounded-md border-2 border-white/20 font-bold text-emerald-50 hover:bg-white/5"
          onClick={() => void logout()}
        >
          Esci
        </button>
      </div>
    </div>
  );
}
