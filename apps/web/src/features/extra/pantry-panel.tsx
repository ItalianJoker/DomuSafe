import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { PantryItem } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { problemText } from '@/lib/copy.js';
import { pantryItemsQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';

const touchControl =
  'min-h-12 w-full rounded-md border border-input bg-transparent px-3 text-[15px] text-foreground';

function blank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function canScanBarcode(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Manual pantry stock for the open house, with optional barcode and a lightweight camera scanner.
 *
 * Preconditions: the caller can read kitchen pantry items.
 * Postconditions: creates and edits persist in Postgres; the camera scanner uses the native detector only.
 * Data contract: no browser source of truth.
 *
 * @param props - Family, open house and write capability.
 * @returns The panel.
 */
export function PantryPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const items = useQuery(pantryItemsQuery(api, props.familyId, props.houseId));
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [barcode, setBarcode] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [minQuantity, setMinQuantity] = useState('');
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanSupported] = useState(canScanBarcode);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['pantry-items', props.familyId, props.houseId] });
  }

  function clearForm(): void {
    setEditing(null);
    setName('');
    setQuantity('1');
    setUnit('');
    setBarcode('');
    setExpiryDate('');
    setMinQuantity('');
  }

  function fillForm(item: PantryItem): void {
    setEditing(item);
    setName(item.name);
    setQuantity(String(item.quantity));
    setUnit(item.unit ?? '');
    setBarcode(item.barcode ?? '');
    setExpiryDate(item.expiryDate ?? '');
    setMinQuantity(item.minQuantity === null ? '' : String(item.minQuantity));
    setError(null);
  }

  function stopScan(): void {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
    setScanning(false);
  }

  useEffect(() => () => stopScan(), []);

  async function lookupBarcode(code: string): Promise<void> {
    setBarcode(code);
    try {
      const product = await api.getBarcodeProduct(props.familyId, code);
      if (name.trim() === '') {
        setName(product.name);
      }
      if (unit.trim() === '' && product.defaultUnit !== null) {
        setUnit(product.defaultUnit);
      }
    } catch {
      // Unknown code: keep the typed or scanned value for manual naming.
    }
  }

  async function startScan(): Promise<void> {
    if (!scanSupported || !('mediaDevices' in navigator)) {
      setError(m.extraPantryScanUnsupported());
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (video === null) {
          return;
        }
        video.srcObject = stream;
        void video.play();
      });
      const Detector = (
        window as unknown as {
          BarcodeDetector: new (options?: { formats?: string[] }) => {
            detect: (source: ImageBitmapSource) => Promise<readonly { rawValue: string }[]>;
          };
        }
      ).BarcodeDetector;
      const detector = new Detector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'],
      });
      scanTimerRef.current = window.setInterval(() => {
        const video = videoRef.current;
        if (video === null || video.readyState < 2) {
          return;
        }
        void detector.detect(video).then((detected) => {
          const first = detected[0];
          if (first === undefined || first.rawValue.trim() === '') {
            return;
          }
          stopScan();
          void lookupBarcode(first.rawValue.trim());
        });
      }, 500);
    } catch {
      stopScan();
      setError(m.extraPantryScanFailed());
    }
  }

  async function saveItem(): Promise<void> {
    if (name.trim() === '') {
      setError(m.extraPantryNeedName());
      return;
    }
    const quantityNumber = Number(quantity);
    if (!Number.isFinite(quantityNumber) || quantityNumber < 0) {
      setError(m.extraPantryNeedQuantity());
      return;
    }
    const minNumber = minQuantity.trim() === '' ? null : Number(minQuantity);
    if (minNumber !== null && (!Number.isFinite(minNumber) || minNumber < 0)) {
      setError(m.extraPantryNeedMinQuantity());
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        quantity: quantityNumber,
        unit: blank(unit),
        barcode: blank(barcode),
        expiryDate: blank(expiryDate),
        minQuantity: minNumber,
      };
      if (editing === null) {
        await api.createPantryItem(props.familyId, props.houseId, crypto.randomUUID(), body);
      } else {
        await api.updatePantryItem(props.familyId, props.houseId, editing.id, editing.version, body);
      }
      clearForm();
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function removeItem(item: PantryItem): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await api.deletePantryItem(props.familyId, props.houseId, item.id, item.version);
      if (editing?.id === item.id) {
        clearForm();
      }
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  const lowStock = (item: PantryItem): boolean =>
    item.minQuantity !== null && item.quantity <= item.minQuantity;

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-[15px] font-medium">{m.extraPantryTitle()}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.extraPantryLead()}</p>
      </div>

      {props.canWrite ? (
        <div className="grid gap-3">
          <h3 className="text-[13px] font-medium">
            {editing === null ? m.extraPantryCreate() : m.extraPantryEdit()}
          </h3>
          <Field label={m.extraPantryName()} htmlFor="pantry-name">
            <Input
              id="pantry-name"
              className={touchControl}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={m.extraPantryQuantity()} htmlFor="pantry-quantity">
              <Input
                id="pantry-quantity"
                className={touchControl}
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
            <Field label={m.extraPantryUnit()} htmlFor="pantry-unit">
              <Input
                id="pantry-unit"
                className={touchControl}
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
              />
            </Field>
          </div>
          <Field label={m.extraPantryBarcode()} htmlFor="pantry-barcode">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                id="pantry-barcode"
                className={touchControl}
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                onBlur={() => {
                  const code = barcode.trim();
                  if (code !== '') {
                    void lookupBarcode(code);
                  }
                }}
              />
              {scanSupported ? (
                <Button
                  type="button"
                  size="emergency"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    if (scanning) {
                      stopScan();
                    } else {
                      void startScan();
                    }
                  }}
                >
                  {scanning ? m.extraPantryScanStop() : m.extraPantryScan()}
                </Button>
              ) : null}
            </div>
          </Field>
          {scanning ? (
            <div className="overflow-hidden rounded-md border border-border bg-black">
              <video ref={videoRef} className="max-h-64 w-full object-cover" muted playsInline />
              <p className="px-3 py-2 text-[13px] text-muted-foreground">{m.extraPantryScanHint()}</p>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={m.extraPantryExpiry()} htmlFor="pantry-expiry">
              <Input
                id="pantry-expiry"
                className={touchControl}
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
              />
            </Field>
            <Field label={m.extraPantryMinQuantity()} htmlFor="pantry-min-quantity">
              <Input
                id="pantry-min-quantity"
                className={touchControl}
                inputMode="decimal"
                value={minQuantity}
                onChange={(event) => setMinQuantity(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="emergency" disabled={pending} onClick={() => void saveItem()}>
              {editing === null ? m.extraPantrySave() : m.extraPantrySaveEdit()}
            </Button>
            {editing === null ? null : (
              <Button type="button" size="emergency" variant="outline" disabled={pending} onClick={clearForm}>
                {m.extraCancel()}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">{m.extraPantryReadOnly()}</p>
      )}

      {error === null ? null : <p className="text-[13px] text-destructive">{error}</p>}

      <div>
        <h3 className="mb-2 text-[13px] font-medium">{m.extraPantryList()}</h3>
        {items.isLoading ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
        {items.data?.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{m.extraPantryEmpty()}</p>
        ) : null}
        <ul className="grid gap-2">
          {(items.data ?? []).map((item) => (
            <li key={item.id} className="rounded-md border border-border px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[15px] font-medium">{item.name}</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {m.extraPantryMeta({
                      quantity: String(item.quantity),
                      unit: item.unit ?? '—',
                      barcode: item.barcode ?? '—',
                      expiry: item.expiryDate ?? '—',
                    })}
                  </p>
                  {lowStock(item) ? (
                    <p className="mt-1 text-[13px] text-destructive">{m.extraPantryLowStock()}</p>
                  ) : null}
                </div>
                {props.canWrite ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="emergency"
                      variant="outline"
                      disabled={pending}
                      onClick={() => fillForm(item)}
                    >
                      {m.extraEdit()}
                    </Button>
                    <Button
                      type="button"
                      size="emergency"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void removeItem(item)}
                    >
                      {m.extraDelete()}
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
