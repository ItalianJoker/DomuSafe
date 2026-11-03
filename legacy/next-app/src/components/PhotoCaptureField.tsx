'use client';

/**
 * Cattura / carica foto compressa (valvole, quadro, residente).
 */

import { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { compressImageToDataUrl } from '@/lib/compress-image';
import { FieldLabel } from '@/components/TouchField';

interface PhotoCaptureFieldProps {
  label: string;
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  hint?: string;
}

export function PhotoCaptureField({
  label,
  value,
  onChange,
  hint = 'Foto compressa in-app (opzionale).',
}: PhotoCaptureFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (!dataUrl) {
        setError('Foto troppo grande o non supportata. Prova un’altra immagine.');
        return;
      }
      onChange(dataUrl);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <p className="text-xs text-zinc-600">{hint}</p>
      {value ? (
        <div className="flex flex-wrap items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            className="h-24 w-32 rounded-md border-2 border-zinc-900 object-cover"
          />
          <button
            type="button"
            className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-red-800 bg-red-50 px-3 font-bold text-red-950"
            onClick={() => onChange(undefined)}
          >
            <Trash2 className="size-4" aria-hidden />
            Rimuovi foto
          </button>
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        disabled={busy}
        className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold disabled:opacity-50"
        onClick={() => inputRef.current?.click()}
      >
        <Camera className="size-5" aria-hidden />
        {busy ? 'Compressione…' : value ? 'Sostituisci foto' : 'Scatta o carica'}
      </button>
      {error ? (
        <p className="text-sm font-semibold text-red-800" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
