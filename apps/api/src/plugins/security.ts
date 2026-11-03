import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { HEADERS } from '@domusafe/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Redis } from 'ioredis';
import { ProblemError } from '../http/problem.js';

/** Options of the security plugin. */
export interface SecurityOptions {
  readonly trustedOrigins: readonly string[];
  readonly production: boolean;
  /** Shared Valkey client for rate-limit counters; in-process counters when `null`. */
  readonly redis: Redis | null;
  /** Requests per minute per IP address (phase 3 §10). */
  readonly globalLimitPerMinute?: number;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function checkCsrf(request: FastifyRequest, trustedOrigins: readonly string[]): void {
  if (!MUTATING.has(request.method)) {
    return;
  }
  const origin = request.headers.origin;
  if (request.url.startsWith('/api/auth/')) {
    if (origin !== undefined && !trustedOrigins.includes(origin)) {
      throw new ProblemError('csrf_rejected', { detail: 'Origin not allowed' });
    }
    return;
  }
  if (!request.url.startsWith('/api/v1/')) {
    return;
  }
  if (request.headers[HEADERS.csrf] !== '1') {
    throw new ProblemError('csrf_rejected', { detail: 'Missing X-DomuSafe-Request header' });
  }
  if (origin !== undefined && !trustedOrigins.includes(origin)) {
    throw new ProblemError('csrf_rejected', { detail: 'Origin not allowed' });
  }
  if (request.headers['sec-fetch-site'] === 'cross-site') {
    throw new ProblemError('csrf_rejected', { detail: 'Cross-site request' });
  }
}

/**
 * Cross-cutting HTTP security (phase 1 §8): security headers, shared rate limit and CSRF defence for
 * cookie-authenticated mutations (`Origin` allow-list plus the `X-DomuSafe-Request` header). Better Auth
 * writes on `/api/auth` get the `Origin` allow-list too, which also blocks login CSRF for cookieless requests.
 */
export const securityPlugin = fp<SecurityOptions>(
  async (app: FastifyInstance, options) => {
    await app.register(helmet, {
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      strictTransportSecurity: options.production ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    });

    await app.register(rateLimit, {
      global: true,
      max: options.globalLimitPerMinute ?? 600,
      timeWindow: '1 minute',
      ...(options.redis === null ? {} : { redis: options.redis, nameSpace: 'domusafe:rl:' }),
      errorResponseBuilder: (_request, context) =>
        new ProblemError('rate_limited', { retryAfterSeconds: Math.max(1, Math.ceil(context.ttl / 1000)) }),
    });

    app.addHook('onRequest', async (request) => {
      checkCsrf(request, options.trustedOrigins);
    });
  },
  { name: 'domusafe-security' },
);
