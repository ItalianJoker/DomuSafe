import { createHash } from 'node:crypto';
import { uuidSchema } from '@domusafe/contracts';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { ProblemError } from '../http/problem.js';
import type { KeyValueStore } from '../infra/kv.js';

/** How long a response is replayable (phase 3 §11). */
export const IDEMPOTENCY_TTL_SECONDS = 86_400;

const storedSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending'), fingerprint: z.string() }),
  z.object({
    state: z.literal('done'),
    fingerprint: z.string(),
    status: z.int(),
    contentType: z.string().nullable(),
    etag: z.string().nullable(),
    location: z.string().nullable(),
    body: z.string(),
  }),
]);

function parseStored(raw: string | null): z.infer<typeof storedSchema> | null {
  if (raw === null) {
    return null;
  }
  const parsed = storedSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

function headerText(value: number | string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * `Idempotency-Key` support for routes with `config.idempotent` (phase 3 §2.2): the first request is
 * reserved, its response stored for 24 hours and replayed for retries with the same key and body; the
 * same key with a different request answers `422 idempotency_key_reused`; a retry while the first request
 * is running answers `409 duplicate`. Responses with status 5xx or 429 are not stored.
 */
export const idempotencyPlugin = fp<{ store: KeyValueStore }>(
  async (app: FastifyInstance, { store }) => {
    app.addHook('preHandler', async (request, reply) => {
      if (request.routeOptions.config.idempotent !== true) {
        return;
      }
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || !uuidSchema.safeParse(key).success) {
        throw new ProblemError('validation_failed', {
          errors: [
            { path: 'headers.idempotency-key', code: 'required', message: 'Idempotency-Key must be a UUID' },
          ],
        });
      }
      const storeKey = `domusafe:idem:${request.account?.id ?? request.ip}:${key}`;
      const fingerprint = createHash('sha256')
        .update(`${request.method} ${request.url}\n${JSON.stringify(request.body ?? null)}`)
        .digest('hex');
      const pending = JSON.stringify({ state: 'pending', fingerprint });
      if (await store.setIfAbsent(storeKey, pending, IDEMPOTENCY_TTL_SECONDS)) {
        request.idempotencyKey = { key: storeKey, fingerprint };
        return;
      }
      const saved = parseStored(await store.get(storeKey));
      if (saved === null) {
        await store.set(storeKey, pending, IDEMPOTENCY_TTL_SECONDS);
        request.idempotencyKey = { key: storeKey, fingerprint };
        return;
      }
      if (saved.fingerprint !== fingerprint) {
        throw new ProblemError('idempotency_key_reused');
      }
      if (saved.state === 'pending') {
        throw new ProblemError('duplicate', { detail: 'The same request is still being processed' });
      }
      void reply.header('idempotent-replayed', 'true');
      if (saved.etag !== null) {
        void reply.header('etag', saved.etag);
      }
      if (saved.location !== null) {
        void reply.header('location', saved.location);
      }
      if (saved.contentType !== null) {
        void reply.type(saved.contentType);
      }
      return reply.status(saved.status).send(saved.body);
    });

    app.addHook('onSend', async (request, reply, payload) => {
      const reservation = request.idempotencyKey;
      if (reservation === null) {
        return payload;
      }
      if (reply.statusCode >= 500 || reply.statusCode === 429) {
        await store.delete(reservation.key);
        return payload;
      }
      const body =
        typeof payload === 'string'
          ? payload
          : Buffer.isBuffer(payload)
            ? payload.toString('utf8')
            : JSON.stringify(payload ?? null);
      await store.set(
        reservation.key,
        JSON.stringify({
          state: 'done',
          fingerprint: reservation.fingerprint,
          status: reply.statusCode,
          contentType: headerText(reply.getHeader('content-type')),
          etag: headerText(reply.getHeader('etag')),
          location: headerText(reply.getHeader('location')),
          body,
        }),
        IDEMPOTENCY_TTL_SECONDS,
      );
      return payload;
    });
  },
  { name: 'domusafe-idempotency', dependencies: ['domusafe-access'] },
);
