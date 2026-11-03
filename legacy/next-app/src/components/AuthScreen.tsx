'use client';

/**
 * Landing/auth registration-first — brand hero, zero runbook senza sessione.
 */

import { useState } from 'react';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { DomuSafeLogo } from '@/components/DomuSafeLogo';
import { ThemeSelector } from '@/components/ThemeSelector';
import { TouchField } from '@/components/TouchField';
import { useSession } from '@/lib/session-context';

export function AuthScreen() {
  const { register, login, unlock, status, error } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isUnlock = status === 'needs_unlock';

  const submit = async () => {
    setBusy(true);
    setLocalError(null);
    try {
      if (isUnlock) {
        await unlock(password);
      } else if (mode === 'register') {
        await register({ email, password, displayName });
      } else {
        await login({ email, password });
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Operazione non riuscita');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(120%_80%_at_10%_0%,#1a3d2e_0%,#0b1f17_45%,#07140f_100%)] text-[var(--brand-cream)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(240,180,41,0.06) 24px), repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(240,180,41,0.04) 24px)',
        }}
        aria-hidden
      />

      <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-8 sm:px-6 sm:py-12 md:max-w-xl">
        <div className="mb-4 flex justify-end">
          <ThemeSelector compact />
        </div>
        <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
          <DomuSafeLogo size={88} className="mb-4 drop-shadow-lg" />
          <h1 className="font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            DomuSafe
          </h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-emerald-100/90 sm:text-lg">
            Il manuale della tua casa e le info di emergenza, al sicuro.
            Crea un account, invita la Famiglia, usa telefono, tablet o
            computer.
          </p>
        </div>

        <section className="rounded-2xl border-2 border-[var(--brand-gold)]/40 bg-[var(--brand-ink)]/80 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur sm:p-6">
          <h2 className="font-display text-xl font-bold text-white sm:text-2xl">
            {isUnlock
              ? 'Riscrivi la password'
              : mode === 'register'
                ? 'Inizia qui'
                : 'Bentornato'}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-emerald-100/80 sm:text-base">
            {isUnlock
              ? 'Per proteggere i dati ti chiediamo la password a ogni apertura su questo dispositivo.'
              : 'Servono pochi secondi: email e una password che ricordi.'}
          </p>

          <div className="mt-4 space-y-3">
            {!isUnlock ? (
              <>
                {mode === 'register' ? (
                  <TouchField
                    label="Nome"
                    value={displayName}
                    onChange={setDisplayName}
                    placeholder="Come ti chiami"
                    autoComplete="name"
                    labelClassName="text-emerald-50"
                  />
                ) : null}
                <TouchField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="tu@email.it"
                  autoComplete="email"
                  labelClassName="text-emerald-50"
                />
              </>
            ) : null}
            <TouchField
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder={isUnlock ? 'Password account' : 'Minimo 8 caratteri'}
              autoComplete={
                isUnlock || mode === 'login' ? 'current-password' : 'new-password'
              }
              labelClassName="text-emerald-50"
            />
          </div>

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
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border-2 border-[var(--brand-gold)] bg-[var(--brand-gold)] px-4 text-base font-black text-[var(--brand-ink)] hover:brightness-110 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : isUnlock || mode === 'login' ? (
              <LogIn className="size-5" aria-hidden />
            ) : (
              <UserPlus className="size-5" aria-hidden />
            )}
            {isUnlock
              ? 'Sblocca'
              : mode === 'register'
                ? 'Registrati'
                : 'Accedi'}
          </button>

          {!isUnlock ? (
            <button
              type="button"
              className="mt-3 min-h-12 w-full rounded-md border-2 border-emerald-200/40 bg-transparent px-4 font-bold text-emerald-50 hover:bg-white/5"
              onClick={() =>
                setMode((m) => (m === 'register' ? 'login' : 'register'))
              }
            >
              {mode === 'register'
                ? 'Hai già un account? Accedi'
                : 'Nuovo qui? Crea account'}
            </button>
          ) : null}
        </section>
      </main>
    </div>
  );
}
