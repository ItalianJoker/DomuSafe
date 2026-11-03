import { z } from 'zod';
import { PLAN_TIERS } from '@domusafe/plans';

/** Closed catalogue of problem codes with their HTTP status (phase 3 §3). */
export const PROBLEM_STATUS = {
  validation_failed: 400,
  cursor_invalid: 400,
  envelope_invalid: 400,
  unauthenticated: 401,
  session_revoked: 401,
  device_revoked: 401,
  pin_invalid: 401,
  forbidden: 403,
  plan_required: 403,
  plan_limit_reached: 403,
  plan_locked: 403,
  reauthentication_required: 403,
  two_factor_setup_required: 403,
  csrf_rejected: 403,
  not_found: 404,
  version_conflict: 409,
  duplicate: 409,
  key_version_stale: 409,
  gone: 410,
  payload_too_large: 413,
  unsupported_media_type: 415,
  idempotency_key_reused: 422,
  domain_rule_violated: 422,
  vault_locked: 423,
  pin_locked: 423,
  precondition_required: 428,
  rate_limited: 429,
  upstream_unavailable: 502,
  maintenance: 503,
  internal_error: 500,
} as const;

/** A problem code. */
export type ProblemCode = keyof typeof PROBLEM_STATUS;
/** All problem codes. */
export const PROBLEM_CODES = Object.keys(PROBLEM_STATUS) as [ProblemCode, ...ProblemCode[]];

/**
 * URN used as the RFC 9457 `type` of a problem.
 *
 * @param code - Problem code.
 * @returns `urn:domusafe:problem:<code>`.
 */
export function problemType(code: ProblemCode): string {
  return `urn:domusafe:problem:${code}`;
}

/** One validation issue reported in `errors`. */
export const problemIssueSchema = z
  .object({ path: z.string(), code: z.string(), message: z.string() })
  .strict()
  .meta({ id: 'ProblemIssue' });

/** RFC 9457 Problem Details with DomuSafe extensions. */
export const problemDetailsSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.int().min(400).max(599),
    detail: z.string().optional(),
    instance: z.string().optional(),
    code: z.enum(PROBLEM_CODES),
    requestId: z.string(),
    errors: z.array(problemIssueSchema).optional(),
    currentVersion: z.int().optional(),
    requiredPlan: z.enum(PLAN_TIERS).optional(),
    limit: z.int().optional(),
    usage: z.int().optional(),
    remainingAttempts: z.int().optional(),
    retryAfterSeconds: z.int().optional(),
    currentKeyVersion: z.int().optional(),
  })
  .strict()
  .meta({ id: 'ProblemDetails', description: 'RFC 9457 Problem Details' });
/** RFC 9457 Problem Details with DomuSafe extensions. */
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
/** Optional extension fields of a problem. */
export type ProblemExtensions = Partial<
  Pick<
    ProblemDetails,
    | 'errors'
    | 'currentVersion'
    | 'requiredPlan'
    | 'limit'
    | 'usage'
    | 'remainingAttempts'
    | 'retryAfterSeconds'
    | 'currentKeyVersion'
    | 'detail'
  >
>;

/** Italian and English titles of every problem code, used when `Accept-Language` asks for them. */
export const PROBLEM_TITLES: Readonly<Record<ProblemCode, { readonly it: string; readonly en: string }>> = {
  validation_failed: { it: 'I dati inviati non sono validi', en: 'The submitted data is not valid' },
  cursor_invalid: { it: 'Il segnalibro della pagina non è valido', en: 'The page cursor is not valid' },
  envelope_invalid: { it: 'Il contenuto cifrato non è valido', en: 'The encrypted content is not valid' },
  unauthenticated: { it: 'Accesso richiesto', en: 'Sign-in required' },
  session_revoked: { it: 'La sessione è stata chiusa', en: 'The session was revoked' },
  device_revoked: { it: 'Il dispositivo è stato scollegato', en: 'The device was revoked' },
  pin_invalid: { it: 'PIN non corretto', en: 'Incorrect PIN' },
  forbidden: { it: 'Azione non consentita', en: 'Action not allowed' },
  plan_required: { it: 'Funzione non inclusa nel piano', en: 'Feature not included in the plan' },
  plan_limit_reached: { it: 'Limite del piano raggiunto', en: 'Plan limit reached' },
  plan_locked: { it: 'Dato in sola lettura con il piano attuale', en: 'Read-only with the current plan' },
  reauthentication_required: {
    it: 'Conferma di nuovo la tua identità',
    en: 'Please confirm your identity again',
  },
  two_factor_setup_required: {
    it: 'Attiva la verifica in due passaggi per continuare',
    en: 'Enable two-step verification to continue',
  },
  csrf_rejected: { it: 'Richiesta non riconosciuta', en: 'Request not recognised' },
  not_found: { it: 'Elemento non trovato', en: 'Item not found' },
  version_conflict: {
    it: 'La risorsa è stata modificata da un altro utente',
    en: 'The resource was changed by someone else',
  },
  duplicate: { it: 'Esiste già un elemento uguale', en: 'An identical item already exists' },
  key_version_stale: {
    it: 'Le chiavi di sicurezza sono state aggiornate',
    en: 'The security keys were updated',
  },
  gone: { it: 'Non più disponibile', en: 'No longer available' },
  payload_too_large: { it: 'Contenuto troppo grande', en: 'Content too large' },
  unsupported_media_type: { it: 'Formato non supportato', en: 'Unsupported format' },
  idempotency_key_reused: {
    it: 'Richiesta ripetuta con dati diversi',
    en: 'Request repeated with different data',
  },
  domain_rule_violated: { it: 'Operazione non coerente', en: 'Operation not consistent' },
  vault_locked: { it: 'La Cassaforte è chiusa', en: 'The vault is locked' },
  pin_locked: { it: 'PIN bloccato', en: 'PIN locked' },
  precondition_required: {
    it: 'Manca la versione della risorsa',
    en: 'The resource version is missing',
  },
  rate_limited: { it: 'Troppe richieste, riprova tra poco', en: 'Too many requests, try again shortly' },
  upstream_unavailable: { it: 'Servizio esterno non raggiungibile', en: 'External service unavailable' },
  maintenance: { it: 'Manutenzione in corso', en: 'Maintenance in progress' },
  internal_error: { it: 'Errore imprevisto', en: 'Unexpected error' },
};
