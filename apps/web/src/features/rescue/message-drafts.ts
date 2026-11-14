/**
 * Phone-side rescue message drafts. DomuSafe never sends the message: the links open the
 * device apps with a prefilled body.
 *
 * Preconditions: `phone` is an international number when building a link.
 * Postconditions: bodies never include health facts (blood, allergies, medicines, conditions).
 * Data contract: `sms:` and `https://wa.me/` only. Practice text states that it is not an emergency.
 */

/** Kind of draft: a real call for help, or a practice run. */
export type RescueDraftKind = 'real' | 'practice';

/** Facts allowed in a draft body. No health fields. */
export interface RescueDraftInput {
  readonly kind: RescueDraftKind;
  readonly houseName: string;
  readonly personName: string;
}

/**
 * Whether a stored phone number can open a phone draft.
 *
 * @param phone - Stored number, or null.
 * @returns True when the value is international.
 */
export function canDraftTo(phone: string | null): phone is string {
  return phone !== null && /^\+[1-9]\d{1,14}$/.test(phone);
}

/**
 * Digits of an international number for `https://wa.me/`, without the leading plus.
 *
 * Preconditions: `phone` already passed {@link canDraftTo}.
 * Postconditions: only digits remain.
 *
 * @param phone - International number with a leading plus.
 * @returns Digits only.
 */
export function whatsAppDigits(phone: string): string {
  return phone.slice(1);
}

/**
 * Body of a rescue draft. Italian copy is supplied by the caller so this module stays free of
 * interface strings; the shape is fixed here so tests can forbid health data.
 *
 * Preconditions: names are already trimmed display strings.
 * Postconditions: the result mentions only names, the house and whether it is a practice run.
 *
 * @param input - Kind and names.
 * @param copy - Translated fragments for real and practice bodies.
 * @returns The body to put in the draft.
 */
export function rescueDraftBody(
  input: RescueDraftInput,
  copy: {
    readonly real: (args: { readonly houseName: string; readonly personName: string }) => string;
    readonly practice: (args: { readonly houseName: string; readonly personName: string }) => string;
  },
): string {
  const args = { houseName: input.houseName, personName: input.personName };
  return input.kind === 'practice' ? copy.practice(args) : copy.real(args);
}

/**
 * Builds an `sms:` draft link.
 *
 * Preconditions: `phone` passed {@link canDraftTo}.
 * Postconditions: the scheme is `sms:` and the body is URI-encoded.
 *
 * @param phone - International number.
 * @param body - Prefill text.
 * @returns The link.
 */
export function smsDraftHref(phone: string, body: string): string {
  return `sms:${phone}?body=${encodeURIComponent(body)}`;
}

/**
 * Builds a WhatsApp draft link on `https://wa.me/`.
 *
 * Preconditions: `phone` passed {@link canDraftTo}.
 * Postconditions: the host is `wa.me` and the path is digits only.
 *
 * @param phone - International number.
 * @param body - Prefill text.
 * @returns The link.
 */
export function whatsAppDraftHref(phone: string, body: string): string {
  return `https://wa.me/${whatsAppDigits(phone)}?text=${encodeURIComponent(body)}`;
}
