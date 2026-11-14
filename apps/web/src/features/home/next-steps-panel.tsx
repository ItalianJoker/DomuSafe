import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { hasFeature, type PlanTier } from '@domusafe/plans';
import type { House, MemberRole, Me } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Button } from '@/components/ui/button.js';
import { roleAllows } from '@/lib/permissions.js';
import { rescueSheetQuery, residentsQuery, shutoffsQuery, utilitiesQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import {
  buildNextSteps,
  completenessColumns,
  nextStepsProgress,
  type CompletenessColumn,
  type NextStep,
  type NextStepId,
  type NextStepTarget,
  type NextStepsSnapshot,
} from './next-steps.js';

/**
 * Completeness columns and the single «cosa fare dopo» cue on the house dashboard.
 *
 * Preconditions: the caller is inside an open house; permissions gate each read.
 * Postconditions: links open existing sections; no new records are written here.
 * Data contract: scores use shutoffs, residents, rescue sheet, utilities and vault-pin state.
 *
 * @param props - Account, family and open house.
 * @returns The adoption block, or null when nothing can be scored for this role.
 */
export function NextStepsPanel(props: { readonly me: Me; readonly familyId: string; readonly house: House }) {
  const api = useApi();
  const membership = props.me.families.find((family) => family.id === props.familyId);
  const role = membership?.role;
  const plan: PlanTier = membership?.plan ?? 'free';
  const access =
    role === undefined || membership === undefined
      ? DISABLED_ACCESS
      : accessFor(role, plan, membership.vaultFamily);
  const shutoffs = useQuery({
    ...shutoffsQuery(api, props.familyId, props.house.id),
    enabled: access.canReadTechnical,
  });
  const residents = useQuery({
    ...residentsQuery(api, props.familyId, props.house.id),
    enabled: access.canReadResidents,
  });
  const rescue = useQuery({
    ...rescueSheetQuery(api, props.familyId, props.house.id),
    enabled: access.canReadRescue,
  });
  const utilities = useQuery({
    ...utilitiesQuery(api, props.familyId, props.house.id),
    enabled: access.canReadUtilities,
  });
  const vaultPin = useQuery({
    queryKey: ['vault-pin-status'] as const,
    enabled: access.vaultAvailable && access.canOpenVault,
    queryFn: async () => {
      const { createVaultClient } = await import('@/features/vault/client.js');
      return createVaultClient().getVaultPin();
    },
  });

  if (role === undefined) {
    return null;
  }

  const waiting =
    (access.canReadTechnical && shutoffs.isPending) ||
    (access.canReadResidents && residents.isPending) ||
    (access.canReadRescue && rescue.isPending) ||
    (access.canReadUtilities && utilities.isPending) ||
    (access.vaultAvailable && access.canOpenVault && vaultPin.isPending);
  if (waiting) {
    return <p className="text-[13px] text-muted-foreground">{m.loading()}</p>;
  }

  const snapshot: NextStepsSnapshot = {
    houseName: props.house.name,
    shutoffs: (shutoffs.data ?? []).map((item) => ({
      kind: item.kind,
      location: item.location,
    })),
    residents: (residents.data ?? []).map((person) => ({
      displayName: person.displayName,
      usualBedroom: person.usualBedroom,
      hasPhoto: person.photo !== null,
    })),
    rescueResidents: (rescue.data?.residents ?? []).map((person) => ({
      allergies: person.allergies,
      medicines: person.medicines,
      contacts: person.contacts,
      bloodGroup: person.bloodGroup,
    })),
    utilityCount: utilities.data?.length ?? 0,
    vaultPinSet: vaultPin.data !== undefined && vaultPin.data.state !== 'not_set',
    vaultAvailable: access.vaultAvailable,
    canReadTechnical: access.canReadTechnical,
    canReadResidents: access.canReadResidents,
    canReadRescue: access.canReadRescue,
    canReadUtilities: access.canReadUtilities,
    canOpenVault: access.canOpenVault,
  };

  const columns = completenessColumns(snapshot);
  const steps = buildNextSteps(snapshot);
  const progress = nextStepsProgress(steps);
  if (progress.total === 0 && columns.every((column) => column.total === 0)) {
    return null;
  }

  return (
    <section className="grid max-w-xl gap-4" aria-label={m.nextStepsRegion()}>
      <header>
        <h2 className="text-[15px] font-medium tracking-tight">{m.nextStepsTitle()}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.nextStepsLead()}</p>
      </header>
      <CompletenessRow
        columns={columns}
        familyId={props.familyId}
        houseId={props.house.id}
        canReadTechnical={access.canReadTechnical}
        canReadResidents={access.canReadResidents}
      />
      <NextCue progress={progress} steps={steps} familyId={props.familyId} houseId={props.house.id} />
    </section>
  );
}

function CompletenessRow(props: {
  readonly columns: readonly CompletenessColumn[];
  readonly familyId: string;
  readonly houseId: string;
  readonly canReadTechnical: boolean;
  readonly canReadResidents: boolean;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-3">
      {props.columns.map((column) => {
        const target = columnTarget(column.id);
        const enabled =
          (column.id === 'casa' && props.canReadTechnical) ||
          (column.id !== 'casa' && props.canReadResidents);
        return (
          <li key={column.id} className="rounded-md border border-border px-3 py-2">
            <p className="text-[12px] text-muted-foreground">{columnTitle(column.id)}</p>
            <p className="mt-1 text-[18px] font-medium tracking-tight tabular-nums">
              {column.percent}
              <span className="text-[12px] font-normal text-muted-foreground">%</span>
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {m.nextStepsColumnBlurb({ done: column.done, total: column.total })}
            </p>
            {enabled ? (
              <Button asChild variant="ghost" size="sm" className="mt-2 h-7 px-0">
                <Link {...linkProps(props.familyId, props.houseId, target)}>{m.nextStepsOpen()}</Link>
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function NextCue(props: {
  readonly progress: ReturnType<typeof nextStepsProgress>;
  readonly steps: readonly NextStep[];
  readonly familyId: string;
  readonly houseId: string;
}) {
  const [openList, setOpenList] = useState(false);
  const { done, total, percent, next } = props.progress;

  if (total === 0) {
    return null;
  }

  if (next === null) {
    return (
      <aside className="rounded-md border border-border px-3 py-3">
        <p className="text-[13px] font-medium">{m.nextStepsComplete({ done, total })}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.nextStepsCompleteLead()}</p>
      </aside>
    );
  }

  return (
    <aside className="grid gap-3 rounded-md border border-border px-3 py-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[12px] text-muted-foreground">{m.nextStepsProgressLabel()}</p>
          <p className="text-[13px] font-medium">{m.nextStepsProgress({ done, total })}</p>
        </div>
        <div
          className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={m.nextStepsProgress({ done, total })}
        >
          <div className="h-full bg-foreground" style={{ width: `${String(percent)}%` }} />
        </div>
      </div>
      <div className="rounded-md bg-muted/40 px-3 py-3">
        <p className="text-[12px] font-medium text-muted-foreground">{m.nextStepsNextLabel()}</p>
        <p className="mt-1 text-[15px] font-medium tracking-tight">{stepTitle(next.id)}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{stepBlurb(next.id)}</p>
        <div className="mt-3">
          <Button asChild>
            <Link {...linkProps(props.familyId, props.houseId, next.target)}>{stepCta(next.id)}</Link>
          </Button>
        </div>
      </div>
      <button
        type="button"
        className="justify-self-start text-[13px] font-medium text-foreground underline-offset-4 hover:underline"
        aria-expanded={openList}
        onClick={() => setOpenList((value) => !value)}
      >
        {openList ? m.nextStepsHideList() : m.nextStepsShowList()}
      </button>
      {openList ? (
        <ul className="grid gap-2">
          {props.steps.map((step) => (
            <li
              key={step.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium">
                  {step.done ? m.nextStepsDoneMark() : m.nextStepsOpenMark()} {stepTitle(step.id)}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {step.available ? stepBlurb(step.id) : m.nextStepsVaultLocked()}
                </p>
              </div>
              {step.available && !step.done ? (
                <Button asChild variant="outline" size="sm">
                  <Link {...linkProps(props.familyId, props.houseId, step.target)}>{m.nextStepsOpen()}</Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

interface AccessFlags {
  readonly canReadTechnical: boolean;
  readonly canReadResidents: boolean;
  readonly canReadRescue: boolean;
  readonly canReadUtilities: boolean;
  readonly canOpenVault: boolean;
  readonly vaultAvailable: boolean;
}

const DISABLED_ACCESS: AccessFlags = {
  canReadTechnical: false,
  canReadResidents: false,
  canReadRescue: false,
  canReadUtilities: false,
  canOpenVault: false,
  vaultAvailable: false,
};

function accessFor(role: MemberRole, plan: PlanTier, vaultFamily: boolean): AccessFlags {
  return {
    canReadTechnical: roleAllows(role, 'house.technical.read'),
    canReadResidents: roleAllows(role, 'residents.read'),
    canReadRescue: roleAllows(role, 'health.read'),
    canReadUtilities: roleAllows(role, 'utilities.read'),
    canOpenVault: roleAllows(role, 'vault.family.read') || vaultFamily,
    vaultAvailable: hasFeature(plan, 'vault_family'),
  };
}

function columnTarget(id: CompletenessColumn['id']): NextStepTarget {
  switch (id) {
    case 'casa':
      return 'casa-technical';
    case 'residenti':
    case 'emergenza':
      return 'personale';
  }
}

function columnTitle(id: CompletenessColumn['id']): string {
  switch (id) {
    case 'casa':
      return m.nextStepsColumnCasa();
    case 'residenti':
      return m.nextStepsColumnResidenti();
    case 'emergenza':
      return m.nextStepsColumnEmergenza();
  }
}

function stepTitle(id: NextStepId): string {
  switch (id) {
    case 'casa':
      return m.nextStepsCasaTitle();
    case 'residenti':
      return m.nextStepsResidentiTitle();
    case 'emergenza':
      return m.nextStepsEmergenzaTitle();
    case 'utenze':
      return m.nextStepsUtenzeTitle();
    case 'cassaforte':
      return m.nextStepsCassaforteTitle();
  }
}

function stepBlurb(id: NextStepId): string {
  switch (id) {
    case 'casa':
      return m.nextStepsCasaBlurb();
    case 'residenti':
      return m.nextStepsResidentiBlurb();
    case 'emergenza':
      return m.nextStepsEmergenzaBlurb();
    case 'utenze':
      return m.nextStepsUtenzeBlurb();
    case 'cassaforte':
      return m.nextStepsCassaforteBlurb();
  }
}

function stepCta(id: NextStepId): string {
  switch (id) {
    case 'casa':
      return m.nextStepsCasaCta();
    case 'residenti':
      return m.nextStepsResidentiCta();
    case 'emergenza':
      return m.nextStepsEmergenzaCta();
    case 'utenze':
      return m.nextStepsUtenzeCta();
    case 'cassaforte':
      return m.nextStepsCassaforteCta();
  }
}

function linkProps(
  familyId: string,
  houseId: string,
  target: NextStepTarget,
):
  | {
      readonly to: '/f/$familyId/c/$houseId/casa';
      readonly params: { readonly familyId: string; readonly houseId: string };
      readonly search: { readonly tab: 'technical' } | { readonly tab: 'utilities' };
    }
  | {
      readonly to: '/f/$familyId/c/$houseId/personale' | '/f/$familyId/c/$houseId/cassaforte';
      readonly params: { readonly familyId: string; readonly houseId: string };
    } {
  const params = { familyId, houseId } as const;
  switch (target) {
    case 'casa':
    case 'casa-technical':
      return {
        to: '/f/$familyId/c/$houseId/casa',
        params,
        search: { tab: 'technical' },
      };
    case 'casa-utilities':
      return {
        to: '/f/$familyId/c/$houseId/casa',
        params,
        search: { tab: 'utilities' },
      };
    case 'personale':
      return { to: '/f/$familyId/c/$houseId/personale', params };
    case 'cassaforte':
      return { to: '/f/$familyId/c/$houseId/cassaforte', params };
  }
}
