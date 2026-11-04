import {
  FAMILY_VAULT_SECTIONS,
  familyAccountPayloadSchema,
  billsPayloadSchema,
  creditProtectionPayloadSchema,
  digitalLegacyPayloadSchema,
  insurancePayloadSchema,
  mortgagePayloadSchema,
  type FamilyVaultSection,
  type VaultPayload,
} from '@domusafe/contracts';
import { DecryptionError, InvalidRecoveryPhraseError, validatePin } from '@domusafe/crypto';
import { ZodError } from 'zod';
import { ApiProblem } from '@/lib/api.js';
import { m } from '@/paraglide/messages.js';

/** Sections shown in the family vault, in screen order. */
export const VAULT_SECTIONS = FAMILY_VAULT_SECTIONS;

/**
 * Italian or English name of a section.
 *
 * @param section - Vault section.
 * @returns The label.
 */
export function sectionLabel(section: FamilyVaultSection): string {
  switch (section) {
    case 'family_accounts':
      return m.vaultSectionAccounts();
    case 'mortgages':
      return m.vaultSectionMortgages();
    case 'credit_protection':
      return m.vaultSectionCredit();
    case 'insurance_policies':
      return m.vaultSectionPolicies();
    case 'bills_and_cancellations':
      return m.vaultSectionBills();
    case 'digital_legacy':
      return m.vaultSectionLegacy();
  }
}

/** Relationship choices for a bank, without storing a full account number. */
export const BANK_RELATIONSHIPS = ['current_account', 'savings', 'investment', 'other'] as const;

/**
 * Label of a bank relationship.
 *
 * @param relationship - Stored choice.
 * @returns The plain-language name.
 */
export function relationshipLabel(relationship: (typeof BANK_RELATIONSHIPS)[number]): string {
  switch (relationship) {
    case 'current_account':
      return m.vaultRelationshipCurrent();
    case 'savings':
      return m.vaultRelationshipSavings();
    case 'investment':
      return m.vaultRelationshipInvestment();
    case 'other':
      return m.vaultRelationshipOther();
  }
}

/**
 * Short line shown on a saved document.
 *
 * @param section - Section of the document.
 * @param payload - Decrypted payload.
 * @returns A title taken from the payload.
 */
export function vaultSummary(section: FamilyVaultSection, payload: VaultPayload): string {
  switch (section) {
    case 'family_accounts':
      return familyAccountPayloadSchema.parse(payload).institution;
    case 'mortgages':
      return mortgagePayloadSchema.parse(payload).lender;
    case 'credit_protection':
      return creditProtectionPayloadSchema.parse(payload).provider;
    case 'insurance_policies':
      return insurancePayloadSchema.parse(payload).company;
    case 'bills_and_cancellations':
      return billsPayloadSchema.parse(payload).billsLocation;
    case 'digital_legacy': {
      const note = digitalLegacyPayloadSchema.parse(payload);
      return (
        note.appleHeirContact ?? note.googleInactiveAccount ?? note.passwordKitLocation ?? note.notes ?? ''
      );
    }
  }
}

/**
 * Local reason a code cannot be used.
 *
 * @param pin - Code typed by the person.
 * @returns A sentence, or `null` when the code is acceptable.
 */
export function codeProblem(pin: string): string | null {
  const result = validatePin(pin);
  if (result.ok) {
    return null;
  }
  if (result.reason === 'too_short') {
    return m.vaultCodeShort();
  }
  if (result.reason === 'too_long') {
    return m.vaultCodeLong();
  }
  return m.vaultCodeTrivial();
}

/** Failure raised by the vault flow before it reaches the server. */
export class VaultFlowError extends Error {
  readonly code: 'phrase' | 'phrase-wrong' | 'no-grant';

  /**
   * Creates a flow error.
   *
   * @param code - Why the step stopped.
   */
  constructor(code: 'phrase' | 'phrase-wrong' | 'no-grant') {
    super(code);
    this.name = 'VaultFlowError';
    this.code = code;
  }
}

/**
 * Sentence for a failed vault step. A wrong code does not throw out of the screen.
 *
 * @param error - Thrown value.
 * @returns The Italian or English sentence.
 */
export function vaultProblemText(error: unknown): string {
  if (error instanceof VaultFlowError) {
    if (error.code === 'phrase') {
      return m.vaultPhraseInvalid();
    }
    if (error.code === 'no-grant') {
      return m.vaultNoGrant();
    }
    return m.vaultPhraseWrong();
  }
  if (error instanceof InvalidRecoveryPhraseError) {
    return m.vaultPhraseInvalid();
  }
  if (error instanceof DecryptionError) {
    return m.vaultUnreadable();
  }
  if (error instanceof ZodError) {
    return m.vaultInvalid();
  }
  if (error instanceof ApiProblem) {
    if (error.problem.code === 'pin_invalid') {
      const left = error.problem.remainingAttempts;
      return left === undefined ? m.vaultCodeWrong() : m.vaultCodeWrongLeft({ count: String(left) });
    }
    if (error.problem.code === 'pin_locked') {
      return m.vaultCodeLocked();
    }
    if (error.problem.code === 'vault_locked') {
      return m.vaultClosed();
    }
    return error.problem.title;
  }
  return m.vaultUnexpected();
}
