'use client';

/**
 * White-label host — Premium (customBranding).
 * Nome struttura, colore, logo piccolo: usati in stampa e pagina scan.
 */

import { useEffect, useState } from 'react';
import { Loader2, Palette } from 'lucide-react';
import type { FamilyBranding } from '@/types/premium';
import { FieldLabel, TouchInput } from '@/components/TouchField';

interface BrandingPanelProps {
  familyId: string;
  initial?: FamilyBranding | null;
  onSaved?: (branding: FamilyBranding | null) => void;
  onStatus?: (msg: string) => void;
}

const DEFAULT: FamilyBranding = {
  hostDisplayName: '',
  accentColor: '#0b1f17',
  tagline: '',
};

export function BrandingPanel({
  familyId,
  initial,
  onSaved,
  onStatus,
}: BrandingPanelProps) {
  const [form, setForm] = useState<FamilyBranding>(() =>
    initial ? { ...DEFAULT, ...initial } : DEFAULT
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/family/${familyId}/branding`)
      .then(async (res) => {
        const data = (await res.json()) as {
          branding?: FamilyBranding | null;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || 'Caricamento fallito');
        if (!cancelled && data.branding) {
          setForm({ ...DEFAULT, ...data.branding });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  const onLogoFile = (file: File | null) => {
    if (!file) {
      setForm((f) => ({ ...f, logoDataUrl: undefined }));
      return;
    }
    if (file.size > 36_000) {
      setError('Logo troppo grande (max ~35 KB). Usa un SVG o PNG piccolo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setForm((f) => ({ ...f, logoDataUrl: result || undefined }));
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/family/${familyId}/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branding: {
            hostDisplayName: form.hostDisplayName,
            accentColor: form.accentColor,
            tagline: form.tagline || undefined,
            logoDataUrl: form.logoDataUrl,
          },
        }),
      });
      const data = (await res.json()) as {
        branding?: FamilyBranding | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Salvataggio fallito');
      onSaved?.(data.branding ?? null);
      onStatus?.('Branding host salvato.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/family/${familyId}/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branding: null }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Reset fallito');
      setForm(DEFAULT);
      onSaved?.(null);
      onStatus?.('Branding ripristinato a DomuSafe.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="branding-title"
      className="rounded-lg border-2 border-zinc-900 bg-white p-4"
    >
      <h2
        id="branding-title"
        className="flex items-center gap-2 font-display text-lg font-black"
      >
        <Palette className="size-6" aria-hidden />
        Marchio host (white-label)
      </h2>
      <p className="mt-1 text-sm text-zinc-700">
        Personalizza nome e colore sulla stampa e sulla pagina QR per gli
        ospiti. Solo Premium.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Nome host / struttura</FieldLabel>
          <TouchInput
            value={form.hostDisplayName}
            placeholder="Es. Casa Rosa · Firenze"
            onChange={(e) =>
              setForm((f) => ({ ...f, hostDisplayName: e.target.value }))
            }
          />
        </div>
        <div>
          <FieldLabel>Colore accento</FieldLabel>
          <div className="flex gap-2">
            <input
              type="color"
              aria-label="Colore accento"
              className="h-12 w-14 cursor-pointer rounded-md border-2 border-zinc-900 bg-white p-1"
              value={form.accentColor}
              onChange={(e) =>
                setForm((f) => ({ ...f, accentColor: e.target.value }))
              }
            />
            <TouchInput
              value={form.accentColor}
              onChange={(e) =>
                setForm((f) => ({ ...f, accentColor: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>Sottotitolo</FieldLabel>
          <TouchInput
            value={form.tagline ?? ''}
            placeholder="Es. Benvenuti · Wi‑Fi e utenze"
            onChange={(e) =>
              setForm((f) => ({ ...f, tagline: e.target.value }))
            }
          />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>Logo (opzionale, file piccolo)</FieldLabel>
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="block w-full text-sm"
            onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)}
          />
          {form.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.logoDataUrl}
              alt="Anteprima logo host"
              className="mt-2 h-14 w-auto rounded border border-zinc-300 bg-white object-contain"
            />
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-zinc-950 px-4 font-bold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
          Salva branding
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void clear()}
          className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold disabled:opacity-60"
        >
          Ripristina DomuSafe
        </button>
      </div>

      {error ? (
        <p className="mt-3 font-semibold text-red-800" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
