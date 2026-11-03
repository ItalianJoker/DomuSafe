import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod';

/** Version of the published contract (`info.version`). */
export const API_VERSION = '1.0.0';

/**
 * OpenAPI 3.1 generated from the Zod route schemas (phase 1 §3.2): `/api/v1/openapi.json` and the
 * Swagger UI on `/api/v1/docs`. Documentation routes are public.
 */
export const openApiPlugin = fp(
  async (app: FastifyInstance) => {
    app.addHook('onRoute', (route) => {
      if (route.url.startsWith('/api/v1/docs')) {
        route.config = { ...route.config, access: 'public' };
      }
    });

    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: 'DomuSafe API',
          version: API_VERSION,
          description:
            'REST API of DomuSafe Suite. Errors follow RFC 9457 (application/problem+json) with a stable `code`. ' +
            'Writes of versioned resources require If-Match; creations require Idempotency-Key; cookie-authenticated ' +
            'writes require the header X-DomuSafe-Request: 1. Authentication endpoints are served by Better Auth under /api/auth.',
        },
        servers: [{ url: '/' }],
        tags: [
          { name: 'system', description: 'Probes' },
          { name: 'identity', description: 'Account and profile' },
          { name: 'tenancy', description: 'Families, houses and members' },
        ],
        components: {
          securitySchemes: {
            sessionCookie: { type: 'apiKey', in: 'cookie', name: '__Secure-domusafe.session_token' },
          },
        },
        security: [{ sessionCookie: [] }],
      },
      transform: jsonSchemaTransform,
      transformObject: jsonSchemaTransformObject,
    });

    await app.register(swaggerUi, { routePrefix: '/api/v1/docs', staticCSP: true });

    app.get('/api/v1/openapi.json', { config: { access: 'public' }, schema: { hide: true } }, async () =>
      app.swagger(),
    );
  },
  { name: 'domusafe-openapi' },
);
