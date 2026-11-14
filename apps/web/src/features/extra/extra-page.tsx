import { lazy, Suspense, useState } from 'react';
import type { Me } from '@domusafe/contracts';
import { PageHeader } from '@/components/shell/page.js';
import { roleAllows } from '@/lib/permissions.js';
import { m } from '@/paraglide/messages.js';

const RecipesPanel = lazy(async () => {
  const module = await import('./recipes-panel.js');
  return { default: module.RecipesPanel };
});

const ShoppingPanel = lazy(async () => {
  const module = await import('./shopping-panel.js');
  return { default: module.ShoppingPanel };
});

const PantryPanel = lazy(async () => {
  const module = await import('./pantry-panel.js');
  return { default: module.PantryPanel };
});

const MealPlanPanel = lazy(async () => {
  const module = await import('./meal-plan-panel.js');
  return { default: module.MealPlanPanel };
});

const FinancePanel = lazy(async () => {
  const module = await import('./finance-panel.js');
  return { default: module.FinancePanel };
});

const ReadingsPage = lazy(async () => {
  const module = await import('@/features/readings/readings-page.js');
  return { default: module.ReadingsPage };
});

type ExtraTab = 'recipes' | 'mealPlan' | 'pantry' | 'shopping' | 'finance' | 'readings';

function tabLabel(tab: ExtraTab): string {
  switch (tab) {
    case 'recipes':
      return m.extraRecipes();
    case 'mealPlan':
      return m.extraMealPlan();
    case 'pantry':
      return m.extraPantry();
    case 'shopping':
      return m.extraShopping();
    case 'finance':
      return m.extraFinance();
    case 'readings':
      return m.extraReadings();
  }
}

/**
 * Extra section: recipes, weekly meal plan, pantry, shopping lists, family ledger and the public-code reading log.
 *
 * Preconditions: `houseId` belongs to `familyId`.
 * Postconditions: kitchen and shopping are available on every plan; the ledger needs Basic or above and
 * `finance.read`; the reading log stays Premium-gated.
 * Data contract: edits are manual and persisted by the kitchen, shopping and finance APIs.
 *
 * @param props - Account and the open house.
 * @returns The section.
 */
export function ExtraPage(props: { readonly me: Me; readonly familyId: string; readonly houseId: string }) {
  const family = props.me.families.find((item) => item.id === props.familyId);
  const role = family?.role;
  const canReadKitchen = role !== undefined && roleAllows(role, 'kitchen.read');
  const canWriteKitchen = role !== undefined && roleAllows(role, 'kitchen.write');
  const canReadShopping = role !== undefined && roleAllows(role, 'shopping.read');
  const canWriteShopping = role !== undefined && roleAllows(role, 'shopping.write');
  const canReadFinance = role !== undefined && roleAllows(role, 'finance.read');
  const canWriteFinance = role !== undefined && roleAllows(role, 'finance.write');

  const tabs: ExtraTab[] = [];
  if (canReadKitchen) {
    tabs.push('recipes', 'mealPlan', 'pantry');
  }
  if (canReadShopping) {
    tabs.push('shopping');
  }
  if (canReadFinance) {
    tabs.push('finance');
  }
  tabs.push('readings');

  const [tab, setTab] = useState<ExtraTab>('recipes');
  const active = tabs.includes(tab) ? tab : (tabs[0] ?? 'readings');

  return (
    <div className="grid gap-6">
      {active === 'readings' ? null : <PageHeader title={m.extraTitle()} lead={m.extraLead()} />}
      <div className="flex flex-wrap gap-1 border-b border-border" role="tablist">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={item === active}
            className={
              item === active
                ? 'h-12 border-b-2 border-foreground px-3 text-[15px]'
                : 'h-12 px-3 text-[15px] text-muted-foreground'
            }
            onClick={() => setTab(item)}
          >
            {tabLabel(item)}
          </button>
        ))}
      </div>
      <Suspense fallback={<p className="text-[13px] text-muted-foreground">{m.loading()}</p>}>
        {active === 'recipes' ? <RecipesPanel familyId={props.familyId} canWrite={canWriteKitchen} /> : null}
        {active === 'mealPlan' ? (
          <MealPlanPanel familyId={props.familyId} houseId={props.houseId} canWrite={canWriteKitchen} />
        ) : null}
        {active === 'pantry' ? (
          <PantryPanel familyId={props.familyId} houseId={props.houseId} canWrite={canWriteKitchen} />
        ) : null}
        {active === 'shopping' ? (
          <ShoppingPanel familyId={props.familyId} houseId={props.houseId} canWrite={canWriteShopping} />
        ) : null}
        {active === 'finance' ? (
          <FinancePanel me={props.me} familyId={props.familyId} canWrite={canWriteFinance} />
        ) : null}
        {active === 'readings' ? (
          <ReadingsPage me={props.me} familyId={props.familyId} houseId={props.houseId} />
        ) : null}
      </Suspense>
    </div>
  );
}
