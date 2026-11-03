/** Plan tiers from cheapest to most complete. */
export const PLAN_TIERS = ['free', 'basic', 'advanced', 'premium'] as const;
/** A family plan tier. */
export type PlanTier = (typeof PLAN_TIERS)[number];

/** Features that are not available in every plan (phase 3, §9.1). */
export const PLAN_FEATURES = [
  'sos',
  'finance',
  'home_automation',
  'integrations',
  'vault_family',
  'vault_personal',
  'taxes',
  'succession',
  'custom_fields',
  'audit_log',
  'realtime_sync',
  'branding',
] as const;
/** A plan-gated feature. */
export type PlanFeature = (typeof PLAN_FEATURES)[number];

/** Resources whose count is limited by the plan. */
export const LIMITED_RESOURCES = ['houses', 'residents', 'pets'] as const;
/** A count-limited resource. */
export type LimitedResource = (typeof LIMITED_RESOURCES)[number];

/** What a plan includes. A `null` limit means unlimited. */
export interface PlanDefinition {
  readonly tier: PlanTier;
  readonly limits: Readonly<Record<LimitedResource, number | null>>;
  readonly features: ReadonlySet<PlanFeature>;
  readonly watermark: boolean;
}

/** Length of the one-time Premium trial. */
export const PREMIUM_TRIAL_DAYS = 30;

const DAY_MS = 86_400_000;

const ADVANCED_FEATURES: readonly PlanFeature[] = [
  'finance',
  'home_automation',
  'integrations',
  'vault_family',
];

/** Plan catalogue: limits and features per tier. Bold values in phase 3 §9.1 come from the master prompt. */
export const PLAN_DEFINITIONS: Readonly<Record<PlanTier, PlanDefinition>> = {
  free: {
    tier: 'free',
    limits: { houses: 1, residents: 1, pets: 1 },
    features: new Set<PlanFeature>(),
    watermark: true,
  },
  basic: {
    tier: 'basic',
    limits: { houses: 1, residents: null, pets: null },
    features: new Set<PlanFeature>(['finance']),
    watermark: true,
  },
  advanced: {
    tier: 'advanced',
    limits: { houses: 3, residents: null, pets: null },
    features: new Set<PlanFeature>(ADVANCED_FEATURES),
    watermark: false,
  },
  premium: {
    tier: 'premium',
    limits: { houses: null, residents: null, pets: null },
    features: new Set<PlanFeature>(PLAN_FEATURES),
    watermark: false,
  },
};

/**
 * Position of a tier in `PLAN_TIERS`.
 *
 * @param tier - Plan tier.
 * @returns 0 for Free up to 3 for Premium.
 */
export function planRank(tier: PlanTier): number {
  return PLAN_TIERS.indexOf(tier);
}

/**
 * Whether a tier includes a feature.
 *
 * @param tier - Effective plan tier.
 * @param feature - Plan-gated feature.
 * @returns `true` when the feature is included.
 */
export function hasFeature(tier: PlanTier, feature: PlanFeature): boolean {
  return PLAN_DEFINITIONS[tier].features.has(feature);
}

/**
 * Cheapest tier that includes a feature, reported as `requiredPlan` in `403 plan_required`.
 *
 * @param feature - Plan-gated feature.
 * @returns The lowest tier with the feature.
 */
export function minimumPlanFor(feature: PlanFeature): PlanTier {
  return PLAN_TIERS.find((tier) => hasFeature(tier, feature)) ?? 'premium';
}

/**
 * Count limit of a resource.
 *
 * @param tier - Effective plan tier.
 * @param resource - Count-limited resource.
 * @returns The limit, or `null` when unlimited.
 */
export function limitFor(tier: PlanTier, resource: LimitedResource): number | null {
  return PLAN_DEFINITIONS[tier].limits[resource];
}

/**
 * Checks whether one more resource can be created.
 *
 * @param tier - Effective plan tier.
 * @param resource - Count-limited resource.
 * @param usage - Current number of active, non-locked resources (counted under `SELECT … FOR UPDATE`).
 * @returns `allowed` and the applicable limit.
 */
export function checkLimit(
  tier: PlanTier,
  resource: LimitedResource,
  usage: number,
): { readonly allowed: boolean; readonly limit: number | null } {
  const limit = limitFor(tier, resource);
  return { allowed: limit === null || usage < limit, limit };
}

/** A Premium trial window (one per account, phase 3 §6.4). */
export interface TrialWindow {
  readonly startedAt: Date;
  readonly endsAt: Date;
}

/** Plan applied to a family at a given instant. */
export interface EffectivePlan {
  readonly tier: PlanTier;
  readonly source: 'paid' | 'trial';
  readonly trialEndsAt: Date | null;
}

/**
 * End of a trial started at `startedAt`.
 *
 * @param startedAt - Trial start.
 * @returns `startedAt + 30 days`.
 */
export function trialEndsAt(startedAt: Date): Date {
  return new Date(startedAt.getTime() + PREMIUM_TRIAL_DAYS * DAY_MS);
}

/**
 * Computes the effective plan: Premium while the owner's trial on this family is running, otherwise the
 * paid (or operator-set) plan.
 *
 * @param paid - `families.plan`.
 * @param trial - Trial of the current owner on this family, or `null`.
 * @param now - Evaluation instant.
 * @returns The effective tier and where it comes from.
 */
export function effectivePlan(paid: PlanTier, trial: TrialWindow | null, now: Date): EffectivePlan {
  const trialActive = trial !== null && trial.startedAt <= now && now < trial.endsAt;
  if (trialActive && planRank('premium') > planRank(paid)) {
    return { tier: 'premium', source: 'trial', trialEndsAt: trial.endsAt };
  }
  return { tier: paid, source: 'paid', trialEndsAt: null };
}
