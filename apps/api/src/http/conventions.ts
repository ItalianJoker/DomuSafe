import { decodeCursor, parseIfMatch, problemDetailsSchema } from '@domusafe/contracts';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ProblemError } from './problem.js';

/** Request headers documented on writes of versioned resources; unknown headers are kept. */
export const ifMatchHeaders = z.looseObject({
  'if-match': z
    .string()
    .optional()
    .meta({ description: 'Strong ETag of the version being changed, e.g. "3"' }),
});

/** Request headers documented on creations and actions; unknown headers are kept. */
export const idempotencyHeaders = z.looseObject({
  'idempotency-key': z
    .string()
    .optional()
    .meta({ description: 'UUID chosen by the client; replays return the stored response for 24 hours' }),
});

/**
 * Reads the expected version from `If-Match`.
 *
 * @param request - Current request.
 * @returns The version.
 * @throws ProblemError `precondition_required` when absent, `validation_failed` when malformed.
 */
export function requireIfMatch(request: FastifyRequest): number {
  const header = request.headers['if-match'];
  if (header === undefined) {
    throw new ProblemError('precondition_required');
  }
  const version = parseIfMatch(header);
  if (version === null) {
    throw new ProblemError('validation_failed', {
      errors: [
        { path: 'headers.if-match', code: 'invalid_etag', message: 'Expected a strong ETag such as "3"' },
      ],
    });
  }
  return version;
}

/**
 * Decodes a cursor whose sort key is a number.
 *
 * @param cursor - Opaque cursor or `undefined` for the first page.
 * @returns The position, or `null` for the first page.
 * @throws ProblemError `cursor_invalid`.
 */
export function numericCursor(cursor: string | undefined): readonly [number, string] | null {
  if (cursor === undefined) {
    return null;
  }
  const position = decodeCursor(cursor);
  if (position === null || typeof position[0] !== 'number') {
    throw new ProblemError('cursor_invalid');
  }
  return [position[0], position[1]];
}

/**
 * Decodes a cursor whose sort key is an RFC 3339 instant.
 *
 * @param cursor - Opaque cursor or `undefined` for the first page.
 * @returns The position, or `null` for the first page.
 * @throws ProblemError `cursor_invalid`.
 */
export function instantCursor(cursor: string | undefined): readonly [string, string] | null {
  if (cursor === undefined) {
    return null;
  }
  const position = decodeCursor(cursor);
  if (position === null || typeof position[0] !== 'string' || Number.isNaN(Date.parse(position[0]))) {
    throw new ProblemError('cursor_invalid');
  }
  return [position[0], position[1]];
}

/**
 * Problem Details response schemas for OpenAPI, keyed by status.
 *
 * @param statuses - HTTP statuses the route can answer with a problem.
 * @returns Response schema map.
 */
export function problemResponses(...statuses: number[]): Record<number, typeof problemDetailsSchema> {
  return Object.fromEntries(statuses.map((status) => [status, problemDetailsSchema]));
}
