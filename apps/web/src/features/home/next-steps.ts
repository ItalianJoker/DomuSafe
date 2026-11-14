/**
 * Adoption cues for the house dashboard: completeness columns and ordered next steps.
 *
 * Preconditions: the snapshot uses Class-C (and intentionally readable rescue) fields already
 * returned by the API; no vault plaintext is included.
 * Postconditions: step order is fixed; unavailable steps are skipped when picking the next one.
 * Data contract: percentages and `done` flags are computed only in the browser.
 */

/** Identifier of one adoption step. */
export type NextStepId = 'casa' | 'residenti' | 'emergenza' | 'utenze' | 'cassaforte';

/** Section (or Casa tab) a step opens. */
export type NextStepTarget = 'casa' | 'casa-technical' | 'casa-utilities' | 'personale' | 'cassaforte';

/** One ordered cue on the dashboard. */
export interface NextStep {
  readonly id: NextStepId;
  readonly target: NextStepTarget;
  readonly done: boolean;
  readonly available: boolean;
}

/** One completeness column on the dashboard. */
export interface CompletenessColumn {
  readonly id: 'casa' | 'residenti' | 'emergenza';
  readonly done: number;
  readonly total: number;
  readonly percent: number;
}

/** Inputs used to score the open house without inventing new APIs. */
export interface NextStepsSnapshot {
  readonly houseName: string;
  readonly shutoffs: readonly {
    readonly kind: string;
    readonly location: string;
  }[];
  readonly residents: readonly {
    readonly displayName: string;
    readonly usualBedroom: string | null;
    readonly hasPhoto: boolean;
  }[];
  readonly rescueResidents: readonly {
    readonly allergies: readonly string[];
    readonly medicines: readonly { readonly name: string }[];
    readonly contacts: readonly { readonly phone: string | null }[];
    readonly bloodGroup: string | null;
  }[];
  readonly utilityCount: number;
  readonly vaultPinSet: boolean;
  readonly vaultAvailable: boolean;
  readonly canReadTechnical: boolean;
  readonly canReadResidents: boolean;
  readonly canReadRescue: boolean;
  readonly canReadUtilities: boolean;
  readonly canOpenVault: boolean;
}

/**
 * Whether the house has a name and at least one main cutoff location.
 *
 * @param snapshot - Dashboard inputs.
 * @returns True when casa basics are present.
 */
export function hasCasaBasics(snapshot: NextStepsSnapshot): boolean {
  if (snapshot.houseName.trim() === '') {
    return false;
  }
  return snapshot.shutoffs.some(
    (item) =>
      (item.kind === 'water' || item.kind === 'gas' || item.kind === 'electricity') &&
      item.location.trim() !== '',
  );
}

/**
 * Whether at least one resident has a name.
 *
 * @param snapshot - Dashboard inputs.
 * @returns True when a named resident exists.
 */
export function hasResidents(snapshot: NextStepsSnapshot): boolean {
  return snapshot.residents.some((person) => person.displayName.trim() !== '');
}

/**
 * Whether at least one rescue card has an allergy, lifesaving medicine or phone contact.
 *
 * @param snapshot - Dashboard inputs.
 * @returns True when emergency basics are present.
 */
export function hasEmergencyBasics(snapshot: NextStepsSnapshot): boolean {
  return snapshot.rescueResidents.some(
    (person) =>
      person.allergies.length > 0 ||
      person.medicines.some((medicine) => medicine.name.trim() !== '') ||
      person.contacts.some((contact) => contact.phone !== null && contact.phone.trim() !== ''),
  );
}

/**
 * Completeness of Casa, Residenti and Emergenza as independent percentages.
 *
 * @param snapshot - Dashboard inputs.
 * @returns Three columns in display order.
 */
export function completenessColumns(snapshot: NextStepsSnapshot): readonly CompletenessColumn[] {
  return [scoreCasa(snapshot), scoreResidenti(snapshot), scoreEmergenza(snapshot)];
}

/**
 * Ordered adoption steps for the open house.
 *
 * @param snapshot - Dashboard inputs.
 * @returns Steps in fixed engagement order.
 */
export function buildNextSteps(snapshot: NextStepsSnapshot): readonly NextStep[] {
  return [
    {
      id: 'casa',
      target: 'casa-technical',
      done: hasCasaBasics(snapshot),
      available: snapshot.canReadTechnical,
    },
    {
      id: 'residenti',
      target: 'personale',
      done: hasResidents(snapshot),
      available: snapshot.canReadResidents,
    },
    {
      id: 'emergenza',
      target: 'personale',
      done: hasEmergencyBasics(snapshot),
      available: snapshot.canReadRescue,
    },
    {
      id: 'utenze',
      target: 'casa-utilities',
      done: snapshot.utilityCount > 0,
      available: snapshot.canReadUtilities,
    },
    {
      id: 'cassaforte',
      target: 'cassaforte',
      done: snapshot.vaultPinSet,
      available: snapshot.vaultAvailable && snapshot.canOpenVault,
    },
  ];
}

/**
 * Progress across available steps and the single next incomplete step.
 *
 * @param steps - Result of {@link buildNextSteps}.
 * @returns Counts, percent and the next cue (or null when complete).
 */
export function nextStepsProgress(steps: readonly NextStep[]): {
  readonly done: number;
  readonly total: number;
  readonly percent: number;
  readonly next: NextStep | null;
} {
  const actionable = steps.filter((step) => step.available);
  const done = actionable.filter((step) => step.done).length;
  const total = actionable.length;
  return {
    done,
    total,
    percent: total === 0 ? 100 : Math.round((done / total) * 100),
    next: actionable.find((step) => !step.done) ?? null,
  };
}

function scoreCasa(snapshot: NextStepsSnapshot): CompletenessColumn {
  const kinds = new Set(
    snapshot.shutoffs.filter((item) => item.location.trim() !== '').map((item) => item.kind),
  );
  const checks = [
    snapshot.houseName.trim() !== '',
    kinds.has('water'),
    kinds.has('gas'),
    kinds.has('electricity'),
  ];
  return column('casa', checks);
}

function scoreResidenti(snapshot: NextStepsSnapshot): CompletenessColumn {
  if (snapshot.residents.length === 0) {
    return { id: 'residenti', done: 0, total: 3, percent: 0 };
  }
  const named = snapshot.residents.filter((person) => person.displayName.trim() !== '').length;
  const withRoom = snapshot.residents.filter(
    (person) => person.usualBedroom !== null && person.usualBedroom.trim() !== '',
  ).length;
  const withPhoto = snapshot.residents.filter((person) => person.hasPhoto).length;
  const checks = [named > 0, named === snapshot.residents.length, withRoom > 0 || withPhoto > 0];
  return column('residenti', checks);
}

function scoreEmergenza(snapshot: NextStepsSnapshot): CompletenessColumn {
  if (snapshot.rescueResidents.length === 0) {
    return { id: 'emergenza', done: 0, total: 4, percent: 0 };
  }
  const withAllergyOrMed = snapshot.rescueResidents.some(
    (person) =>
      person.allergies.length > 0 || person.medicines.some((medicine) => medicine.name.trim() !== ''),
  );
  const withIce = snapshot.rescueResidents.some((person) =>
    person.contacts.some((contact) => contact.phone !== null && contact.phone.trim() !== ''),
  );
  const withBlood = snapshot.rescueResidents.some(
    (person) => person.bloodGroup !== null && person.bloodGroup !== 'unknown',
  );
  const withCutoff = snapshot.shutoffs.some(
    (item) => (item.kind === 'water' || item.kind === 'gas') && item.location.trim() !== '',
  );
  return column('emergenza', [withAllergyOrMed, withIce, withBlood, withCutoff]);
}

function column(id: CompletenessColumn['id'], checks: readonly boolean[]): CompletenessColumn {
  const done = checks.filter(Boolean).length;
  const total = checks.length;
  return {
    id,
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}
