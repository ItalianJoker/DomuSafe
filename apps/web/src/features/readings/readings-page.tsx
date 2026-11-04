import { useQuery } from '@tanstack/react-query';
import type { Me, PublicationKind, PublicationReading } from '@domusafe/contracts';
import { hasFeature, type PlanTier } from '@domusafe/plans';
import { useApi } from '@/components/api-context.js';
import { PageHeader } from '@/components/shell/page.js';
import { currentPublication } from '@/features/print/model.js';
import { problemText } from '@/lib/copy.js';
import { roleAllows } from '@/lib/permissions.js';
import { publicationReadingsQuery, publicationsQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';

/**
 * Reading log of the public codes, loaded only when Extra is opened.
 *
 * Preconditions: `familyId` is one of the account's families and `houseId` is a house of that family.
 * Postconditions: Free, Basic and Advanced see the locked explanation. Premium and the trial,
 * for someone who can edit the house, see the newest readings and the last reading.
 * Data contract: the screen asks only for the log and the printed codes. It does not ask for health data.
 *
 * @param props - Account and the open house.
 * @returns The screen.
 */
export function ReadingsPage(props: {
  readonly me: Me;
  readonly familyId: string;
  readonly houseId: string;
}) {
  const family = props.me.families.find((item) => item.id === props.familyId);
  const plan: PlanTier = family?.plan ?? 'free';
  const canEdit = family !== undefined && roleAllows(family.role, 'house.write');

  if (!hasFeature(plan, 'audit_log')) {
    return (
      <section>
        <PageHeader title={m.readingsTitle()} lead={m.readingsLead()} />
        <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">{m.readingsLocked()}</p>
      </section>
    );
  }
  if (!canEdit) {
    return (
      <section>
        <PageHeader title={m.readingsTitle()} lead={m.readingsLead()} />
        <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">{m.readingsHidden()}</p>
      </section>
    );
  }
  return <Log familyId={props.familyId} houseId={props.houseId} />;
}

function Log(props: { readonly familyId: string; readonly houseId: string }) {
  const api = useApi();
  const codes = useQuery(publicationsQuery(api, props.familyId, props.houseId));
  const readings = useQuery(publicationReadingsQuery(api, props.familyId, props.houseId));
  if (codes.isPending || readings.isPending) {
    return <p className="text-[13px] text-muted-foreground">{m.loading()}</p>;
  }
  const failed = codes.error ?? readings.error;
  if (failed !== null) {
    return (
      <p role="alert" className="text-[13px] text-destructive">
        {problemText(failed)}
      </p>
    );
  }
  if (codes.data === undefined || readings.data === undefined) {
    return <p className="text-[13px] text-muted-foreground">{m.loading()}</p>;
  }
  const houseCode = currentPublication(codes.data, 'house_page');
  const rescueCode = currentPublication(codes.data, 'rescue_sheet');
  const items = [...readings.data].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  return (
    <section className="grid max-w-xl gap-6">
      <PageHeader title={m.readingsTitle()} lead={m.readingsLead()} />
      <div className="grid gap-2 text-[13px] text-muted-foreground">
        <p>
          {m.printHouseCode()}: {scanText(houseCode?.lastScannedAt ?? null)}
        </p>
        <p>
          {m.printRescueCode()}: {scanText(rescueCode?.lastScannedAt ?? null)}
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{m.readingsEmpty()}</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item, index) => (
            <li key={`${item.occurredAt}-${item.kind}-${String(index)}`} className="text-[13px]">
              <ReadingLine item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReadingLine(props: { readonly item: PublicationReading }) {
  return (
    <>
      <time dateTime={props.item.occurredAt}>{formatWhen(props.item.occurredAt)}</time>
      {' · '}
      {kindLabel(props.item.kind)}
      {' · '}
      {deviceText(props.item.deviceLabel)}
    </>
  );
}

function kindLabel(kind: PublicationKind): string {
  return kind === 'house_page' ? m.printHouseCode() : m.printRescueCode();
}

function deviceText(label: PublicationReading['deviceLabel']): string {
  switch (label) {
    case 'Telefono':
      return m.readingsPhone();
    case 'Tablet':
      return m.readingsTablet();
    case 'Computer':
      return m.readingsComputer();
    case null:
      return m.readingsDeviceUnknown();
  }
}

function scanText(iso: string | null): string {
  if (iso === null) {
    return m.printNeverScanned();
  }
  return `${m.printLastScan()}: ${formatWhen(iso)}`;
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat(getLocale() === 'en' ? 'en' : 'it', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}
