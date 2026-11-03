import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

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
  })
  .refine((env) => env.NODE_ENV !== 'production' || (env.VALKEY_URL !== undefined && env.VALKEY_URL !== ''), {
    message: 'VALKEY_URL is required in production (shared rate limits, sessions and idempotency)',
    path: ['VALKEY_URL'],
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.PUBLIC_ORIGIN.startsWith('https://'), {
    message: 'PUBLIC_ORIGIN must use https in production',
    path: ['PUBLIC_ORIGIN'],
  });

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
  };
}
