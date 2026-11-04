import { useState } from 'react';
import type { Me } from '@domusafe/contracts';
import type { PlanTier } from '@domusafe/plans';
import { PageHeader } from '@/components/shell/page.js';
import { m } from '@/paraglide/messages.js';
import { AccountsPanel, TaxPanel } from './premium-panels.js';
import { CardPanel } from './card-panel.js';
import { personaleTabLabel, personaleTabs, type PersonaleTab } from './model.js';
import { PetsPanel } from './pets-panel.js';
import { ServicesPanel } from './services-panel.js';

/**
 * Personale section of the open house: rescue cards, services, animals, taxes and accounts.
 *
 * Preconditions: `houseId` belongs to `familyId`.
 * Postconditions: a role only sees the tabs its permissions allow. Taxes and accounts stay closed without Premium.
 * Data contract: edits are manual and persisted by the personale API.
 *
 * @param props - Account, family and the open house.
 * @returns The section.
 */
export function PersonalePage(props: {
  readonly me: Me;
  readonly familyId: string;
  readonly houseId: string;
}) {
  const family = props.me.families.find((item) => item.id === props.familyId);
  const role = family?.role;
  const plan: PlanTier = family?.plan ?? 'free';
  const tabs = personaleTabs(role);
  const [tab, setTab] = useState<PersonaleTab>('card');
  const active = tabs.includes(tab) ? tab : (tabs[0] ?? 'card');
  const canWrite = role === 'admin' || role === 'parent';

  if (tabs.length === 0) {
    return (
      <section>
        <PageHeader title={m.personalTitle()} lead={m.personalBody()} />
        <p className="text-[13px] text-muted-foreground">{m.personaleHidden()}</p>
      </section>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader title={m.personalTitle()} lead={m.personalBody()} />
      <div className="flex flex-wrap gap-1 border-b border-border" role="tablist">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={item === active}
            className={
              item === active
                ? 'h-8 border-b-2 border-foreground px-2 text-[13px]'
                : 'h-8 px-2 text-[13px] text-muted-foreground'
            }
            onClick={() => setTab(item)}
          >
            {personaleTabLabel(item)}
          </button>
        ))}
      </div>
      {active === 'card' ? (
        <CardPanel familyId={props.familyId} houseId={props.houseId} plan={plan} canWrite={canWrite} />
      ) : null}
      {active === 'services' ? (
        <ServicesPanel familyId={props.familyId} houseId={props.houseId} canWrite={canWrite} />
      ) : null}
      {active === 'pets' ? (
        <PetsPanel familyId={props.familyId} houseId={props.houseId} plan={plan} canWrite={canWrite} />
      ) : null}
      {active === 'taxes' ? (
        <TaxPanel familyId={props.familyId} houseId={props.houseId} plan={plan} canWrite={canWrite} />
      ) : null}
      {active === 'accounts' ? (
        <AccountsPanel familyId={props.familyId} houseId={props.houseId} plan={plan} canWrite={canWrite} />
      ) : null}
    </div>
  );
}
