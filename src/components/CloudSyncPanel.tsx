'use client';

/**
 * Pannello Cloud Sync E2EE (ADVANCED+ / allowCloudSync).
 * Flusso: crea stanza → cifra collezione → upload → QR pairing multi-device.
 * BASIC non raggiunge questo componente (FeatureGate nel parent).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  CloudUpload,
  Download,
  KeyRound,
  Link2,
  Loader2,
  QrCode,
  RefreshCw,
  Unplug,
} from 'lucide-react';
import type { DomusHouseCollection } from '@/lib/storage';
import {
  buildPairingUrl,
  createSyncIdentity,
  decryptHouseCollection,
  encodePairingPayload,
  encryptHouseCollection,
  isSyncCredentialsError,
  keyBytesFromSession,
  parsePairingPayload,
  resolveSyncKeyBytes,
  sessionFromIdentity,
  SYNC_CREDENTIALS_ERROR_MESSAGE,
  type SyncSession,
} from '@/lib/crypto-sync';
import {
  clearSyncSession,
  loadSyncSession,
  saveSyncSession,
} from '@/lib/sync-session';
import {
  fetchSyncEnvelope,
  SyncHttpError,
  uploadSyncEnvelope,
} from '@/lib/sync-client';
import { generateQrSvg } from '@/lib/qr';
import { FieldLabel, TouchInput, TouchTextarea } from '@/components/TouchField';

interface CloudSyncPanelProps {
  collection: DomusHouseCollection;
  familyId: string;
  dataKey: CryptoKey;
  /** Sostituisce la collezione Famiglia dopo download/merge. */
  onCollectionImported: (collection: DomusHouseCollection) => Promise<void>;
  onStatus: (message: string) => void;
}

/** Legge `#ds1.…` dall'URL al primo render client (secondo device). */
function readInitialPairingImport(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const fromHash = parsePairingPayload(window.location.hash || '');
  if (!fromHash) {
    return '';
  }
  return encodePairingPayload(fromHash.syncId, fromHash.keyBytes);
}

export function CloudSyncPanel({
  collection,
  familyId,
  dataKey,
  onCollectionImported,
  onStatus,
}: CloudSyncPanelProps) {
  const [session, setSession] = useState<SyncSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [pairingSvg, setPairingSvg] = useState<string | null>(null);
  // Hash pairing letto una volta all'init (evita setState sincrono in effect).
  const [importText, setImportText] = useState(readInitialPairingImport);
  const [pin, setPin] = useState('');

  const refreshPairingQr = useCallback(async (url: string) => {
    try {
      const svg = await generateQrSvg(url, 200);
      setPairingSvg(svg);
    } catch {
      setPairingSvg(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadSyncSession(familyId, dataKey).then((stored) => {
      if (!active || !stored) return;
      setSession(stored);
      const keyBytes = keyBytesFromSession(stored);
      const url = buildPairingUrl(
        window.location.origin,
        stored.syncId,
        keyBytes
      );
      setPairingUrl(url);
      void refreshPairingQr(url);
    });

    return () => {
      active = false;
    };
  }, [refreshPairingQr, familyId, dataKey]);

  const createRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const { syncId, keyBytes } = createSyncIdentity();
      const nextRevision = 1;
      const { envelope } = await encryptHouseCollection(collection, {
        revision: nextRevision,
        keyBytes,
      });
      // Invariante: plaintext mai nella request — solo envelope.
      await uploadSyncEnvelope(syncId, envelope);
      const next = sessionFromIdentity(
        syncId,
        keyBytes,
        envelope.revision,
        envelope.updatedAt
      );
      await saveSyncSession(familyId, dataKey, next);
      setSession(next);
      const url = buildPairingUrl(window.location.origin, syncId, keyBytes);
      setPairingUrl(url);
      await refreshPairingQr(url);
      onStatus('Stanza sync creata. Condividi il QR con gli altri device.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Creazione sync non riuscita'
      );
    } finally {
      setBusy(false);
    }
  };

  const pushNow = async (force = false) => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const revision = session.revision + 1;
      // PIN opzionale: nuova salt + chiave derivata; altrimenti riusa chiave QR.
      const sealed = pin.trim()
        ? await encryptHouseCollection(collection, {
            revision,
            pin: pin.trim(),
          })
        : await encryptHouseCollection(collection, {
            revision,
            keyBytes: keyBytesFromSession(session),
          });

      const uploaded = await uploadSyncEnvelope(
        session.syncId,
        sealed.envelope,
        { force }
      );
      const next = sessionFromIdentity(
        session.syncId,
        sealed.keyBytes,
        uploaded.revision,
        uploaded.updatedAt
      );
      await saveSyncSession(familyId, dataKey, next);
      setSession(next);
      const url = buildPairingUrl(
        window.location.origin,
        next.syncId,
        sealed.keyBytes
      );
      setPairingUrl(url);
      await refreshPairingQr(url);
      onStatus(`Sync caricata (revisione ${uploaded.revision}).`);
    } catch (err) {
      if (err instanceof SyncHttpError && err.status === 409) {
        setError(
          'Conflitto di versione: scarica prima le modifiche remote, oppure forza sovrascrittura.'
        );
      } else if (isSyncCredentialsError(err)) {
        setError(SYNC_CREDENTIALS_ERROR_MESSAGE);
      } else {
        setError(err instanceof Error ? err.message : 'Upload non riuscito');
      }
    } finally {
      setBusy(false);
    }
  };

  const pullNow = async () => {
    if (!session && !importText.trim() && !pin.trim()) {
      setError('Incolla il codice pairing o crea una stanza sync.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let syncId = session?.syncId;
      let keyBytes = session ? keyBytesFromSession(session) : undefined;

      const parsed = importText.trim()
        ? parsePairingPayload(importText.trim())
        : null;
      if (parsed) {
        syncId = parsed.syncId;
        keyBytes = parsed.keyBytes;
      }

      if (!syncId) {
        throw new Error('syncId mancante');
      }

      const envelope = await fetchSyncEnvelope(syncId);
      if (!envelope) {
        throw new Error('Nessun backup sync trovato per questo codice.');
      }

      const decrypted = await decryptHouseCollection(envelope, {
        keyBytes,
        pin: pin.trim() || undefined,
      });

      const nextKey = await resolveSyncKeyBytes(envelope, {
        keyBytes,
        pin: pin.trim() || undefined,
      });

      const next = sessionFromIdentity(
        syncId,
        nextKey,
        envelope.revision,
        envelope.updatedAt
      );
      await saveSyncSession(familyId, dataKey, next);
      setSession(next);
      await onCollectionImported(decrypted);
      const url = buildPairingUrl(window.location.origin, syncId, nextKey);
      setPairingUrl(url);
      await refreshPairingQr(url);
      // Pulisci hash pairing dopo import riuscito.
      if (window.location.hash.startsWith('#ds1.')) {
        history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}`
        );
      }
      onStatus(
        `Sync scaricata (revisione ${envelope.revision}). Dati importati in locale.`
      );
    } catch (err) {
      if (isSyncCredentialsError(err)) {
        setError(SYNC_CREDENTIALS_ERROR_MESSAGE);
      } else {
        setError(err instanceof Error ? err.message : 'Download non riuscito');
      }
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await clearSyncSession(familyId);
    setSession(null);
    setPairingUrl(null);
    setPairingSvg(null);
    setImportText('');
    onStatus('Sessione sync rimossa dall’account Famiglia.');
  };

  return (
    <section
      aria-labelledby="sync-title"
      className="space-y-4 rounded-lg border-2 border-zinc-900 bg-white p-4"
    >
      <h2
        id="sync-title"
        className="flex items-center gap-2 text-lg font-bold text-zinc-950"
      >
        <CloudUpload className="size-6" aria-hidden />
        Sync cloud cifrata (E2EE)
      </h2>
      <p className="text-sm text-zinc-700">
        I dati vengono cifrati sul dispositivo <strong>prima</strong> di
        qualsiasi invio. Il server self-host memorizza solo ciphertext. Usa il
        QR per collegare un altro telefono o PC.
      </p>

      {session ? (
        <p className="rounded-md border-2 border-emerald-800 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950">
          Collegato · revisione {session.revision} · aggiornato{' '}
          {new Date(session.updatedAt).toLocaleString('it-IT')}
        </p>
      ) : (
        <p className="rounded-md border-2 border-zinc-400 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
          Nessuna sessione sync su questo dispositivo.
        </p>
      )}

      {error ? (
        <p className="font-semibold text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {!session ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void createRoom()}
            className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-emerald-700 px-4 font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Link2 className="size-5" aria-hidden />
            )}
            Crea sync + QR
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void pushNow(false)}
              className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-emerald-700 px-4 font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <CloudUpload className="size-5" aria-hidden />
              )}
              Carica cifrato
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void pushNow(true)}
              className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold hover:bg-zinc-100 disabled:opacity-60"
            >
              <RefreshCw className="size-5" aria-hidden />
              Forza sovrascrittura
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void disconnect()}
              className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold hover:bg-zinc-100 disabled:opacity-60"
            >
              <Unplug className="size-5" aria-hidden />
              Scollega
            </button>
          </>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void pullNow()}
          className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-zinc-950 px-4 font-bold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Download className="size-5" aria-hidden />
          )}
          Scarica / collega device
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="sync-import">
            Codice o link pairing (QR)
          </FieldLabel>
          <TouchTextarea
            id="sync-import"
            rows={3}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Incolla ds1.… oppure URL con #ds1.…"
          />
        </div>
        <div>
          <FieldLabel htmlFor="sync-pin">
            PIN sync opzionale (senza QR)
          </FieldLabel>
          <TouchInput
            id="sync-pin"
            type="password"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Solo se usi PIN al posto del QR"
          />
          <p className="mt-2 flex items-start gap-2 text-xs text-zinc-600">
            <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
            Il PIN deriva la chiave via PBKDF2; con PIN errato vedi «
            {SYNC_CREDENTIALS_ERROR_MESSAGE}».
          </p>
        </div>
      </div>

      {pairingUrl ? (
        <div className="border-t-2 border-zinc-200 pt-4">
          <h3 className="mb-2 flex items-center gap-2 font-bold">
            <QrCode className="size-5" aria-hidden />
            QR multi-dispositivo
          </h3>
          <p className="mb-3 text-sm text-zinc-700">
            Inquadra da un altro device sulla stessa installazione DomuSafe.
            Il frammento URL contiene la chiave: non condividere screenshot
            pubblici.
          </p>
          {pairingSvg ? (
            <div
              className="mx-auto w-52 [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: pairingSvg }}
            />
          ) : null}
          <p className="mt-2 break-all text-center text-xs text-zinc-600">
            {pairingUrl}
          </p>
        </div>
      ) : null}
    </section>
  );
}
