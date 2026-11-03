'use client';

/**
 * Export / import JSON del runbook Famiglia (backup account SoT).
 * Solo lato client dopo sblocco; nessun dato in chiaro sul server.
 */

import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import type { DomusHouseCollection } from '@/lib/storage';

interface JsonBackupPanelProps {
  collection: DomusHouseCollection;
  onImport: (next: DomusHouseCollection) => Promise<void>;
  onStatus?: (msg: string) => void;
}

export function JsonBackupPanel({
  collection,
  onImport,
  onStatus,
}: JsonBackupPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(collection, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `domusafe-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onStatus?.('Backup JSON scaricato. Conservalo in un posto sicuro.');
  };

  const importJson = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as DomusHouseCollection;
      if (
        parsed.version !== '1.0.0' ||
        !Array.isArray(parsed.houses) ||
        !parsed.activeDocumentId
      ) {
        throw new Error('File JSON non riconosciuto come backup DomuSafe');
      }
      await onImport(parsed);
      onStatus?.('Backup JSON importato e salvato sull’account.');
    } catch (err) {
      onStatus?.(
        err instanceof Error ? err.message : 'Import JSON non riuscito'
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <section className="space-y-3 rounded-lg border-2 border-zinc-900 bg-white p-4">
      <h2 className="text-lg font-bold text-zinc-950">Backup JSON</h2>
      <p className="text-sm text-zinc-700">
        Scarica una copia delle case (già sbloccate su questo dispositivo) oppure
        ripristina da un file. I dati restano legati al tuo account.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-zinc-950 px-4 font-bold text-white"
          onClick={exportJson}
        >
          <Download className="size-5" aria-hidden />
          Esporta JSON
        </button>
        <button
          type="button"
          disabled={busy}
          className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold disabled:opacity-50"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-5" aria-hidden />
          Importa JSON
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importJson(file);
          }}
        />
      </div>
    </section>
  );
}
