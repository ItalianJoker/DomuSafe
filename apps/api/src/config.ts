import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const vapidKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/, 'Expected URL-safe base64 without padding')
  .min(20)
  .max(200);

const oauthSecretSchema = z.string().trim().min(8).max(512);
const oauthClientIdSchema = z.string().trim().min(1).max(256);
const oidcProviderIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_-]{0,63}$/u, 'Expected a lowercase provider id')
  .default('openid');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    PUBLIC_ORIGIN: z.url({ protocol: /^https?$/ }),
    TRUSTED_ORIGINS: z.string().default(''),
    TRUST_PROXY: booleanFromEnv.default(false),
    DATABASE_URL: z.string().min(1),
    DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    VALKEY_URL: z.string().optional(),
    DOMUSAFE_MASTER_KEYS: z.string().min(1),
    DOMUSAFE_MASTER_KEY_ACTIVE: z.coerce.number().int().min(1).max(65_535),
    VAPID_PUBLIC_KEY: vapidKeySchema.optional(),
    VAPID_PRIVATE_KEY: vapidKeySchema.optional(),
    VAPID_SUBJECT: z
      .string()
      .regex(/^(mailto:|https:\/\/).+/, 'Expected mailto: or https: contact for push')
      .default('mailto:noreply@localhost'),
    GOOGLE_CLIENT_ID: oauthClientIdSchema.optional(),
    GOOGLE_CLIENT_SECRET: oauthSecretSchema.optional(),
    OIDC_CLIENT_ID: oauthClientIdSchema.optional(),
    OIDC_CLIENT_SECRET: oauthSecretSchema.optional(),
    OIDC_DISCOVERY_URL: z.url({ protocol: /^https?$/ }).optional(),
    OIDC_PROVIDER_ID: oidcProviderIdSchema,
  })
  .refine((env) => env.NODE_ENV !== 'production' || (env.VALKEY_URL !== undefined && env.VALKEY_URL !== ''), {
    message: 'VALKEY_URL is required in production (shared rate limits, sessions and idempotency)',
    path: ['VALKEY_URL'],
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.PUBLIC_ORIGIN.startsWith('https://'), {
    message: 'PUBLIC_ORIGIN must use https in production',
    path: ['PUBLIC_ORIGIN'],
  })
  .refine(
    (env) =>
      (env.VAPID_PUBLIC_KEY === undefined && env.VAPID_PRIVATE_KEY === undefined) ||
      (env.VAPID_PUBLIC_KEY !== undefined && env.VAPID_PRIVATE_KEY !== undefined),
    {
      message: 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together',
      path: ['VAPID_PUBLIC_KEY'],
    },
  )
  .refine(
    (env) =>
      (env.GOOGLE_CLIENT_ID === undefined && env.GOOGLE_CLIENT_SECRET === undefined) ||
      (env.GOOGLE_CLIENT_ID !== undefined && env.GOOGLE_CLIENT_SECRET !== undefined),
    {
      message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together',
      path: ['GOOGLE_CLIENT_ID'],
    },
  )
  .refine(
    (env) => {
      const parts = [env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET, env.OIDC_DISCOVERY_URL];
      const set = parts.filter((value) => value !== undefined).length;
      return set === 0 || set === 3;
    },
    {
      message: 'OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and OIDC_DISCOVERY_URL must be set together',
      path: ['OIDC_CLIENT_ID'],
    },
  )
  .refine((env) => env.OIDC_PROVIDER_ID !== 'google' && env.OIDC_PROVIDER_ID !== 'credential', {
    message: 'OIDC_PROVIDER_ID cannot reuse reserved Better Auth provider ids',
    path: ['OIDC_PROVIDER_ID'],
  });

/** Google OAuth client credentials when configured. */
export interface GoogleAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

/** Generic OpenID Connect provider (Keycloak, Authentik and compatible discovery documents). */
export interface OpenIdAuthConfig {
  readonly providerId: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly discoveryUrl: string;
}

/** Validated runtime configuration of the API process. */
export interface ApiConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  /** Origin serving web, `/api` and `/ws` (phase 1 §2, same-origin principle). */
  readonly publicOrigin: string;
  /** Origins allowed to call the API: the public origin plus verified white-label hosts. */
  readonly trustedOrigins: readonly string[];
  readonly trustProxy: boolean;
  readonly databaseUrl: string;
  readonly databasePoolSize: number;
  readonly valkeyUrl: string | null;
  readonly masterKeys: string;
  readonly masterKeyActive: number;
  /** Public VAPID key for browser push, or null when push is disabled. */
  readonly vapidPublicKey: string | null;
  /** Private VAPID key, or null when push is disabled. Never sent to clients. */
  readonly vapidPrivateKey: string | null;
  /** Contact subject advertised to push services (`mailto:` or `https:`). */
  readonly vapidSubject: string;
  /** Google social provider, or null when unset. */
  readonly googleAuth: GoogleAuthConfig | null;
  /** Generic OpenID Connect provider, or null when unset. */
  readonly openIdAuth: OpenIdAuthConfig | null;
}

/**
 * Parses and validates environment variables.
 *
 * @param env - Usually `process.env`.
 * @returns The configuration.
 * @throws Error listing every invalid variable.
 */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): ApiConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const value = parsed.data;
  const publicOrigin = new URL(value.PUBLIC_ORIGIN).origin;
  const extra = value.TRUSTED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => new URL(origin).origin);
  const googleAuth =
    value.GOOGLE_CLIENT_ID === undefined || value.GOOGLE_CLIENT_SECRET === undefined
      ? null
      : { clientId: value.GOOGLE_CLIENT_ID, clientSecret: value.GOOGLE_CLIENT_SECRET };
  const openIdAuth =
    value.OIDC_CLIENT_ID === undefined ||
    value.OIDC_CLIENT_SECRET === undefined ||
    value.OIDC_DISCOVERY_URL === undefined
      ? null
      : {
          providerId: value.OIDC_PROVIDER_ID,
          clientId: value.OIDC_CLIENT_ID,
          clientSecret: value.OIDC_CLIENT_SECRET,
          discoveryUrl: new URL(value.OIDC_DISCOVERY_URL).toString(),
        };
  return {
    nodeEnv: value.NODE_ENV,
    host: value.HOST,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    publicOrigin,
    trustedOrigins: [...new Set([publicOrigin, ...extra])],
    trustProxy: value.TRUST_PROXY,
    databaseUrl: value.DATABASE_URL,
    databasePoolSize: value.DATABASE_POOL_SIZE,
    valkeyUrl: value.VALKEY_URL === undefined || value.VALKEY_URL === '' ? null : value.VALKEY_URL,
    masterKeys: value.DOMUSAFE_MASTER_KEYS,
    masterKeyActive: value.DOMUSAFE_MASTER_KEY_ACTIVE,
    vapidPublicKey: value.VAPID_PUBLIC_KEY ?? null,
    vapidPrivateKey: value.VAPID_PRIVATE_KEY ?? null,
    vapidSubject: value.VAPID_SUBJECT,
    googleAuth,
    openIdAuth,
  };
}
