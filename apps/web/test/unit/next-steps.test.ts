import { describe, expect, it } from 'vitest';
import {
  buildNextSteps,
  completenessColumns,
  hasCasaBasics,
  hasEmergencyBasics,
  hasResidents,
  nextStepsProgress,
  type NextStepsSnapshot,
} from '../../src/features/home/next-steps.js';

function snapshot(patch: Partial<NextStepsSnapshot> = {}): NextStepsSnapshot {
  return {
    houseName: 'Casa al mare',
    shutoffs: [
      { kind: 'water', location: 'Sotto il lavello' },
      { kind: 'gas', location: 'Balcone' },
      { kind: 'electricity', location: 'Corridoio' },
    ],
    residents: [{ displayName: 'Anna', usualBedroom: 'Camera', hasPhoto: true }],
    rescueResidents: [
      {
        allergies: ['penicillina'],
        medicines: [{ name: 'Insulina' }],
        contacts: [{ phone: '+390000000000' }],
        bloodGroup: 'a_positive',
      },
    ],
    utilityCount: 1,
    vaultPinSet: true,
    vaultAvailable: true,
    canReadTechnical: true,
    canReadResidents: true,
    canReadRescue: true,
    canReadUtilities: true,
    canOpenVault: true,
    ...patch,
  };
}

describe('next steps scoring', () => {
  it('marks casa basics only with a name and a main shutoff', () => {
    expect(hasCasaBasics(snapshot({ shutoffs: [] }))).toBe(false);
    expect(hasCasaBasics(snapshot({ houseName: '  ' }))).toBe(false);
    expect(hasCasaBasics(snapshot())).toBe(true);
  });

  it('requires a named resident and rescue basics', () => {
    expect(hasResidents(snapshot({ residents: [] }))).toBe(false);
    expect(hasEmergencyBasics(snapshot({ rescueResidents: [] }))).toBe(false);
    expect(hasEmergencyBasics(snapshot())).toBe(true);
  });

  it('returns independent completeness columns', () => {
    const columns = completenessColumns(snapshot());
    expect(columns.map((column) => column.id)).toEqual(['casa', 'residenti', 'emergenza']);
    expect(columns.every((column) => column.percent === 100)).toBe(true);
  });

  it('picks the first incomplete available step', () => {
    const steps = buildNextSteps(
      snapshot({
        shutoffs: [],
        residents: [],
        rescueResidents: [],
        utilityCount: 0,
        vaultPinSet: false,
      }),
    );
    const progress = nextStepsProgress(steps);
    expect(progress.next?.id).toBe('casa');
    expect(progress.done).toBe(0);
    expect(progress.total).toBe(5);
  });

  it('skips vault when the plan does not include it', () => {
    const steps = buildNextSteps(snapshot({ vaultAvailable: false, vaultPinSet: false }));
    const progress = nextStepsProgress(steps);
    expect(progress.total).toBe(4);
    expect(steps.find((step) => step.id === 'cassaforte')?.available).toBe(false);
  });

  it('reports completion when every available step is done', () => {
    const progress = nextStepsProgress(buildNextSteps(snapshot()));
    expect(progress.next).toBeNull();
    expect(progress.percent).toBe(100);
  });
});
