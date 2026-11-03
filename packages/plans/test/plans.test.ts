import { describe, expect, it } from 'vitest';
import {
  PLAN_DEFINITIONS,
  checkLimit,
  effectivePlan,
  hasFeature,
  limitFor,
  minimumPlanFor,
  trialEndsAt,
} from '../src/index.js';

describe('plan catalogue', () => {
  it('applies the master-prompt limits', () => {
    expect(limitFor('free', 'houses')).toBe(1);
    expect(limitFor('basic', 'houses')).toBe(1);
    expect(limitFor('advanced', 'houses')).toBe(3);
    expect(limitFor('premium', 'houses')).toBeNull();
    expect(limitFor('free', 'residents')).toBe(1);
    expect(limitFor('basic', 'residents')).toBeNull();
    expect(limitFor('basic', 'pets')).toBeNull();
  });

  it('gates features as decided in phase 3', () => {
    expect(hasFeature('advanced', 'vault_family')).toBe(true);
    expect(hasFeature('advanced', 'vault_personal')).toBe(false);
    expect(hasFeature('basic', 'finance')).toBe(true);
    expect(hasFeature('free', 'finance')).toBe(false);
    expect(minimumPlanFor('sos')).toBe('premium');
    expect(minimumPlanFor('home_automation')).toBe('advanced');
    expect(minimumPlanFor('finance')).toBe('basic');
  });

  it('keeps every lower-tier feature in higher tiers', () => {
    const tiers = ['free', 'basic', 'advanced', 'premium'] as const;
    for (let index = 1; index < tiers.length; index += 1) {
      const lower = PLAN_DEFINITIONS[tiers[index - 1]!];
      const higher = PLAN_DEFINITIONS[tiers[index]!];
      for (const feature of lower.features) {
        expect(higher.features.has(feature)).toBe(true);
      }
    }
  });

  it('watermarks only Free and Basic', () => {
    expect(PLAN_DEFINITIONS.free.watermark).toBe(true);
    expect(PLAN_DEFINITIONS.basic.watermark).toBe(true);
    expect(PLAN_DEFINITIONS.advanced.watermark).toBe(false);
  });

  it('checks limits against current usage', () => {
    expect(checkLimit('free', 'houses', 0)).toEqual({ allowed: true, limit: 1 });
    expect(checkLimit('free', 'houses', 1)).toEqual({ allowed: false, limit: 1 });
    expect(checkLimit('premium', 'houses', 500)).toEqual({ allowed: true, limit: null });
  });
});

describe('effective plan and trial', () => {
  const startedAt = new Date('2026-11-01T10:00:00Z');
  const trial = { startedAt, endsAt: trialEndsAt(startedAt) };

  it('lasts exactly 30 days', () => {
    expect(trial.endsAt.toISOString()).toBe('2026-12-01T10:00:00.000Z');
  });

  it('upgrades to Premium while the trial runs and falls back afterwards', () => {
    expect(effectivePlan('basic', trial, new Date('2026-11-15T00:00:00Z'))).toEqual({
      tier: 'premium',
      source: 'trial',
      trialEndsAt: trial.endsAt,
    });
    expect(effectivePlan('basic', trial, trial.endsAt)).toEqual({ tier: 'basic', source: 'paid', trialEndsAt: null });
    expect(effectivePlan('free', null, new Date())).toEqual({ tier: 'free', source: 'paid', trialEndsAt: null });
  });

  it('does not report a trial on a family that already pays for Premium', () => {
    expect(effectivePlan('premium', trial, new Date('2026-11-15T00:00:00Z')).source).toBe('paid');
  });
});
