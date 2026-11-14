import { useQuery } from '@tanstack/react-query';
import type { Me } from '@domusafe/contracts';
import { hasFeature, type PlanTier } from '@domusafe/plans';
import { useApi } from '@/components/api-context.js';
import { PageHeader } from '@/components/shell/page.js';
import { problemText } from '@/lib/copy.js';
import { roleAllows } from '@/lib/permissions.js';
import { auditEventsQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';

/**
 * Family activity register for administrators on Premium or the trial.
 *
 * Preconditions: opened from Extra with a known family.
 * Postconditions: lower plans see the locked explanation; other roles see a short refusal.
 * Data contract: rows are action codes, times and identifiers only — never contents.
 *
 * @param props - Account and family.
 * @returns The panel.
 */
export function AuditPanel(props: { readonly me: Me; readonly familyId: string }) {
  const family = props.me.families.find((item) => item.id === props.familyId);
  const plan: PlanTier = family?.plan ?? 'free';
  const canRead = family !== undefined && roleAllows(family.role, 'audit.read');

  if (!hasFeature(plan, 'audit_log')) {
    return (
      <section>
        <PageHeader title={m.auditTitle()} lead={m.auditLead()} />
        <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">{m.auditLocked()}</p>
      </section>
    );
  }
  if (!canRead) {
    return (
      <section>
        <PageHeader title={m.auditTitle()} lead={m.auditLead()} />
        <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">{m.auditHidden()}</p>
      </section>
    );
  }
  return <Log familyId={props.familyId} />;
}

function Log(props: { readonly familyId: string }) {
  const api = useApi();
  const events = useQuery(auditEventsQuery(api, props.familyId));
  if (events.isPending) {
    return <p className="text-[13px] text-muted-foreground">{m.loading()}</p>;
  }
  if (events.error !== null) {
    return (
      <p role="alert" className="text-[13px] text-destructive">
        {problemText(events.error)}
      </p>
    );
  }
  const items = events.data;

  return (
    <section className="grid max-w-xl gap-6">
      <PageHeader title={m.auditTitle()} lead={m.auditLead()} />
      {items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{m.auditEmpty()}</p>
      ) : (
        <ul className="grid gap-3">
          {items.map((item) => (
            <li key={item.id} className="grid gap-0.5 border-b border-border pb-3 text-[13px]">
              <p className="text-foreground">{actionLabel(item.action)}</p>
              <p className="text-muted-foreground">{formatWhen(item.occurredAt)}</p>
              {item.resourceType !== null ? (
                <p className="text-muted-foreground">{m.auditResource({ type: item.resourceType })}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function actionLabel(action: string): string {
  switch (action) {
    case 'house.guide_entry.created':
      return m.auditGuideCreated();
    case 'house.guide_entry.updated':
      return m.auditGuideUpdated();
    case 'house.guide_entry.deleted':
      return m.auditGuideDeleted();
    case 'house.guide_entry.restored':
      return m.auditGuideRestored();
    default:
      return action.replaceAll('.', ' · ');
  }
}
