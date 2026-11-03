import { meSchema, updateProfileRequestSchema } from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { problemResponses } from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { AuthenticatedAccount } from '../../types.js';
import type { IdentityService } from './service.js';

function caller(request: { account: AuthenticatedAccount | null }): AuthenticatedAccount {
  if (request.account === null) {
    throw new ProblemError('unauthenticated');
  }
  return request.account;
}

/**
 * Routes of the `identity` module: `GET /me` and `PATCH /me/profile` (phase 3 §5.2).
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Identity service.
 */
export const identityRoutes: FastifyPluginAsyncZod<{ identity: IdentityService }> = async (
  app,
  { identity },
) => {
  app.get(
    '/api/v1/me',
    {
      config: { access: 'account' },
      schema: {
        tags: ['identity'],
        operationId: 'identity.getMe',
        summary: 'Current account, profile and families',
        response: { 200: meSchema, ...problemResponses(401) },
      },
    },
    async (request) => identity.getMe(caller(request)),
  );

  app.patch(
    '/api/v1/me/profile',
    {
      config: { access: 'account' },
      schema: {
        tags: ['identity'],
        operationId: 'identity.updateProfile',
        summary: 'Update display name, language, theme, last family and house',
        body: updateProfileRequestSchema,
        response: { 200: meSchema, ...problemResponses(400, 401, 403) },
      },
    },
    async (request) => identity.updateProfile(caller(request), request.body),
  );
};
