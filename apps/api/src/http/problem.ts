import {
  PROBLEM_STATUS,
  PROBLEM_TITLES,
  problemType,
  type ProblemCode,
  type ProblemDetails,
  type ProblemExtensions,
} from '@domusafe/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Error thrown by services and hooks to answer with an RFC 9457 problem.
 * Only codes of the closed catalogue exist; extensions are typed.
 */
export class ProblemError extends Error {
  override readonly name = 'ProblemError';
  readonly code: ProblemCode;
  readonly extensions: ProblemExtensions;

  /**
   * Creates a problem error.
   *
   * @param code - Problem code (determines the HTTP status).
   * @param extensions - Optional `detail` and typed extension fields.
   */
  constructor(code: ProblemCode, extensions: ProblemExtensions = {}) {
    super(extensions.detail ?? code);
    this.code = code;
    this.extensions = extensions;
  }
}

/**
 * Chooses the language of problem titles from `Accept-Language` (Italian by default).
 *
 * @param header - Raw `Accept-Language` header.
 * @returns `en` when English is preferred over Italian, otherwise `it`.
 */
export function preferredLanguage(header: string | undefined): 'it' | 'en' {
  if (header === undefined) {
    return 'it';
  }
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
      return { lang: tag.toLowerCase().slice(0, 2), q: q === undefined ? 1 : Number(q.slice(2)) || 0 };
    })
    .filter((entry) => entry.lang === 'it' || entry.lang === 'en')
    .sort((a, b) => b.q - a.q);
  return ranked[0]?.lang === 'en' ? 'en' : 'it';
}

/**
 * Builds the problem body for a request.
 *
 * @param request - Current request (for `instance`, `requestId` and language).
 * @param code - Problem code.
 * @param extensions - Optional detail and extension fields.
 * @returns Problem Details object.
 */
export function buildProblem(
  request: FastifyRequest,
  code: ProblemCode,
  extensions: ProblemExtensions = {},
): ProblemDetails {
  return {
    type: problemType(code),
    title: PROBLEM_TITLES[code][preferredLanguage(request.headers['accept-language'])],
    status: PROBLEM_STATUS[code],
    instance: request.url.split('?')[0] ?? request.url,
    code,
    requestId: request.id,
    ...extensions,
  };
}

/**
 * Sends a problem response with `application/problem+json`.
 *
 * @param request - Current request.
 * @param reply - Reply to send.
 * @param code - Problem code.
 * @param extensions - Optional detail and extension fields.
 * @returns The reply, already sent.
 */
export async function sendProblem(
  request: FastifyRequest,
  reply: FastifyReply,
  code: ProblemCode,
  extensions: ProblemExtensions = {},
): Promise<FastifyReply> {
  const body = buildProblem(request, code, extensions);
  if (extensions.retryAfterSeconds !== undefined) {
    void reply.header('retry-after', String(extensions.retryAfterSeconds));
  }
  return reply.status(body.status).type('application/problem+json; charset=utf-8').send(body);
}

/** PostgreSQL error classes the services translate into problems. */
export type DatabaseFailure = 'rls_denied' | 'unique' | 'check' | 'foreign_key' | 'other';

/**
 * Classifies an error raised by a database call (Drizzle wraps the driver error in `cause`).
 *
 * @param error - Thrown value.
 * @returns The failure class and the constraint name when available.
 */
export function classifyDatabaseError(error: unknown): { kind: DatabaseFailure; constraint: string | null } {
  const source = error instanceof Error && error.cause !== undefined ? error.cause : error;
  const code = typeof source === 'object' && source !== null && 'code' in source ? String(source.code) : '';
  const constraint =
    typeof source === 'object' &&
    source !== null &&
    'constraint' in source &&
    typeof source.constraint === 'string'
      ? source.constraint
      : null;
  switch (code) {
    case '42501':
      return { kind: 'rls_denied', constraint };
    case '23505':
      return { kind: 'unique', constraint };
    case '23514':
      return { kind: 'check', constraint };
    case '23503':
      return { kind: 'foreign_key', constraint };
    default:
      return { kind: 'other', constraint };
  }
}
