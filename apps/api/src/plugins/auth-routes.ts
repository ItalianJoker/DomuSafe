import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { Auth } from '../auth/auth.js';

const HOP_HEADERS = new Set(['content-length', 'host', 'connection', 'transfer-encoding']);

/**
 * Mounts Better Auth on `/api/auth/*` by translating Fastify requests into Fetch `Request` objects.
 * Better Auth applies its own origin checks (`trustedOrigins`) and rate limits on these routes.
 */
export const authRoutesPlugin = fp<{ auth: Auth; publicOrigin: string }>(
  async (app: FastifyInstance, { auth, publicOrigin }) => {
    app.route({
      method: ['GET', 'POST'],
      url: '/api/auth/*',
      schema: { hide: true },
      config: { access: 'public' },
      handler: async (request, reply) => {
        const headers = fromNodeHeaders(request.headers);
        for (const name of HOP_HEADERS) {
          headers.delete(name);
        }
        const hasBody = request.method !== 'GET' && request.body !== undefined && request.body !== null;
        const response = await auth.handler(
          new Request(new URL(request.url, publicOrigin), {
            method: request.method,
            headers,
            ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
          }),
        );
        void reply.status(response.status);
        response.headers.forEach((value, key) => {
          if (key !== 'set-cookie' && key !== 'content-length') {
            void reply.header(key, value);
          }
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length > 0) {
          void reply.header('set-cookie', cookies);
        }
        return reply.send(response.body === null ? null : Buffer.from(await response.arrayBuffer()));
      },
    });
  },
  { name: 'domusafe-auth-routes' },
);
