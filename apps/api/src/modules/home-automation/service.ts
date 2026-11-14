import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  encodeCursor,
  type CreateHaConnectionRequest,
  type CreateHaZoneRequest,
  type HaConnection,
  type HaDevice,
  type HaDeviceKind,
  type HaEvent,
  type HaEventKind,
  type HaLockCode,
  type HaZone,
  type HomeAssistantIngest,
  type IssueHaLockCodeRequest,
  type UpdateHaConnectionRequest,
  type UpdateHaDeviceRequest,
  type UpdateHaZoneRequest,
} from '@domusafe/contracts';
import type { ServerSecretBox } from '@domusafe/crypto';
import { recordAudit, setFamilyContext, withContext, type Database } from '@domusafe/db';
import { ProblemError, classifyDatabaseError } from '../../http/problem.js';
import type { KeyValueStore } from '../../infra/kv.js';
import type { TenantContext } from '../../types.js';
import type { HomeAutomationAdapter } from './adapter.js';
import { assertSafeHostname } from './host-guard.js';
import * as repo from './repository.js';

/** One page of a list. */
export interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

const CAREGIVER_KINDS: ReadonlySet<HaDeviceKind> = new Set([
  'temperature',
  'humidity',
  'water_leak',
  'smoke',
  'door_window',
  'motion',
  'alarm_panel',
  'battery',
]);

const account = (accountId: string): { kind: 'account'; accountId: string } => ({
  kind: 'account',
  accountId,
});

function rethrowDatabaseError(error: unknown): never {
  if (error instanceof ProblemError) {
    throw error;
  }
  const failure = classifyDatabaseError(error);
  switch (failure.kind) {
    case 'rls_denied':
      throw new ProblemError('forbidden');
    case 'unique':
      throw new ProblemError('duplicate');
    case 'foreign_key':
      throw new ProblemError('validation_failed', {
        detail: 'A referenced item does not exist in this family',
      });
    case 'check':
      throw new ProblemError('domain_rule_violated', {
        detail: `Constraint ${failure.constraint ?? 'check'} violated`,
      });
    case 'other':
      throw error;
  }
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    rethrowDatabaseError(error);
  }
}

function conflict(currentVersion: number): never {
  throw new ProblemError('version_conflict', { currentVersion });
}

function pageOf<TRow extends { createdAt: Date; id: string }, TView>(
  rows: TRow[],
  limit: number,
  view: (row: TRow) => TView,
): Page<TView> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice.at(-1);
  return {
    items: slice.map(view),
    nextCursor: hasMore && last !== undefined ? encodeCursor([last.createdAt.toISOString(), last.id]) : null,
  };
}

function viewConnection(row: repo.HaConnectionRow): HaConnection {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    kind: row.kind,
    name: row.name,
    baseUrl: row.baseUrl,
    mqttUrl: row.mqttUrl,
    mqttTopicPrefix: row.mqttTopicPrefix,
    mqttUsername: row.mqttUsername,
    hasCredentials: row.credentialsSealed !== null,
    hasInboundSecret: row.inboundSecretCurrentSealed !== null,
    status: row.status,
    lastEventAt: row.lastEventAt?.toISOString() ?? null,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function viewDevice(row: repo.HaDeviceRow): HaDevice {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    connectionId: row.connectionId,
    zoneId: row.zoneId,
    roomId: row.roomId,
    externalId: row.externalId,
    kind: row.kind,
    name: row.name,
    unit: row.unit,
    lastValue: row.lastValue,
    lastState: row.lastState,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function viewZone(row: repo.HaZoneRow): HaZone {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    name: row.name,
    externalId: row.externalId,
    alarmState: row.alarmState,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function viewEvent(row: repo.HaEventRow): HaEvent {
  const state = row.state as Record<string, string | number | boolean | null>;
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    deviceId: row.deviceId,
    occurredAt: row.occurredAt.toISOString(),
    kind: row.kind,
    state,
  };
}

function viewLockCode(row: repo.HaLockCodeRow): HaLockCode {
  return {
    id: row.id,
    familyId: row.familyId,
    houseId: row.houseId,
    deviceId: row.deviceId,
    label: row.label,
    validFrom: row.validFrom.toISOString(),
    validUntil: row.validUntil.toISOString(),
    codeSuffix: row.codeSuffix,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function newInboundSecret(): string {
  return randomBytes(32).toString('base64url');
}

function kindFromEntityId(entityId: string): HaDeviceKind {
  const domain = entityId.split('.')[0] ?? '';
  switch (domain) {
    case 'lock':
      return 'lock';
    case 'alarm_control_panel':
      return 'alarm_panel';
    case 'binary_sensor':
      if (entityId.includes('smoke')) {
        return 'smoke';
      }
      if (entityId.includes('leak') || entityId.includes('water')) {
        return 'water_leak';
      }
      if (entityId.includes('motion')) {
        return 'motion';
      }
      if (entityId.includes('door') || entityId.includes('window')) {
        return 'door_window';
      }
      return 'other';
    case 'sensor':
      if (entityId.includes('temp')) {
        return 'temperature';
      }
      if (entityId.includes('humid')) {
        return 'humidity';
      }
      if (entityId.includes('power')) {
        return 'power';
      }
      if (entityId.includes('energy')) {
        return 'energy';
      }
      if (entityId.includes('solar')) {
        return 'solar_production';
      }
      if (entityId.includes('battery')) {
        return 'battery';
      }
      return 'other';
    default:
      return 'other';
  }
}

function eventKindFromState(deviceKind: HaDeviceKind, state: string): HaEventKind {
  if (deviceKind === 'alarm_panel') {
    return state === 'triggered' ? 'alarm_triggered' : 'alarm_cleared';
  }
  if (deviceKind === 'water_leak' && (state === 'on' || state === 'wet')) {
    return 'leak_detected';
  }
  if (deviceKind === 'smoke' && state === 'on') {
    return 'smoke_detected';
  }
  if (deviceKind === 'lock') {
    return state === 'locked' ? 'lock_locked' : 'lock_unlocked';
  }
  if (deviceKind === 'door_window' && (state === 'on' || state === 'open')) {
    return 'door_opened';
  }
  if (deviceKind === 'battery' && state === 'low') {
    return 'battery_low';
  }
  if (state === 'unavailable' || state === 'unknown') {
    return 'device_offline';
  }
  return 'state_changed';
}

function assertSafeUrl(urlText: string | null | undefined): void {
  if (urlText === null || urlText === undefined) {
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(urlText);
  } catch {
    throw new ProblemError('validation_failed', { detail: 'Invalid URL' });
  }
  try {
    assertSafeHostname(parsed.hostname);
  } catch {
    throw new ProblemError('domain_rule_violated', { detail: 'Host is not allowed' });
  }
}

function assertMqttUrl(urlText: string): void {
  let parsed: URL;
  try {
    parsed = new URL(urlText);
  } catch {
    throw new ProblemError('validation_failed', { detail: 'Invalid broker URL' });
  }
  if (parsed.protocol !== 'mqtt:' && parsed.protocol !== 'mqtts:' && parsed.protocol !== 'tcp:') {
    throw new ProblemError('validation_failed', { detail: 'Broker URL must use mqtt, mqtts or tcp' });
  }
}

function assertNonEmptyPatch(body: object): void {
  if (Object.keys(body).length === 0) {
    throw new ProblemError('validation_failed', { detail: 'At least one field is required' });
  }
}

/**
 * Home-automation use cases: connections, device status, zone alarms, temporary lock codes and
 * inbound webhooks. Outbound calls go through {@link HomeAutomationAdapter}.
 *
 * @param db - Application database.
 * @param secrets - Class S seal box.
 * @param store - Ephemeral store for webhook anti-replay.
 * @param adapter - Mockable bridge adapter.
 */
export function createHomeAutomationService(
  db: Database,
  secrets: ServerSecretBox,
  store: KeyValueStore,
  adapter: HomeAutomationAdapter,
) {
  async function openCredentials(row: repo.HaConnectionRow): Promise<{
    kind: repo.HaConnectionRow['kind'];
    baseUrl: string | null;
    token: string | null;
    mqttUrl: string | null;
    mqttTopicPrefix: string | null;
    mqttUsername: string | null;
    mqttPassword: string | null;
  }> {
    let token: string | null = null;
    let mqttPassword: string | null = null;
    if (row.credentialsSealed !== null) {
      const plaintext = decodeUtf8(
        await secrets.open(row.credentialsSealed, {
          table: 'ha_connections',
          column: 'credentials_sealed',
          rowId: row.id,
        }),
      );
      if (row.kind === 'mqtt') {
        mqttPassword = plaintext;
      } else {
        token = plaintext;
      }
    }
    return {
      kind: row.kind,
      baseUrl: row.baseUrl,
      token,
      mqttUrl: row.mqttUrl,
      mqttTopicPrefix: row.mqttTopicPrefix,
      mqttUsername: row.mqttUsername,
      mqttPassword,
    };
  }

  return {
    /**
     * Lists connections of a house.
     *
     * @param tenant - Caller tenant.
     * @param houseId - House id.
     * @param query - Pagination.
     * @returns Connection page without secrets.
     */
    listConnections(
      tenant: TenantContext,
      houseId: string,
      query: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<HaConnection>> {
      return guarded(async () =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          const rows = await repo.listConnections(tx, tenant.familyId, houseId, query.limit + 1, query.after);
          return pageOf(rows, query.limit, viewConnection);
        }),
      );
    },

    /**
     * Creates a connection and seals secrets. Webhook kinds also mint an inbound secret shown once.
     *
     * @param tenant - Caller tenant (admin).
     * @param houseId - House id.
     * @param body - Connection settings.
     * @returns Connection and optional inbound secret.
     */
    createConnection(
      tenant: TenantContext,
      houseId: string,
      body: CreateHaConnectionRequest,
    ): Promise<{ connection: HaConnection; inboundSecret: string | null }> {
      return guarded(async () => {
        if (body.kind === 'mqtt') {
          assertMqttUrl(body.mqttUrl);
          assertSafeUrl(
            body.mqttUrl
              .replace(/^mqtts:/u, 'https:')
              .replace(/^mqtt:/u, 'http:')
              .replace(/^tcp:/u, 'http:'),
          );
        } else {
          assertSafeUrl(body.baseUrl);
        }
        return withContext(
          db,
          { principal: account(tenant.accountId), familyId: tenant.familyId },
          async (tx) => {
            const inboundSecret =
              body.kind === 'home_assistant_webhook' || body.kind === 'home_assistant_api'
                ? newInboundSecret()
                : null;
            const credentialsPlain =
              body.kind === 'mqtt'
                ? (body.mqttPassword ?? null)
                : body.kind === 'home_assistant_api'
                  ? body.token
                  : (body.token ?? null);
            const inserted = await repo.insertConnection(tx, {
              familyId: tenant.familyId,
              houseId,
              kind: body.kind,
              name: body.name,
              baseUrl: body.kind === 'mqtt' ? null : body.baseUrl,
              mqttUrl: body.kind === 'mqtt' ? body.mqttUrl : null,
              mqttTopicPrefix: body.kind === 'mqtt' ? (body.mqttTopicPrefix ?? null) : null,
              mqttUsername: body.kind === 'mqtt' ? (body.mqttUsername ?? null) : null,
              credentialsSealed: null,
              inboundSecretCurrentSealed: null,
              accountId: tenant.accountId,
            });
            let connection = inserted;
            if (credentialsPlain !== null || inboundSecret !== null) {
              const resealedCredentials =
                credentialsPlain === null
                  ? null
                  : await secrets.seal(utf8(credentialsPlain), {
                      table: 'ha_connections',
                      column: 'credentials_sealed',
                      rowId: inserted.id,
                    });
              const resealedInbound =
                inboundSecret === null
                  ? null
                  : await secrets.seal(utf8(inboundSecret), {
                      table: 'ha_connections',
                      column: 'inbound_secret_current_sealed',
                      rowId: inserted.id,
                    });
              const updated = await repo.updateConnection(tx, tenant.familyId, houseId, inserted.id, {
                credentialsSealed: resealedCredentials,
                inboundSecretCurrentSealed: resealedInbound,
                accountId: tenant.accountId,
                expectedVersion: inserted.version,
              });
              if (updated === undefined) {
                conflict(inserted.version);
              }
              connection = updated;
            }
            await recordAudit(tx, {
              familyId: tenant.familyId,
              actor: { kind: 'account', id: tenant.accountId },
              action: 'automation.connection.create',
              resourceType: 'ha_connection',
              resourceId: connection.id,
              outcome: 'success',
              metadata: { houseId },
            });
            return { connection: viewConnection(connection), inboundSecret };
          },
        );
      });
    },

    /**
     * Updates connection settings. Null token/password clears the sealed secret.
     *
     * @param tenant - Caller tenant.
     * @param houseId - House id.
     * @param connectionId - Connection id.
     * @param expectedVersion - If-Match version.
     * @param body - Patch.
     * @returns Updated connection.
     */
    updateConnection(
      tenant: TenantContext,
      houseId: string,
      connectionId: string,
      expectedVersion: number,
      body: UpdateHaConnectionRequest,
    ): Promise<HaConnection> {
      return guarded(async () => {
        assertNonEmptyPatch(body);
        assertSafeUrl(body.baseUrl ?? undefined);
        if (body.mqttUrl !== undefined && body.mqttUrl !== null) {
          assertMqttUrl(body.mqttUrl);
          assertSafeUrl(
            body.mqttUrl
              .replace(/^mqtts:/u, 'https:')
              .replace(/^mqtt:/u, 'http:')
              .replace(/^tcp:/u, 'http:'),
          );
        }
        return withContext(
          db,
          { principal: account(tenant.accountId), familyId: tenant.familyId },
          async (tx) => {
            const current = await repo.getConnection(tx, tenant.familyId, houseId, connectionId);
            if (current === undefined) {
              throw new ProblemError('not_found');
            }
            if (current.version !== expectedVersion) {
              conflict(current.version);
            }
            let credentialsSealed: Uint8Array<ArrayBuffer> | null | undefined;
            if (body.token !== undefined || body.mqttPassword !== undefined) {
              const plain = body.token ?? body.mqttPassword ?? null;
              credentialsSealed =
                plain === null
                  ? null
                  : await secrets.seal(utf8(plain), {
                      table: 'ha_connections',
                      column: 'credentials_sealed',
                      rowId: connectionId,
                    });
            }
            const updated = await repo.updateConnection(tx, tenant.familyId, houseId, connectionId, {
              ...(body.name !== undefined ? { name: body.name } : {}),
              ...(body.baseUrl !== undefined ? { baseUrl: body.baseUrl } : {}),
              ...(body.mqttUrl !== undefined ? { mqttUrl: body.mqttUrl } : {}),
              ...(body.mqttTopicPrefix !== undefined ? { mqttTopicPrefix: body.mqttTopicPrefix } : {}),
              ...(body.mqttUsername !== undefined ? { mqttUsername: body.mqttUsername } : {}),
              ...(body.status !== undefined ? { status: body.status } : {}),
              ...(credentialsSealed !== undefined ? { credentialsSealed } : {}),
              accountId: tenant.accountId,
              expectedVersion,
            });
            if (updated === undefined) {
              conflict(expectedVersion);
            }
            await recordAudit(tx, {
              familyId: tenant.familyId,
              actor: { kind: 'account', id: tenant.accountId },
              action: 'automation.connection.update',
              resourceType: 'ha_connection',
              resourceId: connectionId,
              outcome: 'success',
              metadata: { houseId },
            });
            return viewConnection(updated);
          },
        );
      });
    },

    /**
     * Soft-deletes a connection.
     *
     * @param tenant - Caller tenant.
     * @param houseId - House id.
     * @param connectionId - Connection id.
     * @param expectedVersion - If-Match version.
     */
    deleteConnection(
      tenant: TenantContext,
      houseId: string,
      connectionId: string,
      expectedVersion: number,
    ): Promise<void> {
      return guarded(async () =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          const deleted = await repo.softDeleteConnection(
            tx,
            tenant.familyId,
            houseId,
            connectionId,
            expectedVersion,
            tenant.accountId,
          );
          if (deleted === undefined) {
            const current = await repo.getConnection(tx, tenant.familyId, houseId, connectionId);
            if (current === undefined) {
              throw new ProblemError('not_found');
            }
            conflict(current.version);
          }
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: { kind: 'account', id: tenant.accountId },
            action: 'automation.connection.delete',
            resourceType: 'ha_connection',
            resourceId: connectionId,
            outcome: 'success',
            metadata: { houseId },
          });
        }),
      );
    },

    /**
     * Rotates the inbound webhook secret and returns the new plaintext once.
     *
     * @param tenant - Caller tenant.
     * @param houseId - House id.
     * @param connectionId - Connection id.
     * @param expectedVersion - If-Match version.
     * @returns Connection and new secret.
     */
    rotateInboundSecret(
      tenant: TenantContext,
      houseId: string,
      connectionId: string,
      expectedVersion: number,
    ): Promise<{ connection: HaConnection; inboundSecret: string }> {
      return guarded(async () =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          const current = await repo.getConnection(tx, tenant.familyId, houseId, connectionId);
          if (current === undefined) {
            throw new ProblemError('not_found');
          }
          if (current.version !== expectedVersion) {
            conflict(current.version);
          }
          const inboundSecret = newInboundSecret();
          const sealed = await secrets.seal(utf8(inboundSecret), {
            table: 'ha_connections',
            column: 'inbound_secret_current_sealed',
            rowId: connectionId,
          });
          const updated = await repo.updateConnection(tx, tenant.familyId, houseId, connectionId, {
            inboundSecretPreviousSealed: current.inboundSecretCurrentSealed,
            inboundSecretCurrentSealed: sealed,
            secretRotatedAt: new Date(),
            accountId: tenant.accountId,
            expectedVersion,
          });
          if (updated === undefined) {
            conflict(expectedVersion);
          }
          return { connection: viewConnection(updated), inboundSecret };
        }),
      );
    },

    /**
     * Probes the remote bridge through the adapter and stores the outcome on the connection.
     *
     * @param tenant - Caller tenant.
     * @param houseId - House id.
     * @param connectionId - Connection id.
     * @returns Test result and updated connection.
     */
    testConnection(
      tenant: TenantContext,
      houseId: string,
      connectionId: string,
    ): Promise<{ ok: boolean; detail: string | null; connection: HaConnection }> {
      return guarded(async () => {
        const row = await withContext(
          db,
          { principal: account(tenant.accountId), familyId: tenant.familyId },
          async (tx) => repo.getConnection(tx, tenant.familyId, houseId, connectionId),
        );
        if (row === undefined) {
          throw new ProblemError('not_found');
        }
        assertSafeUrl(row.baseUrl);
        assertSafeUrl(row.mqttUrl);
        const credentials = await openCredentials(row);
        const result = await adapter.testConnection(credentials);
        const updated = await withContext(
          db,
          { principal: account(tenant.accountId), familyId: tenant.familyId },
          async (tx) => {
            const next = await repo.updateConnection(tx, tenant.familyId, houseId, connectionId, {
              status: result.ok ? 'active' : 'error',
              lastCheckedAt: new Date(),
              lastErrorCode: result.ok ? null : (result.detail ?? 'test_failed'),
              accountId: tenant.accountId,
              expectedVersion: row.version,
            });
            return next ?? row;
          },
        );
        return { ok: result.ok, detail: result.detail, connection: viewConnection(updated) };
      });
    },

    /**
     * Lists devices, filtering caregivers to alarms and sensors.
     *
     * @param tenant - Caller tenant.
     * @param houseId - House id.
     * @param query - Pagination and optional kind.
     * @returns Device page.
     */
    listDevices(
      tenant: TenantContext,
      houseId: string,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly kind?: HaDeviceKind | undefined;
      },
    ): Promise<Page<HaDevice>> {
      return guarded(async () =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          const rows = await repo.listDevices(
            tx,
            tenant.familyId,
            houseId,
            query.limit + 1,
            query.after,
            query.kind ?? null,
          );
          const filtered =
            tenant.role === 'caregiver' ? rows.filter((row) => CAREGIVER_KINDS.has(row.kind)) : rows;
          return pageOf(filtered, query.limit, viewDevice);
        }),
      );
    },

    /**
     * Refreshes entity status from the adapter into `ha_devices`.
     *
     * @param tenant - Caller tenant.
     * @param houseId - House id.
     * @param connectionId - Connection id.
     * @returns Upserted devices.
     */
    refreshDevices(
      tenant: TenantContext,
      houseId: string,
      connectionId: string,
    ): Promise<{ devices: HaDevice[] }> {
      return guarded(async () => {
        const row = await withContext(
          db,
          { principal: account(tenant.accountId), familyId: tenant.familyId },
          async (tx) => repo.getConnection(tx, tenant.familyId, houseId, connectionId),
        );
        if (row === undefined) {
          throw new ProblemError('not_found');
        }
        assertSafeUrl(row.baseUrl);
        assertSafeUrl(row.mqttUrl);
        const credentials = await openCredentials(row);
        const entities = await adapter.listEntities(credentials);
        const now = new Date();
        return withContext(
          db,
          { principal: account(tenant.accountId), familyId: tenant.familyId },
          async (tx) => {
            const devices: HaDevice[] = [];
            for (const entity of entities) {
              const upserted = await repo.upsertDevice(tx, {
                familyId: tenant.familyId,
                houseId,
                connectionId,
                externalId: entity.externalId,
                kind: entity.kind,
                name: entity.name,
                unit: entity.unit,
                lastValue: entity.lastValue,
                lastState: entity.lastState,
                lastSeenAt: now,
                accountId: tenant.accountId,
              });
              devices.push(viewDevice(upserted));
            }
            await repo.updateConnection(tx, tenant.familyId, houseId, connectionId, {
              lastCheckedAt: now,
              lastEventAt: now,
              status: 'active',
              lastErrorCode: null,
              accountId: tenant.accountId,
              expectedVersion: row.version,
            });
            return { devices };
          },
        );
      });
    },

    /**
     * Updates device name or assignments.
     *
     * @param tenant - Caller tenant.
     * @param houseId - House id.
     * @param deviceId - Device id.
     * @param expectedVersion - If-Match version.
     * @param body - Patch.
     * @returns Updated device.
     */
    updateDevice(
      tenant: TenantContext,
      houseId: string,
      deviceId: string,
      expectedVersion: number,
      body: UpdateHaDeviceRequest,
    ): Promise<HaDevice> {
      return guarded(async () =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          const patch: { name?: string; zoneId?: string | null; roomId?: string | null } = {};
          if (body.name !== undefined) {
            patch.name = body.name;
          }
          if (body.zoneId !== undefined) {
            patch.zoneId = body.zoneId;
          }
          if (body.roomId !== undefined) {
            patch.roomId = body.roomId;
          }
          const updated = await repo.updateDevice(
            tx,
            tenant.familyId,
            houseId,
            deviceId,
            expectedVersion,
            tenant.accountId,
            patch,
          );
          if (updated === undefined) {
            const current = await repo.getDevice(tx, tenant.familyId, houseId, deviceId);
            if (current === undefined) {
              throw new ProblemError('not_found');
            }
            conflict(current.version);
          }
          return viewDevice(updated);
        }),
      );
    },

    /**
     * Lists zones of a house.
     *
     * @param tenant - Caller tenant.
     * @param houseId - House id.
     * @param query - Pagination.
     * @returns Zone page.
     */
    listZones(
      tenant: TenantContext,
      houseId: string,
      query: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<HaZone>> {
      return guarded(async () =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          const rows = await repo.listZones(tx, tenant.familyId, houseId, query.limit + 1, query.after);
          return pageOf(rows, query.limit, viewZone);
        }),
      );
    },

    /**
     * Creates a zone.
     *
     * @param tenant - Caller tenant.
     * @param houseId - House id.
     * @param body - Zone fields.
     * @returns Created zone.
     */
    createZone(tenant: TenantContext, houseId: string, body: CreateHaZoneRequest): Promise<HaZone> {
      return guarded(async () =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          const row = await repo.insertZone(tx, {
            familyId: tenant.familyId,
            houseId,
            name: body.name,
            externalId: body.externalId ?? null,
            accountId: tenant.accountId,
          });
          return viewZone(row);
        }),
      );
    },

    /**
     * Updates a zone and optionally arms it through the first available API connection.
     *
     * @param tenant - Caller tenant.
     * @param houseId - House id.
     * @param zoneId - Zone id.
     * @param expectedVersion - If-Match version.
     * @param body - Patch.
     * @returns Updated zone.
     */
    updateZone(
      tenant: TenantContext,
      houseId: string,
      zoneId: string,
      expectedVersion: number,
      body: UpdateHaZoneRequest,
    ): Promise<HaZone> {
      return guarded(async () => {
        const zone = await withContext(
          db,
          { principal: account(tenant.accountId), familyId: tenant.familyId },
          async (tx) => repo.getZone(tx, tenant.familyId, houseId, zoneId),
        );
        if (zone === undefined) {
          throw new ProblemError('not_found');
        }
        if (zone.version !== expectedVersion) {
          conflict(zone.version);
        }
        if (body.alarmState !== undefined) {
          const externalId = body.externalId ?? zone.externalId;
          if (externalId === null) {
            throw new ProblemError('domain_rule_violated', {
              detail: 'Zone needs an external panel id to change the alarm',
            });
          }
          const connections = await withContext(
            db,
            { principal: account(tenant.accountId), familyId: tenant.familyId },
            async (tx) => repo.listConnections(tx, tenant.familyId, houseId, 20, null),
          );
          const api = connections.find((item) => item.kind === 'home_assistant_api' || item.kind === 'mqtt');
          if (api !== undefined) {
            const credentials = await openCredentials(api);
            await adapter.setZoneAlarm(credentials, { zoneExternalId: externalId, mode: body.alarmState });
          }
        }
        return withContext(
          db,
          { principal: account(tenant.accountId), familyId: tenant.familyId },
          async (tx) => {
            const patch: {
              name?: string;
              externalId?: string | null;
              alarmState?: 'disarmed' | 'armed_home' | 'armed_away' | 'triggered';
            } = {};
            if (body.name !== undefined) {
              patch.name = body.name;
            }
            if (body.externalId !== undefined) {
              patch.externalId = body.externalId;
            }
            if (body.alarmState !== undefined) {
              patch.alarmState = body.alarmState;
            }
            const updated = await repo.updateZone(
              tx,
              tenant.familyId,
              houseId,
              zoneId,
              expectedVersion,
              tenant.accountId,
              patch,
            );
            if (updated === undefined) {
              conflict(expectedVersion);
            }
            if (body.alarmState !== undefined) {
              await repo.insertEvent(tx, {
                familyId: tenant.familyId,
                houseId,
                deviceId: null,
                occurredAt: new Date(),
                kind: body.alarmState === 'disarmed' ? 'alarm_cleared' : 'alarm_triggered',
                state: { alarmState: body.alarmState, zoneId },
              });
            }
            return viewZone(updated);
          },
        );
      });
    },

    /**
     * Soft-deletes a zone.
     *
     * @param tenant - Caller tenant.
     * @param houseId - House id.
     * @param zoneId - Zone id.
     * @param expectedVersion - If-Match version.
     */
    deleteZone(
      tenant: TenantContext,
      houseId: string,
      zoneId: string,
      expectedVersion: number,
    ): Promise<void> {
      return guarded(async () =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          const deleted = await repo.softDeleteZone(
            tx,
            tenant.familyId,
            houseId,
            zoneId,
            expectedVersion,
            tenant.accountId,
          );
          if (deleted === undefined) {
            const current = await repo.getZone(tx, tenant.familyId, houseId, zoneId);
            if (current === undefined) {
              throw new ProblemError('not_found');
            }
            conflict(current.version);
          }
        }),
      );
    },

    /**
     * Lists recent automation events.
     *
     * @param tenant - Caller tenant.
     * @param houseId - House id.
     * @param query - Pagination.
     * @returns Event page.
     */
    listEvents(
      tenant: TenantContext,
      houseId: string,
      query: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<HaEvent>> {
      return guarded(async () =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          const rows = await repo.listEvents(tx, tenant.familyId, houseId, query.limit + 1, query.after);
          const hasMore = rows.length > query.limit;
          const slice = hasMore ? rows.slice(0, query.limit) : rows;
          const last = slice.at(-1);
          return {
            items: slice.map(viewEvent),
            nextCursor:
              hasMore && last !== undefined ? encodeCursor([last.occurredAt.toISOString(), last.id]) : null,
          };
        }),
      );
    },

    /**
     * Lists temporary lock codes and marks expired ones.
     *
     * @param tenant - Caller tenant.
     * @param houseId - House id.
     * @param query - Pagination.
     * @returns Lock code page.
     */
    listLockCodes(
      tenant: TenantContext,
      houseId: string,
      query: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<HaLockCode>> {
      return guarded(async () =>
        withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, async (tx) => {
          await repo.expireLockCodes(tx, tenant.familyId, houseId, new Date());
          const rows = await repo.listLockCodes(tx, tenant.familyId, houseId, query.limit + 1, query.after);
          return pageOf(rows, query.limit, viewLockCode);
        }),
      );
    },

    /**
     * Issues a temporary smart-lock code through the adapter. The plaintext is returned once.
     *
     * @param tenant - Caller tenant (admin).
     * @param houseId - House id.
     * @param deviceId - Lock device id.
     * @param body - Label and validity window.
     * @returns Metadata and plaintext code.
     */
    issueLockCode(
      tenant: TenantContext,
      houseId: string,
      deviceId: string,
      body: IssueHaLockCodeRequest,
    ): Promise<{ lockCode: HaLockCode; code: string }> {
      return guarded(async () => {
        if (Date.parse(body.validUntil) <= Date.parse(body.validFrom)) {
          throw new ProblemError('validation_failed', { detail: 'validUntil must be after validFrom' });
        }
        const device = await withContext(
          db,
          { principal: account(tenant.accountId), familyId: tenant.familyId },
          async (tx) => repo.getDevice(tx, tenant.familyId, houseId, deviceId),
        );
        if (device === undefined) {
          throw new ProblemError('not_found');
        }
        if (device.kind !== 'lock') {
          throw new ProblemError('domain_rule_violated', { detail: 'Device is not a lock' });
        }
        const connection = await withContext(
          db,
          { principal: account(tenant.accountId), familyId: tenant.familyId },
          async (tx) => repo.getConnection(tx, tenant.familyId, houseId, device.connectionId),
        );
        if (connection === undefined) {
          throw new ProblemError('not_found');
        }
        const credentials = await openCredentials(connection);
        const issued = await adapter.issueTemporaryLockCode(credentials, {
          deviceExternalId: device.externalId,
          label: body.label,
          validFrom: new Date(body.validFrom),
          validUntil: new Date(body.validUntil),
        });
        return withContext(
          db,
          { principal: account(tenant.accountId), familyId: tenant.familyId },
          async (tx) => {
            const row = await repo.insertLockCode(tx, {
              familyId: tenant.familyId,
              houseId,
              deviceId,
              label: body.label,
              validFrom: new Date(body.validFrom),
              validUntil: new Date(body.validUntil),
              codeSuffix: issued.code.slice(-2),
              externalSlot: issued.externalSlotId,
              accountId: tenant.accountId,
            });
            await recordAudit(tx, {
              familyId: tenant.familyId,
              actor: { kind: 'account', id: tenant.accountId },
              action: 'automation.lock_code.issue',
              resourceType: 'ha_lock_code',
              resourceId: row.id,
              outcome: 'success',
              metadata: { houseId },
            });
            return { lockCode: viewLockCode(row), code: issued.code };
          },
        );
      });
    },

    /**
     * Ingests a signed Home Assistant webhook. Runs as system principal.
     *
     * @param connectionId - Target connection.
     * @param rawBody - Exact request body bytes as UTF-8 text (for HMAC).
     * @param headers - Signature headers.
     * @param body - Parsed ingest payload.
     */
    async ingestWebhook(
      connectionId: string,
      rawBody: string,
      headers: { timestamp: string | undefined; eventId: string | undefined; signature: string | undefined },
      body: HomeAssistantIngest,
    ): Promise<void> {
      const timestampHeader = headers.timestamp;
      const eventId = headers.eventId;
      const signatureHeader = headers.signature;
      if (timestampHeader === undefined || eventId === undefined || signatureHeader === undefined) {
        throw new ProblemError('unauthenticated');
      }
      const timestampMs = Number(timestampHeader);
      if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60_000) {
        throw new ProblemError('unauthenticated');
      }
      const replayKey = `ha-webhook:${connectionId}:${eventId}`;
      const reserved = await store.setIfAbsent(replayKey, '1', 600);
      if (!reserved) {
        throw new ProblemError('idempotency_key_reused');
      }
      await withContext(db, { principal: { kind: 'system' } }, async (tx) => {
        const identity = await repo.findConnectionIdentity(tx, connectionId);
        if (identity === null) {
          throw new ProblemError('not_found');
        }
        if (identity.deletedAt !== null || identity.status === 'disabled') {
          throw new ProblemError('not_found');
        }
        await setFamilyContext(tx, { kind: 'system' }, identity.familyId);
        const row = await repo.getConnection(tx, identity.familyId, identity.houseId, identity.id);
        if (row === undefined) {
          throw new ProblemError('not_found');
        }
        const candidates: string[] = [];
        for (const column of ['inbound_secret_current_sealed', 'inbound_secret_previous_sealed'] as const) {
          const sealed =
            column === 'inbound_secret_current_sealed'
              ? row.inboundSecretCurrentSealed
              : row.inboundSecretPreviousSealed;
          if (sealed === null) {
            continue;
          }
          candidates.push(
            decodeUtf8(
              await secrets.open(sealed, {
                table: 'ha_connections',
                column,
                rowId: row.id,
              }),
            ),
          );
        }
        if (candidates.length === 0) {
          throw new ProblemError('unauthenticated');
        }
        const expectedPrefix = 'v1=';
        const provided = signatureHeader.startsWith(expectedPrefix)
          ? signatureHeader.slice(expectedPrefix.length)
          : signatureHeader;
        let matched = false;
        for (const secret of candidates) {
          const digest = createHmac('sha256', secret).update(`${timestampHeader}.${rawBody}`).digest('hex');
          const a = Buffer.from(digest, 'utf8');
          const b = Buffer.from(provided, 'utf8');
          if (a.length === b.length && timingSafeEqual(a, b)) {
            matched = true;
            break;
          }
        }
        if (!matched) {
          throw new ProblemError('unauthenticated');
        }
        for (const event of body.events) {
          const kind = kindFromEntityId(event.entityId);
          const device = await repo.upsertDevice(tx, {
            familyId: row.familyId,
            houseId: row.houseId,
            connectionId: row.id,
            externalId: event.entityId,
            kind,
            name: event.entityId,
            unit: event.unit,
            lastValue: event.value,
            lastState: event.state,
            lastSeenAt: new Date(event.occurredAt),
            accountId: null,
          });
          await repo.insertEvent(tx, {
            familyId: row.familyId,
            houseId: row.houseId,
            deviceId: device.id,
            occurredAt: new Date(event.occurredAt),
            kind: eventKindFromState(kind, event.state),
            state: {
              state: event.state,
              value: event.value,
              ...(event.attributes ?? {}),
            },
          });
        }
        await repo.updateConnection(tx, row.familyId, row.houseId, row.id, {
          lastEventAt: new Date(),
          status: 'active',
          lastErrorCode: null,
          accountId: null,
          expectedVersion: row.version,
        });
      });
    },
  };
}

/** Home-automation service created by {@link createHomeAutomationService}. */
export type HomeAutomationService = ReturnType<typeof createHomeAutomationService>;
