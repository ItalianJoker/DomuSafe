import { familyAccountPayloadSchema } from '@domusafe/contracts';
import { describe, expect, it } from 'vitest';
import { ApiProblem } from '../../src/lib/api.js';
import { phraseMatches } from '../../src/features/vault/crypto-flow.js';
import { codeProblem, vaultProblemText } from '../../src/features/vault/model.js';

describe('family vault', () => {
  it('keeps a bank relationship to a short reference', () => {
    expect(
      familyAccountPayloadSchema.safeParse({
        schema: 1,
        institution: 'Banca dei tigli',
        relationship: 'current_account',
        holder: 'Famiglia Rossi',
        referenceHint: '4321',
      }).success,
    ).toBe(true);
    expect(
      familyAccountPayloadSchema.safeParse({
        schema: 1,
        institution: 'Banca dei tigli',
        relationship: 'current_account',
        holder: 'Famiglia Rossi',
        referenceHint: '12345678',
      }).success,
    ).toBe(false);
  });

  it('explains a wrong code without throwing', () => {
    expect(codeProblem('123456')).toBeTruthy();
    expect(codeProblem('casa-tigli')).toBeNull();
    const text = vaultProblemText(
      new ApiProblem({
        type: 'urn:domusafe:problem:pin_invalid',
        title: 'Codice non corretto',
        status: 401,
        code: 'pin_invalid',
        requestId: 'req',
        remainingAttempts: 2,
      }),
    );
    expect(text).toContain('2');
    expect(() => vaultProblemText(new Error('boom'))).not.toThrow();
  });

  it('accepts only the words from the recovery phrase', () => {
    const words = ['abete', 'casa', 'donna'];
    expect(phraseMatches(words, [0, 2], ['Abete', 'donna'])).toBe(true);
    expect(phraseMatches(words, [1], ['casa '])).toBe(true);
    expect(phraseMatches(words, [1], ['case'])).toBe(false);
  });
});
