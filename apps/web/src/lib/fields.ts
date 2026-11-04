import { currencySchema, localeSchema, timeZoneSchema } from '@domusafe/contracts';

/** Why a manual field cannot be submitted. */
export type IssueCode =
  'required' | 'email' | 'password-short' | 'password-mismatch' | 'timezone' | 'country' | 'too-long';

/** Field name to the reason it failed. Absent when the form can be submitted. */
export type FieldIssues = Readonly<Record<string, IssueCode>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * Turns a blank manual field into null for optional API strings.
 *
 * @param value - Raw input.
 * @returns Trimmed text, or null when nothing was written.
 */
export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function nameIssue(value: string, max: number): IssueCode | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'required';
  }
  if (trimmed.length > max) {
    return 'too-long';
  }
  return undefined;
}

function put(issues: Record<string, IssueCode>, field: string, issue: IssueCode | undefined): void {
  if (issue !== undefined) {
    issues[field] = issue;
  }
}

/**
 * Checks the account creation form.
 *
 * Preconditions: values are the raw field strings.
 * Postconditions: returns null when every field can be sent.
 * Data contract: the password must be at least 12 characters and repeated exactly.
 *
 * @param input - Name, email and the two password fields.
 * @returns Issues keyed by field, or null.
 */
export function validateSignUp(input: {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly confirm: string;
}): FieldIssues | null {
  const issues: Record<string, IssueCode> = {};
  put(issues, 'name', nameIssue(input.name, 80));
  if (!EMAIL.test(input.email.trim())) {
    issues.email = 'email';
  }
  if (input.password.length < 12) {
    issues.password = 'password-short';
  }
  if (input.password !== input.confirm) {
    issues.confirm = 'password-mismatch';
  }
  return Object.keys(issues).length === 0 ? null : issues;
}

/**
 * Checks the sign-in form.
 *
 * @param input - Email and password.
 * @returns Issues keyed by field, or null.
 */
export function validateSignIn(input: {
  readonly email: string;
  readonly password: string;
}): FieldIssues | null {
  const issues: Record<string, IssueCode> = {};
  if (!EMAIL.test(input.email.trim())) {
    issues.email = 'email';
  }
  if (input.password.length === 0) {
    issues.password = 'required';
  }
  return Object.keys(issues).length === 0 ? null : issues;
}

/** Values of the family form. The first house name is required only when creating. */
export interface FamilyFormValues {
  readonly name: string;
  readonly timezone: string;
  readonly currency: string;
  readonly locale: string;
  readonly houseName?: string;
}

/**
 * Checks the family form.
 *
 * Preconditions: `houseName` is present when creating a family.
 * Postconditions: timezone, currency and language match the API schemas.
 * Data contract: names are trimmed and at most 120 characters.
 *
 * @param input - Manual fields.
 * @param mode - `create` also requires the first house name.
 * @returns Issues keyed by field, or null.
 */
export function validateFamily(input: FamilyFormValues, mode: 'create' | 'edit'): FieldIssues | null {
  const issues: Record<string, IssueCode> = {};
  put(issues, 'name', nameIssue(input.name, 120));
  if (!timeZoneSchema.safeParse(input.timezone.trim()).success) {
    issues.timezone = input.timezone.trim().length === 0 ? 'required' : 'timezone';
  }
  if (!currencySchema.safeParse(input.currency).success) {
    issues.currency = 'required';
  }
  if (!localeSchema.safeParse(input.locale).success) {
    issues.locale = 'required';
  }
  if (mode === 'create') {
    put(issues, 'houseName', nameIssue(input.houseName ?? '', 120));
  }
  return Object.keys(issues).length === 0 ? null : issues;
}

/** Values of the house form. Address fields may be left blank. */
export interface HouseFormValues {
  readonly name: string;
  readonly addressLine: string;
  readonly postalCode: string;
  readonly city: string;
  readonly province: string;
  readonly country: string;
}

/**
 * Checks the house form.
 *
 * Preconditions: `country` is what the person typed, any case.
 * Postconditions: a valid country is two letters.
 * Data contract: optional address lines are at most the API limits.
 *
 * @param input - Manual fields.
 * @returns Issues keyed by field, or null.
 */
export function validateHouse(input: HouseFormValues): FieldIssues | null {
  const issues: Record<string, IssueCode> = {};
  put(issues, 'name', nameIssue(input.name, 120));
  if (input.addressLine.trim().length > 200) {
    issues.addressLine = 'too-long';
  }
  if (input.postalCode.trim().length > 16) {
    issues.postalCode = 'too-long';
  }
  if (input.city.trim().length > 120) {
    issues.city = 'too-long';
  }
  if (input.province.trim().length > 60) {
    issues.province = 'too-long';
  }
  const country = input.country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(country)) {
    issues.country = country.length === 0 ? 'required' : 'country';
  }
  return Object.keys(issues).length === 0 ? null : issues;
}
