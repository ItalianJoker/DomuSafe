import type { House, Me } from '@domusafe/contracts';
import { PageHeader } from '@/components/shell/page.js';
import { roleAllows } from '@/lib/permissions.js';
import { m } from '@/paraglide/messages.js';
import { DeadlinesPanel } from './deadlines-panel.js';

/**
 * Landing page inside a house. Deadlines already stored are grouped here.
 *
 * @param props - Account, family and the open house.
 * @returns The dashboard.
 */
export function HomePage(props: {
  readonly me: Me;
  readonly familyId: string;
  readonly house: House;
  readonly familyName: string;
}) {
  const role = props.me.families.find((family) => family.id === props.familyId)?.role;
  const canRead = role !== undefined && roleAllows(role, 'deadlines.read');
  const canWrite = role !== undefined && roleAllows(role, 'maintenance.write');
  return (
    <section className="grid gap-8">
      <div>
        <PageHeader title={m.welcome({ name: props.me.displayName })} lead={m.homeLead()} />
        <p className="text-[13px] text-muted-foreground">
          {props.house.name} · {props.familyName}
        </p>
      </div>
      {canRead ? (
        <DeadlinesPanel familyId={props.familyId} houseId={props.house.id} canWrite={canWrite} />
      ) : null}
    </section>
  );
}
