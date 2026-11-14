import { lazy, Suspense, useState } from 'react';
import type { House, Me } from '@domusafe/contracts';
import { PageHeader } from '@/components/shell/page.js';
import { m } from '@/paraglide/messages.js';
import { HousePage } from '@/features/house/house-page.js';
import { casaTabs, isCasaTab, type CasaTab } from './model.js';
import { DeadlinePanel } from './deadline-panel.js';
import { GuestPanel } from './guest-panel.js';
import { TechnicalPanel } from './technical-panel.js';
import { UtilitiesPanel } from './utilities-panel.js';

const InventoryPanel = lazy(async () => {
  const module = await import('./inventory-panel.js');
  return { default: module.InventoryPanel };
});

const AutomationPanel = lazy(async () => {
  const module = await import('./automation-panel.js');
  return { default: module.AutomationPanel };
});

function tabLabel(tab: CasaTab): string {
  switch (tab) {
    case 'guest':
      return m.casaGuest();
    case 'technical':
      return m.casaTechnical();
    case 'utilities':
      return m.casaUtilities();
    case 'deadline':
      return m.casaDeadline();
    case 'inventory':
      return m.casaInventory();
    case 'automation':
      return m.casaAutomation();
    case 'houses':
      return m.casaHouses();
  }
}

/**
 * Casa section of the open house: guest manual, technical cutoffs, utilities, inventory and the boiler deadline.
 *
 * Preconditions: `houseId` belongs to `familyId`.
 * Postconditions: a role only sees the tabs its permissions allow. Casa is not plan-gated.
 * Data contract: edits are manual and persisted by the house and inventory APIs.
 *
 * @param props - Account, family and the visible houses.
 * @returns The section.
 */
export function CasaPage(props: {
  readonly me: Me;
  readonly familyId: string;
  readonly houseId: string;
  readonly houses: readonly House[];
  readonly initialTab?: string;
}) {
  const membership = props.me.families.find((family) => family.id === props.familyId);
  const role = membership?.role;
  const plan = membership?.plan ?? 'free';
  const tabs = casaTabs(role);
  const requested =
    props.initialTab !== undefined && isCasaTab(props.initialTab) ? props.initialTab : 'guest';
  const [tab, setTab] = useState<CasaTab>(tabs.includes(requested) ? requested : 'guest');
  const active = tabs.includes(tab) ? tab : 'guest';
  const canWriteGuest = role === 'admin' || role === 'parent';
  const canManageAutomation = role === 'admin';

  return (
    <div className="grid gap-6">
      {active === 'houses' ? null : <PageHeader title={m.casaTitle()} lead={m.casaLead()} />}
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
            {tabLabel(item)}
          </button>
        ))}
      </div>
      {active === 'guest' ? (
        <GuestPanel
          familyId={props.familyId}
          houseId={props.houseId}
          canWrite={canWriteGuest}
          canPreview={canWriteGuest}
        />
      ) : null}
      {active === 'technical' ? (
        <TechnicalPanel familyId={props.familyId} houseId={props.houseId} canWrite={canWriteGuest} />
      ) : null}
      {active === 'utilities' ? (
        <UtilitiesPanel familyId={props.familyId} houseId={props.houseId} canWrite={canWriteGuest} />
      ) : null}
      {active === 'deadline' ? (
        <DeadlinePanel familyId={props.familyId} houseId={props.houseId} canWrite={canWriteGuest} />
      ) : null}
      {active === 'inventory' ? (
        <Suspense fallback={<p className="text-[13px] text-muted-foreground">{m.loading()}</p>}>
          <InventoryPanel familyId={props.familyId} houseId={props.houseId} canWrite={canWriteGuest} />
        </Suspense>
      ) : null}
      {active === 'automation' ? (
        <Suspense fallback={<p className="text-[13px] text-muted-foreground">{m.loading()}</p>}>
          <AutomationPanel
            familyId={props.familyId}
            houseId={props.houseId}
            canManage={canManageAutomation}
            plan={plan}
          />
        </Suspense>
      ) : null}
      {active === 'houses' ? (
        <HousePage me={props.me} familyId={props.familyId} houseId={props.houseId} houses={props.houses} />
      ) : null}
    </div>
  );
}
