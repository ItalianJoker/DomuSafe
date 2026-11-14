import { randomUUID } from 'node:crypto';
import { ServerSecretBox, parseMasterKeys } from '@domusafe/crypto';
import { createDatabase, createPool, type Database } from '@domusafe/db';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type pg from 'pg';
import { createAuth } from './auth/auth.js';
import type { ApiConfig } from './config.js';
import { ProblemError, classifyDatabaseError, sendProblem } from './http/problem.js';
import { redactRequestUrl } from './http/redact.js';
import { MemoryStore, ValkeyStore, type KeyValueStore } from './infra/kv.js';
import { brandingRoutes } from './modules/branding/routes.js';
import { createBrandingService } from './modules/branding/service.js';
import { careRoutes } from './modules/care/routes.js';
import { createCareService } from './modules/care/service.js';
import { deadlineRoutes } from './modules/deadlines/routes.js';
import { createDeadlinesService } from './modules/deadlines/service.js';
import { houseRoutes } from './modules/house/routes.js';
import type { HomeAutomationAdapter } from './modules/home-automation/adapter.js';
import { LiveHomeAutomationAdapter } from './modules/home-automation/live-adapter.js';
import { MockHomeAutomationAdapter } from './modules/home-automation/mock-adapter.js';
import { homeAutomationRoutes } from './modules/home-automation/routes.js';
import { createHomeAutomationService } from './modules/home-automation/service.js';
import { inventoryRoutes } from './modules/inventory/routes.js';
import { createInventoryService } from './modules/inventory/service.js';
import { kitchenRoutes } from './modules/kitchen/routes.js';
import { createKitchenService } from './modules/kitchen/service.js';
import { financeRoutes } from './modules/finance/routes.js';
import { createFinanceService } from './modules/finance/service.js';
import { printRoutes } from './modules/print/routes.js';
import { createPrintService } from './modules/print/service.js';
import { createHouseService } from './modules/house/service.js';
import { personaleRoutes } from './modules/personale/routes.js';
import { createPersonaleService } from './modules/personale/service.js';
import { rewardsRoutes } from './modules/rewards/routes.js';
import { createRewardsService } from './modules/rewards/service.js';
import { successionRoutes } from './modules/succession/routes.js';
import { createSuccessionService } from './modules/succession/service.js';
import { emitChange } from './modules/sync/emit.js';
import { RealtimeHub } from './modules/sync/hub.js';
import { syncRoutes } from './modules/sync/routes.js';
import { createSyncService } from './modules/sync/service.js';
import { registerRealtimeWs } from './modules/sync/ws.js';
import { vaultRoutes } from './modules/vault/routes.js';
import { createVaultService } from './modules/vault/service.js';
import { identityRoutes } from './modules/identity/routes.js';
import { createIdentityService } from './modules/identity/service.js';
import { systemRoutes } from './modules/system/routes.js';
import { tenancyRoutes } from './modules/tenancy/routes.js';
import { createTenancyService } from './modules/tenancy/service.js';
import { accessPlugin } from './plugins/access.js';
import { authRoutesPlugin } from './plugins/auth-routes.js';
import { idempotencyPlugin } from './plugins/idempotency.js';
import { openApiPlugin } from './plugins/openapi.js';
import { securityPlugin } from './plugins/security.js';
import './types.js';

/** Optional injected dependencies (tests and the OpenAPI generator). */
export interface AppDependencies {
  readonly config: ApiConfig;
  readonly pool?: pg.Pool;
  readonly store?: KeyValueStore;
  readonly globalRateLimitPerMinute?: number;
  /** When false, skip `/ws` (OpenAPI generation cannot document WebSocket upgrades). Defaults to true. */
  readonly realtime?: boolean;
  /** Outbound home-automation bridge; tests inject {@link MockHomeAutomationAdapter}. */
  readonly homeAutomationAdapter?: HomeAutomationAdapter;
}

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
const FASTIFY_ERRORS: Readonly<
  Record<string, 'payload_too_large' | 'unsupported_media_type' | 'validation_failed'>
> = {
  FST_ERR_CTP_BODY_TOO_LARGE: 'payload_too_large',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 'unsupported_media_type',
  FST_ERR_CTP_EMPTY_JSON_BODY: 'validation_failed',
  FST_ERR_CTP_INVALID_JSON_BODY: 'validation_failed',
};

/**
 * Builds the API: security plugins, Better Auth on `/api/auth`, access control, idempotency, OpenAPI and
 * the module routes. Every error leaves as RFC 9457 Problem Details.
 *
 * @param deps - Configuration and optional pool, store and rate limit (tests).
 * @returns A Fastify instance ready to `listen` or `inject`; `close()` releases pool and store it created.
 */
export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const { config } = deps;
  const pool =
    deps.pool ??
    createPool(config.databaseUrl, { max: config.databasePoolSize, applicationName: 'domusafe-api' });
  const db: Database = createDatabase(pool);
  const store: KeyValueStore =
    deps.store ?? (config.valkeyUrl === null ? new MemoryStore() : new ValkeyStore(config.valkeyUrl));
  const secrets = await ServerSecretBox.create(parseMasterKeys(config.masterKeys), config.masterKeyActive);

  const hub = new RealtimeHub(store instanceof ValkeyStore ? store.client : null);
  const emit = (notice: Parameters<typeof emitChange>[1]): void => {
    void emitChange(hub, notice);
  };
  const tenancy = createTenancyService(db);
  const branding = createBrandingService(db, tenancy);
  const house = createHouseService(db, () => new Date(), emit);
  const inventory = createInventoryService(db);
  const kitchen = createKitchenService(db);
  const finance = createFinanceService(db);
  const care = createCareService(db);
  const rewards = createRewardsService(db);
  const deadlines = createDeadlinesService(db);
  const personale = createPersonaleService(db);
  const print = createPrintService(db, branding);
  const vault = createVaultService(db, store, secrets);
  const succession = createSuccessionService(db);
  const sync = createSyncService(db, house);
  const homeAutomationAdapter =
    deps.homeAutomationAdapter ??
    (config.nodeEnv === 'test' ? new MockHomeAutomationAdapter() : new LiveHomeAutomationAdapter());
  const homeAutomation = createHomeAutomationService(db, secrets, store, homeAutomationAdapter);
  const identity = createIdentityService(db, tenancy);
  const auth = createAuth({
    db,
    secret: await secrets.betterAuthSecret(),
    baseURL: config.publicOrigin,
    trustedOrigins: config.trustedOrigins,
    production: config.nodeEnv === 'production',
    secondaryStorage: store instanceof ValkeyStore ? store : null,
    onUserCreated: (user) => identity.onAccountCreated(user.id, user.name),
  });

  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'res.headers["set-cookie"]',
          '*.password',
          '*.pin',
          '*.verifier',
          '*.recoveryVerifier',
          '*.serverShare',
          '*.token',
          '*.secret',
          '*.inboundSecret',
          '*.mqttPassword',
          '*.code',
          '*.logoDataUrl',
          '*.photoDataUrl',
          '*.receiptDataUrl',
          '*.wrappedAccountKey',
          '*.wrappedVaultPrivateKey',
          '*.recoverySealedVaultKey',
          '*.grant',
        ],
        remove: true,
      },
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: redactRequestUrl(request.url),
          };
        },
      },
    },
    trustProxy: config.trustProxy,
    bodyLimit: 1_048_576,
    requestIdHeader: false,
    genReqId: (request) => {
      const header = request.headers['x-request-id'];
      return typeof header === 'string' && REQUEST_ID.test(header) ? header : randomUUID();
    },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (request, reply, payload) => {
    void reply.header('x-request-id', request.id);
    return payload;
  });

  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    if (error instanceof ProblemError) {
      return sendProblem(request, reply, error.code, error.extensions);
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      return sendProblem(request, reply, 'validation_failed', {
        errors: error.validation.map((issue) => ({
          path: `${error.validationContext ?? 'request'}${issue.instancePath.replaceAll('/', '.')}`,
          code: issue.keyword,
          message: issue.message ?? 'Invalid value',
        })),
      });
    }
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, 'response does not match its schema');
      return sendProblem(request, reply, 'internal_error');
    }
    const fastifyProblem = FASTIFY_ERRORS[error.code];
    if (fastifyProblem !== undefined) {
      return sendProblem(request, reply, fastifyProblem);
    }
    if (error.statusCode === 429) {
      return sendProblem(request, reply, 'rate_limited');
    }
    if (classifyDatabaseError(error).kind === 'rls_denied') {
      return sendProblem(request, reply, 'forbidden');
    }
    request.log.error({ err: error }, 'unhandled error');
    return sendProblem(request, reply, 'internal_error');
  });

  app.setNotFoundHandler(async (request, reply) => sendProblem(request, reply, 'not_found'));

  await app.register(securityPlugin, {
    trustedOrigins: config.trustedOrigins,
    production: config.nodeEnv === 'production',
    redis: store instanceof ValkeyStore ? store.client : null,
    ...(deps.globalRateLimitPerMinute === undefined
      ? {}
      : { globalLimitPerMinute: deps.globalRateLimitPerMinute }),
  });
  await app.register(accessPlugin, { auth, tenancy, identity });
  await app.register(idempotencyPlugin, { store });
  await app.register(openApiPlugin);
  await app.register(authRoutesPlugin, { auth, publicOrigin: config.publicOrigin });
  await app.register(systemRoutes, { db, store });
  await app.register(identityRoutes, { identity });
  await app.register(tenancyRoutes, { tenancy });
  await app.register(houseRoutes, { house });
  await app.register(inventoryRoutes, { inventory });
  await app.register(kitchenRoutes, { kitchen });
  await app.register(homeAutomationRoutes, { homeAutomation });
  await app.register(financeRoutes, { finance });
  await app.register(careRoutes, { care });
  await app.register(rewardsRoutes, { rewards });
  await app.register(deadlineRoutes, { deadlines });
  await app.register(personaleRoutes, { personale });
  await app.register(printRoutes, { print });
  await app.register(brandingRoutes, { branding });
  await app.register(vaultRoutes, { vault });
  await app.register(successionRoutes, { succession });
  await app.register(syncRoutes, { sync });
  if (deps.realtime !== false) {
    await registerRealtimeWs(app, {
      auth,
      tenancy,
      hub,
      trustedOrigins: config.trustedOrigins,
    });
  }

  app.addHook('onClose', async () => {
    await hub.close();
    if (deps.pool === undefined) {
      await pool.end();
    }
    if (deps.store === undefined) {
      await store.close();
    }
  });

  return app;
}
