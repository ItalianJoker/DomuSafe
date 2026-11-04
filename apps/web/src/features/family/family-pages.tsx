import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { currencySchema, localeSchema, type Me } from '@domusafe/contracts';
import { PLAN_DEFINITIONS } from '@domusafe/plans';
import { useApi } from '@/components/api-context.js';
import { PageHeader } from '@/components/shell/page.js';
import { useOpenPlace } from '@/components/shell/place.js';
import { Button } from '@/components/ui/button.js';
import { Separator } from '@/components/ui/separator.js';
import { planText, problemText, roleText } from '@/lib/copy.js';
import { validateFamily, type FamilyFormValues, type FieldIssues } from '@/lib/fields.js';
import { roleAllows } from '@/lib/permissions.js';
import { familyQuery, meKey, membersQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { getLocale, setLocale } from '@/paraglide/runtime.js';
import { FamilyForm } from './family-form.js';

const EMPTY_CREATE: FamilyFormValues = {
  name: '',
  timezone: 'Europe/Rome',
  currency: 'EUR',
  locale: 'it',
  houseName: '',
};

/**
 * First screen after sign-up, and the way to add another family.
 *
 * Preconditions: the account is signed in.
 * Postconditions: a created family opens its first house.
 *
 * @param props - Current account, used for the way back when a house already exists.
 * @returns The creation screen.
 */
export function CreateFamilyPage(props: { readonly me: Me }) {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openPlace = useOpenPlace();
  const [values, setValues] = useState<FamilyFormValues>(EMPTY_CREATE);
  const [issues, setIssues] = useState<FieldIssues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const back = props.me.lastFamilyId !== null && props.me.lastHouseId !== null;

  async function onSubmit(): Promise<void> {
    const next = validateFamily(values, 'create');
    setIssues(next);
    if (next !== null || values.houseName === undefined) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await api.createFamily(
        {
          name: values.name.trim(),
          timezone: values.timezone.trim(),
          baseCurrency: currencySchema.parse(values.currency),
          locale: localeSchema.parse(values.locale),
          firstHouse: { name: values.houseName.trim() },
        },
        crypto.randomUUID(),
      );
      queryClient.setQueryData(meKey, await api.getMe());
      await navigate({
        to: '/f/$familyId/c/$houseId',
        params: { familyId: created.family.id, houseId: created.house.id },
      });
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="flex h-12 items-center border-b border-border px-4">
        <span className="text-[13px] font-medium">{m.appName()}</span>
      </header>
      <main className="mx-auto max-w-xl px-4 py-8">
        <PageHeader title={m.createFamilyTitle()} lead={m.createFamilyLead()} />
        <FamilyForm
          mode="create"
          values={values}
          issues={issues}
          pending={pending}
          error={error}
          onChange={setValues}
          onSubmit={() => void onSubmit()}
        />
        {back ? (
          <Button
            variant="ghost"
            className="mt-4"
            onClick={() => {
              if (props.me.lastFamilyId !== null) {
                void openPlace(props.me.lastFamilyId, props.me.lastHouseId);
              }
            }}
          >
            {m.backToHouse()}
          </Button>
        ) : null}
      </main>
    </div>
  );
}

/**
 * Family section: switch family, edit it, see people, create another.
 *
 * Preconditions: `familyId` is a family of `me`.
 * Postconditions: edits use the loaded version; creating another family opens it.
 *
 * @param props - Account and the open family.
 * @returns The section.
 */
export function FamilyPage(props: { readonly me: Me; readonly familyId: string; readonly houseId: string }) {
  const api = useApi();
  const openPlace = useOpenPlace();
  const queryClient = useQueryClient();
  const family = useQuery(familyQuery(api, props.familyId));
  const role = props.me.families.find((item) => item.id === props.familyId)?.role;
  const canManage = role !== undefined && roleAllows(role, 'family.manage');
  const canReadMembers = role !== undefined && roleAllows(role, 'members.read');
  const members = useQuery({ ...membersQuery(api, props.familyId), enabled: canReadMembers });
  const [values, setValues] = useState<FamilyFormValues | null>(null);
  const [issues, setIssues] = useState<FieldIssues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createValues, setCreateValues] = useState<FamilyFormValues>(EMPTY_CREATE);
  const [createIssues, setCreateIssues] = useState<FieldIssues | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const current =
    values ??
    (family.data === undefined
      ? null
      : {
          name: family.data.name,
          timezone: family.data.timezone,
          currency: family.data.baseCurrency,
          locale: family.data.locale,
        });

  async function save(): Promise<void> {
    if (current === null || family.data === undefined) {
      return;
    }
    const next = validateFamily(current, 'edit');
    setIssues(next);
    if (next !== null) {
      return;
    }
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateFamily(props.familyId, family.data.version, {
        name: current.name.trim(),
        timezone: current.timezone.trim(),
        baseCurrency: currencySchema.parse(current.currency),
        locale: localeSchema.parse(current.locale),
      });
      queryClient.setQueryData(familyQuery(api, props.familyId).queryKey, updated);
      if (updated.locale !== getLocale()) {
        await setLocale(updated.locale, { reload: false });
      }
      setSaved(true);
      setValues(null);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function createAnother(): Promise<void> {
    const next = validateFamily(createValues, 'create');
    setCreateIssues(next);
    if (next !== null || createValues.houseName === undefined) {
      return;
    }
    setPending(true);
    setCreateError(null);
    try {
      const created = await api.createFamily(
        {
          name: createValues.name.trim(),
          timezone: createValues.timezone.trim(),
          baseCurrency: currencySchema.parse(createValues.currency),
          locale: localeSchema.parse(createValues.locale),
          firstHouse: { name: createValues.houseName.trim() },
        },
        crypto.randomUUID(),
      );
      await queryClient.invalidateQueries({ queryKey: meKey });
      await openPlace(created.family.id, created.house.id);
    } catch (caught) {
      setCreateError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  const limit = family.data === undefined ? null : PLAN_DEFINITIONS[family.data.plan.tier].limits.houses;

  return (
    <section className="grid max-w-xl gap-8">
      <div>
        <PageHeader
          title={m.navFamiglia()}
          {...(family.data === undefined ? {} : { lead: family.data.name })}
        />
        {family.data === undefined ? (
          <p className="text-[13px] text-muted-foreground">
            {family.isError ? problemText(family.error) : m.loading()}
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {planText(family.data.plan.tier)}
            {family.data.plan.source === 'trial' ? ` · ${m.planTrial()}` : ''}
            {role === undefined ? '' : ` · ${roleText(role)}`}
            {limit === null
              ? ''
              : limit === 1
                ? ` · ${m.houseLimitOne()}`
                : ` · ${m.houseLimit({ count: String(limit) })}`}
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-[13px] font-medium">{m.familiesTitle()}</h2>
        <ul className="divide-y divide-border border-y border-border">
          {props.me.families.map((item) => (
            <li key={item.id} className="flex h-10 items-center justify-between gap-3">
              <span className="truncate text-[13px]">
                {item.name}
                <span className="text-muted-foreground"> · {roleText(item.role)}</span>
              </span>
              {item.id === props.familyId ? (
                <span className="text-[12px] text-muted-foreground">{m.openFamily()}</span>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => void openPlace(item.id, null)}>
                  {m.openFamily()}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {canManage && current !== null ? (
        <div>
          <h2 className="mb-3 text-[13px] font-medium">{m.familyEditTitle()}</h2>
          <FamilyForm
            mode="edit"
            values={current}
            issues={issues}
            pending={pending}
            error={error}
            saved={saved}
            onChange={setValues}
            onSubmit={() => void save()}
          />
        </div>
      ) : null}

      <div>
        <h2 className="mb-2 text-[13px] font-medium">{m.membersTitle()}</h2>
        {!canReadMembers ? <p className="text-[13px] text-muted-foreground">{m.membersHidden()}</p> : null}
        {canReadMembers && members.data?.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{m.noMembers()}</p>
        ) : null}
        {members.data === undefined || !canReadMembers ? null : (
          <ul className="divide-y divide-border border-y border-border">
            {members.data.map((member) => (
              <li key={member.id} className="flex h-10 items-center justify-between gap-3 text-[13px]">
                <span className="truncate">{member.displayName}</span>
                <span className="text-muted-foreground">
                  {roleText(member.role)}
                  {member.isOwner ? ` · ${m.ownerBadge()}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-[13px] font-medium">
          <Link
            to="/f/$familyId/c/$houseId/famiglia/successione"
            params={{ familyId: props.familyId, houseId: props.houseId }}
            className="underline-offset-4 hover:underline"
          >
            {m.successionFamilyLink()}
          </Link>
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.successionFamilyBody()}</p>
      </div>

      <Separator />
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-medium">{m.createAnotherFamily()}</h2>
          {creating ? null : (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              {m.createFamilySubmit()}
            </Button>
          )}
        </div>
        {creating ? (
          <FamilyForm
            mode="create"
            values={createValues}
            issues={createIssues}
            pending={pending}
            error={createError}
            onChange={setCreateValues}
            onSubmit={() => void createAnother()}
          />
        ) : null}
      </div>
    </section>
  );
}
