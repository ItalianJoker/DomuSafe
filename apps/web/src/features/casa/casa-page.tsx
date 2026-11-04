import { useState } from 'react';
import type { House, Me } from '@domusafe/contracts';
import { PageHeader } from '@/components/shell/page.js';
import { m } from '@/paraglide/messages.js';
import { HousePage } from '@/features/house/house-page.js';
import { casaTabs, type CasaTab } from './model.js';
import { DeadlinePanel } from './deadline-panel.js';
import { GuestPanel } from './guest-panel.js';
import { TechnicalPanel } from './technical-panel.js';
import { UtilitiesPanel } from './utilities-panel.js';

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
    case 'houses':
      return m.casaHouses();
  }
}

/**
 * Casa section of the open house: guest manual, technical cutoffs, utilities and the boiler deadline.
 *
 * Preconditions: `houseId` belongs to `familyId`.
 * Postconditions: a role only sees the tabs its permissions allow. Casa is not plan-gated.
 * Data contract: edits are manual and persisted by the house API.
 *
 * @param props - Account, family and the visible houses.
 * @returns The section.
 */
export function CasaPage(props: {
  readonly me: Me;
  readonly familyId: string;
  readonly houseId: string;
  readonly houses: readonly House[];
}) {
  const role = props.me.families.find((family) => family.id === props.familyId)?.role;
  const tabs = casaTabs(role);
  const [tab, setTab] = useState<CasaTab>('guest');
  const active = tabs.includes(tab) ? tab : 'guest';
  const canWriteGuest = role === 'admin' || role === 'parent';

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
      {active === 'houses' ? (
        <HousePage me={props.me} familyId={props.familyId} houseId={props.houseId} houses={props.houses} />
      ) : null}
    </div>
  );
}
