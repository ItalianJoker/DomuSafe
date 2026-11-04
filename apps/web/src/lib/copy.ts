import type { MemberRole } from '@domusafe/contracts';
import type { PlanTier } from '@domusafe/plans';
import { m } from '@/paraglide/messages.js';
import { ApiProblem } from './api.js';
import type { IssueCode } from './fields.js';

/**
 * Italian or English caption of a field problem.
 *
 * @param issue - Validation code.
 * @returns The sentence for the active language.
 */
export function issueText(issue: IssueCode): string {
  switch (issue) {
    case 'required':
      return m.fieldRequired();
    case 'email':
      return m.emailInvalid();
    case 'password-short':
      return m.passwordShort();
    case 'password-mismatch':
      return m.passwordMismatch();
    case 'timezone':
      return m.fieldTimezone();
    case 'country':
      return m.fieldCountry();
    case 'too-long':
      return m.fieldLong();
  }
}

/**
 * Caption of a family role.
 *
 * @param role - Role stored by the API.
 * @returns The plain-language name.
 */
export function roleText(role: MemberRole): string {
  switch (role) {
    case 'admin':
      return m.roleAdmin();
    case 'parent':
      return m.roleParent();
    case 'child':
      return m.roleChild();
    case 'caregiver':
      return m.roleAssistant();
    case 'guest':
      return m.roleGuest();
  }
}

/**
 * Caption of a plan tier.
 *
 * @param tier - Plan stored by the API.
 * @returns The plain-language name.
 */
export function planText(tier: PlanTier): string {
  switch (tier) {
    case 'free':
      return m.planFree();
    case 'basic':
      return m.planBasic();
    case 'advanced':
      return m.planAdvanced();
    case 'premium':
      return m.planPremium();
  }
}

/**
 * Sentence for a failed request.
 *
 * @param error - Thrown value.
 * @returns The problem title, or a connection message.
 */
export function problemText(error: unknown): string {
  if (error instanceof ApiProblem) {
    return error.problem.title;
  }
  return m.network();
}

/**
 * Caption of an auth failure.
 *
 * @param reason - Reason returned by the session client.
 * @returns The sentence for the active language.
 */
export function authFailureText(reason: 'credentials' | 'exists' | 'code' | 'generic'): string {
  switch (reason) {
    case 'credentials':
      return m.authCredentials();
    case 'exists':
      return m.authExists();
    case 'code':
      return m.authCode();
    case 'generic':
      return m.authGeneric();
  }
}
