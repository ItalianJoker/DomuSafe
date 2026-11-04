import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { House, Me } from '@domusafe/contracts';
import { PLAN_DEFINITIONS } from '@domusafe/plans';
import { useApi } from '@/components/api-context.js';
import { PageHeader } from '@/components/shell/page.js';
import { useOpenPlace } from '@/components/shell/place.js';
import { Button } from '@/components/ui/button.js';
import { planText, problemText } from '@/lib/copy.js';
import { blankToNull, validateHouse, type FieldIssues, type HouseFormValues } from '@/lib/fields.js';
import { roleAllows } from '@/lib/permissions.js';
import { housesQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { HouseForm } from './house-form.js';

const EMPTY_HOUSE: HouseFormValues = {
  name: '',
  addressLine: '',
  postalCode: '',
  city: '',
  province: '',
  country: 'IT',
};

function fromHouse(house: House): HouseFormValues {
  return {
    name: house.name,
    addressLine: house.addressLine ?? '',
    postalCode: house.postalCode ?? '',
    city: house.city ?? '',
    province: house.province ?? '',
    country: house.country,
  };
}

function toPatch(values: HouseFormValues) {
  return {
    name: values.name.trim(),
    addressLine: blankToNull(values.addressLine),
    postalCode: blankToNull(values.postalCode),
    city: blankToNull(values.city),
    province: blankToNull(values.province),
    country: values.country.trim().toUpperCase(),
  };
}

/**
 * House section: list, switch, edit the open house and add another within the plan.
 *
 * Preconditions: `houseId` is one of `houses`.
 * Postconditions: edits send `If-Match` with the loaded version.
 *
 * @param props - Account, family and the visible houses.
 * @returns The section.
 */
export function HousePage(props: {
  readonly me: Me;
  readonly familyId: string;
  readonly houseId: string;
  readonly houses: readonly House[];
}) {
  const api = useApi();
  const openPlace = useOpenPlace();
  const queryClient = useQueryClient();
  const fresh = useQuery(housesQuery(api, props.familyId));
  const houses = fresh.data ?? props.houses;
  const current = houses.find((house) => house.id === props.houseId) ?? null;
  const role = props.me.families.find((family) => family.id === props.familyId)?.role;
  const tier = props.me.families.find((family) => family.id === props.familyId)?.plan;
  const canManage = role !== undefined && roleAllows(role, 'houses.manage');
  const limit = tier === undefined ? null : PLAN_DEFINITIONS[tier].limits.houses;
  const atLimit = limit !== null && houses.length >= limit;
  const [editValues, setEditValues] = useState<HouseFormValues | null>(null);
  const [editIssues, setEditIssues] = useState<FieldIssues | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaved, setEditSaved] = useState(false);
  const [createValues, setCreateValues] = useState<HouseFormValues>(EMPTY_HOUSE);
  const [createIssues, setCreateIssues] = useState<FieldIssues | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (current !== null) {
      setEditValues(fromHouse(current));
      setEditSaved(false);
    }
  }, [current]);

  async function save(): Promise<void> {
    if (current === null || editValues === null) {
      return;
    }
    const issues = validateHouse(editValues);
    setEditIssues(issues);
    if (issues !== null) {
      return;
    }
    setPending(true);
    setEditError(null);
    setEditSaved(false);
    try {
      const updated = await api.updateHouse(props.familyId, current.id, current.version, toPatch(editValues));
      queryClient.setQueryData(
        housesQuery(api, props.familyId).queryKey,
        houses.map((house) => (house.id === updated.id ? updated : house)),
      );
      setEditSaved(true);
    } catch (caught) {
      setEditError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function create(): Promise<void> {
    const issues = validateHouse(createValues);
    setCreateIssues(issues);
    if (issues !== null) {
      return;
    }
    setPending(true);
    setCreateError(null);
    try {
      const created = await api.createHouse(props.familyId, toPatch(createValues), crypto.randomUUID());
      queryClient.setQueryData(housesQuery(api, props.familyId).queryKey, [...houses, created]);
      setCreateValues(EMPTY_HOUSE);
      await openPlace(props.familyId, created.id);
    } catch (caught) {
      setCreateError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid max-w-xl gap-8">
      <div>
        <PageHeader title={m.housesTitle()} lead={m.housesLead()} />
        {tier === undefined ? null : (
          <p className="text-[13px] text-muted-foreground">
            {planText(tier)}
            {limit === null
              ? ''
              : limit === 1
                ? ` · ${m.houseLimitOne()}`
                : ` · ${m.houseLimit({ count: String(limit) })}`}
          </p>
        )}
      </div>
      {houses.length === 0 ? <p className="text-[13px] text-muted-foreground">{m.noHouses()}</p> : null}
      <ul className="divide-y divide-border border-y border-border">
        {houses.map((house) => (
          <li key={house.id} className="flex h-10 items-center justify-between gap-3">
            <span className="truncate text-[13px]">
              {house.name}
              {house.planLocked ? <span className="text-muted-foreground"> · {m.planLocked()}</span> : null}
            </span>
            {house.id === props.houseId ? (
              <span className="text-[12px] text-muted-foreground">{m.openFamily()}</span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => void openPlace(props.familyId, house.id)}>
                {m.openFamily()}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canManage && current !== null && !current.planLocked && editValues !== null ? (
        <div>
          <h2 className="mb-3 text-[13px] font-medium">{m.editHouseTitle()}</h2>
          <HouseForm
            idPrefix="edit-house"
            submitLabel={m.saveHouse()}
            values={editValues}
            issues={editIssues}
            pending={pending}
            error={editError}
            saved={editSaved}
            onChange={setEditValues}
            onSubmit={() => void save()}
          />
        </div>
      ) : null}
      {current?.planLocked === true ? (
        <p className="text-[13px] text-muted-foreground">{m.planLocked()}</p>
      ) : null}
      {canManage && !atLimit ? (
        <div>
          <h2 className="mb-3 text-[13px] font-medium">{m.createHouseTitle()}</h2>
          <HouseForm
            idPrefix="new-house"
            submitLabel={m.createHouseSubmit()}
            values={createValues}
            issues={createIssues}
            pending={pending}
            error={createError}
            onChange={setCreateValues}
            onSubmit={() => void create()}
          />
        </div>
      ) : null}
      {canManage && limit !== null && houses.length >= limit ? (
        <p className="text-[13px] text-muted-foreground">
          {limit === 1 ? m.houseLimitOne() : m.houseLimit({ count: String(limit) })}
        </p>
      ) : null}
    </section>
  );
}
