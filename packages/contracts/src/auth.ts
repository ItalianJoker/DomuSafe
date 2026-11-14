import { z } from 'zod';

/**
 * Kind of external sign-in provider advertised to the browser.
 *
 * `google` is the built-in Better Auth social provider; `openid` is a discovery-based
 * OpenID Connect provider (Keycloak, Authentik and compatible issuers).
 */
export const authProviderKindSchema = z.enum(['google', 'openid']).meta({ id: 'AuthProviderKind' });
/** Kind of external sign-in provider. */
export type AuthProviderKind = z.infer<typeof authProviderKindSchema>;

/**
 * One external sign-in provider that the deployment has configured.
 *
 * Preconditions: `id` is the Better Auth provider id used in `/api/auth/sign-in/social`.
 * Postconditions: the browser uses `id` as `provider` and never receives client secrets.
 */
export const authProviderSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_-]*$/u, 'Expected a lowercase provider id'),
    kind: authProviderKindSchema,
  })
  .strict()
  .meta({ id: 'AuthProvider' });
/** One external sign-in provider. */
export type AuthProvider = z.infer<typeof authProviderSchema>;

/**
 * Public list of configured external sign-in providers (`GET /api/v1/auth/providers`).
 *
 * Empty when neither Google nor the generic OpenID Connect provider is configured.
 */
export const authProvidersSchema = z
  .object({
    providers: z.array(authProviderSchema),
  })
  .strict()
  .meta({ id: 'AuthProviders' });
/** Public list of configured external sign-in providers. */
export type AuthProviders = z.infer<typeof authProvidersSchema>;
