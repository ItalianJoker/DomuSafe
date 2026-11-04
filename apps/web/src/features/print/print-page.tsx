import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  formatHouseAddress,
  type House,
  type Me,
  type Publication,
  type PublicationKind,
} from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { PageHeader } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { problemText } from '@/lib/copy.js';
import { roleAllows } from '@/lib/permissions.js';
import { publicationsQuery, rescueSheetQuery, shutoffsQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import {
  currentPublication,
  essentialPeople,
  housePagePath,
  primaryEmergencyContact,
  printedTrades,
  rescuePagePath,
  sheetHasWatermark,
  sheetUrl,
  wallBoxes,
} from './model.js';
import { CompactSheet, WallSheet } from './sheets.js';

function hasToken(publication: Publication | null): publication is Publication & { readonly token: string } {
  return publication !== null && publication.token !== null;
}

function scanText(iso: string | null): string {
  if (iso === null) {
    return m.printNeverScanned();
  }
  const formatted = new Intl.DateTimeFormat(getLocale() === 'en' ? 'en' : 'it', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
  return `${m.printLastScan()}: ${formatted}`;
}

/**
 * Print section of the open house.
 *
 * Preconditions: `house` belongs to `familyId`.
 * Postconditions: only people who can edit the house prepare codes and see the last reading.
 * Data contract: the sheets are built from cutoffs, artisans and the rescue sheet. The mark follows the plan.
 *
 * @param props - Account and the open house.
 * @returns The section.
 */
export function PrintPage(props: { readonly me: Me; readonly familyId: string; readonly house: House }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const role = props.me.families.find((family) => family.id === props.familyId)?.role;
  const tier = props.me.families.find((family) => family.id === props.familyId)?.plan ?? 'free';
  const canManage = role !== undefined && roleAllows(role, 'qr.manage');
  const shutoffs = useQuery({
    ...shutoffsQuery(api, props.familyId, props.house.id),
    enabled: canManage,
  });
  const trades = useQuery({
    queryKey: ['print-trades', props.familyId, props.house.id] as const,
    queryFn: () => api.listContacts(props.familyId, { kind: 'craftsman', houseId: props.house.id }),
    enabled: canManage,
  });
  const rescue = useQuery({
    ...rescueSheetQuery(api, props.familyId, props.house.id),
    enabled: canManage,
  });
  const codes = useQuery({
    ...publicationsQuery(api, props.familyId, props.house.id),
    enabled: canManage,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PublicationKind | null>(null);

  useEffect(() => {
    const clear = () => {
      delete document.documentElement.dataset.printSheet;
    };
    window.addEventListener('afterprint', clear);
    return () => {
      window.removeEventListener('afterprint', clear);
    };
  }, []);

  if (!canManage) {
    return (
      <section>
        <PageHeader title={m.printTitle()} lead={m.printLead()} />
        <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">{m.printUnavailable()}</p>
      </section>
    );
  }

  const pending = shutoffs.isPending || trades.isPending || rescue.isPending || codes.isPending;
  const failed = shutoffs.error ?? trades.error ?? rescue.error ?? codes.error;
  if (pending) {
    return <p className="text-[13px] text-muted-foreground">{m.loading()}</p>;
  }
  if (failed !== null) {
    return (
      <p role="alert" className="text-[13px] text-destructive">
        {problemText(failed)}
      </p>
    );
  }
  if (
    shutoffs.data === undefined ||
    trades.data === undefined ||
    rescue.data === undefined ||
    codes.data === undefined
  ) {
    return <p className="text-[13px] text-muted-foreground">{m.loading()}</p>;
  }

  const origin = window.location.origin;
  const houseCode = currentPublication(codes.data, 'house_page');
  const rescueCode = currentPublication(codes.data, 'rescue_sheet');
  const houseUrl = hasToken(houseCode) ? sheetUrl(origin, housePagePath(houseCode.token)) : null;
  const rescueUrl = hasToken(rescueCode) ? sheetUrl(origin, rescuePagePath(rescueCode.token)) : null;
  const ready = houseUrl !== null && rescueUrl !== null;

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['publications', props.familyId, props.house.id] });
  }

  async function prepare(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.ensurePublication(props.familyId, props.house.id, 'house_page', crypto.randomUUID());
      await api.ensurePublication(props.familyId, props.house.id, 'rescue_sheet', crypto.randomUUID());
      await refresh();
    } catch (cause) {
      setError(problemText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(kind: PublicationKind): Promise<void> {
    const publication = kind === 'house_page' ? houseCode : rescueCode;
    if (!hasToken(publication)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.revokePublication(props.familyId, props.house.id, publication.id, publication.version);
      setConfirm(null);
      await refresh();
    } catch (cause) {
      setError(problemText(cause));
    } finally {
      setBusy(false);
    }
  }

  function printSheet(kind: 'wall' | 'compact'): void {
    document.documentElement.dataset.printSheet = kind;
    window.print();
  }

  return (
    <section className="grid gap-6">
      <div className="print:hidden">
        <PageHeader title={m.printTitle()} lead={m.printLead()} />
        <div className="flex flex-wrap gap-3">
          {ready ? null : (
            <Button size="emergency" disabled={busy} onClick={() => void prepare()}>
              {m.printPrepare()}
            </Button>
          )}
          <Button size="emergency" disabled={!ready} onClick={() => printSheet('wall')}>
            {m.printWallAction()}
          </Button>
          <Button size="emergency" disabled={!ready} onClick={() => printSheet('compact')}>
            {m.printCompactAction()}
          </Button>
        </div>
        <div className="mt-4 grid gap-2 text-[13px] text-muted-foreground">
          <p>
            {m.printHouseCode()}: {scanText(houseCode?.lastScannedAt ?? null)}
          </p>
          <p>
            {m.printRescueCode()}: {scanText(rescueCode?.lastScannedAt ?? null)}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <RevokeControl
            label={m.printRevokeHouse()}
            open={confirm === 'house_page'}
            disabled={busy || !hasToken(houseCode)}
            onAsk={() => setConfirm('house_page')}
            onCancel={() => setConfirm(null)}
            onConfirm={() => void revoke('house_page')}
          />
          <RevokeControl
            label={m.printRevokeRescue()}
            open={confirm === 'rescue_sheet'}
            disabled={busy || !hasToken(rescueCode)}
            onAsk={() => setConfirm('rescue_sheet')}
            onCancel={() => setConfirm(null)}
            onConfirm={() => void revoke('rescue_sheet')}
          />
        </div>
        {error === null ? null : (
          <p role="alert" className="mt-3 text-[13px] text-destructive">
            {error}
          </p>
        )}
      </div>
      <WallSheet
        houseName={props.house.name}
        address={formatHouseAddress(props.house)}
        boxes={wallBoxes(shutoffs.data)}
        trades={printedTrades(trades.data, props.house.id)}
        primary={primaryEmergencyContact(rescue.data)}
        people={essentialPeople(rescue.data)}
        houseUrl={houseUrl}
        rescueUrl={rescueUrl}
        watermark={sheetHasWatermark(tier)}
      />
      <CompactSheet
        houseName={props.house.name}
        sheet={rescue.data}
        rescueUrl={rescueUrl}
        watermark={sheetHasWatermark(tier)}
      />
    </section>
  );
}

function RevokeControl(props: {
  readonly label: string;
  readonly open: boolean;
  readonly disabled: boolean;
  readonly onAsk: () => void;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  if (!props.open) {
    return (
      <Button size="emergency" variant="outline" disabled={props.disabled} onClick={props.onAsk}>
        {props.label}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-[13px]">{m.printRevokeWarning()}</p>
      <Button size="emergency" variant="destructive" onClick={props.onConfirm}>
        {m.printConfirmRevoke()}
      </Button>
      <Button size="emergency" variant="outline" onClick={props.onCancel}>
        {m.printCancelRevoke()}
      </Button>
    </div>
  );
}
