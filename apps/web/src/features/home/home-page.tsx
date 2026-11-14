import { Link } from '@tanstack/react-router';
import type { House, Me } from '@domusafe/contracts';
import { PageHeader } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { roleAllows } from '@/lib/permissions.js';
import { m } from '@/paraglide/messages.js';
import { rescuePath } from '@/features/rescue/path.js';
import { DeadlinesPanel } from './deadlines-panel.js';
import { NextStepsPanel } from './next-steps-panel.js';

/**
 * Landing page inside a house.
 *
 * Preconditions: `house` belongs to `familyId`.
 * Postconditions: the rescue control opens the full-screen view. Adoption cues and deadlines stay here.
 * Data contract: this page does not show account numbers; rescue details stay on the rescue screen.
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
  const canReadCalendar = role !== undefined && roleAllows(role, 'calendar.read');
  return (
    <section className="grid gap-8">
      <div>
        <PageHeader title={m.welcome({ name: props.me.displayName })} lead={m.homeLead()} />
        <p className="text-[13px] text-muted-foreground">
          {props.house.name} · {props.familyName}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button size="emergency" asChild>
            <Link to={rescuePath(props.familyId, props.house.id)}>{m.rescueOpen()}</Link>
          </Button>
          {canReadCalendar ? (
            <Button size="emergency" variant="outline" asChild>
              <Link
                to="/f/$familyId/c/$houseId/famiglia"
                params={{ familyId: props.familyId, houseId: props.house.id }}
              >
                {m.calendarHomeLink()}
              </Link>
            </Button>
          ) : null}
        </div>
        {canReadCalendar ? (
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{m.calendarHomeLead()}</p>
        ) : null}
      </div>
      <NextStepsPanel me={props.me} familyId={props.familyId} house={props.house} />
      {canRead ? (
        <DeadlinesPanel familyId={props.familyId} houseId={props.house.id} canWrite={canWrite} />
      ) : null}
    </section>
  );
}
