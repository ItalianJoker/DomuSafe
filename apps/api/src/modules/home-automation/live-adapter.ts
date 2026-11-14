import type { HaDeviceKind } from '@domusafe/contracts';
import type {
  BridgeCredentials,
  EntitySnapshot,
  HomeAutomationAdapter,
  TemporaryLockCodeRequest,
  TemporaryLockCodeResult,
  ZoneAlarmCommand,
} from './adapter.js';
import { assertPublicHost } from './host-guard.js';

const FETCH_TIMEOUT_MS = 5_000;
const MAX_BYTES = 512 * 1024;

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

async function readJson(response: Response): Promise<unknown> {
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error('too_large');
  }
  return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
}

/**
 * Live Home Assistant REST adapter. MQTT connections are accepted for storage and tests but the
 * live path only performs HTTP calls when `kind` is `home_assistant_api`.
 *
 * Preconditions: `assertPublicHost` rejects private destinations in SaaS.
 * Postconditions: network failures become `{ ok: false }` or empty lists; no secrets are logged.
 * Data contract: entity ids and states come from Home Assistant `/api/states`.
 */
export class LiveHomeAutomationAdapter implements HomeAutomationAdapter {
  /**
   * Calls `/api/` on the configured base URL with the long-lived token.
   *
   * @param credentials - Opened connection settings.
   * @returns Probe result.
   */
  async testConnection(
    credentials: BridgeCredentials,
  ): Promise<{ readonly ok: boolean; readonly detail: string | null }> {
    if (credentials.kind === 'mqtt') {
      return { ok: credentials.mqttUrl !== null, detail: 'mqtt_stored' };
    }
    if (credentials.kind === 'home_assistant_webhook') {
      return { ok: credentials.baseUrl !== null, detail: 'webhook_ready' };
    }
    if (credentials.baseUrl === null || credentials.token === null) {
      return { ok: false, detail: 'missing_credentials' };
    }
    try {
      const url = new URL('/api/', credentials.baseUrl);
      await assertPublicHost(url.hostname);
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${credentials.token}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'error',
      });
      return { ok: response.ok, detail: response.ok ? 'api_ok' : `http_${String(response.status)}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'fetch_failed';
      return { ok: false, detail: message.slice(0, 80) };
    }
  }

  /**
   * Loads `/api/states` and maps known domains to device kinds.
   *
   * @param credentials - Opened connection settings.
   * @returns Entity snapshots, or an empty list when the endpoint cannot be reached.
   */
  async listEntities(credentials: BridgeCredentials): Promise<readonly EntitySnapshot[]> {
    if (
      credentials.kind !== 'home_assistant_api' ||
      credentials.baseUrl === null ||
      credentials.token === null
    ) {
      return [];
    }
    try {
      const url = new URL('/api/states', credentials.baseUrl);
      await assertPublicHost(url.hostname);
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${credentials.token}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'error',
      });
      if (!response.ok) {
        return [];
      }
      const payload = await readJson(response);
      if (!Array.isArray(payload)) {
        return [];
      }
      const out: EntitySnapshot[] = [];
      for (const entry of payload) {
        if (typeof entry !== 'object' || entry === null) {
          continue;
        }
        const record = entry as Record<string, unknown>;
        const entityId = typeof record.entity_id === 'string' ? record.entity_id : null;
        const state = typeof record.state === 'string' ? record.state : null;
        if (entityId === null || state === null) {
          continue;
        }
        const attributes =
          typeof record.attributes === 'object' && record.attributes !== null
            ? (record.attributes as Record<string, unknown>)
            : {};
        const friendly = typeof attributes.friendly_name === 'string' ? attributes.friendly_name : entityId;
        const unit =
          typeof attributes.unit_of_measurement === 'string' ? attributes.unit_of_measurement : null;
        const numeric = Number(state);
        out.push({
          externalId: entityId,
          kind: kindFromEntityId(entityId),
          name: friendly.slice(0, 160),
          unit,
          lastValue: Number.isFinite(numeric) ? numeric : null,
          lastState: state.slice(0, 200),
        });
        if (out.length >= 500) {
          break;
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  /**
   * Calls the Home Assistant alarm service when credentials allow it.
   *
   * @param credentials - Opened connection settings.
   * @param command - Target zone and mode.
   * @returns Updated snapshot, or null when the call is skipped or fails.
   */
  async setZoneAlarm(
    credentials: BridgeCredentials,
    command: ZoneAlarmCommand,
  ): Promise<EntitySnapshot | null> {
    if (
      credentials.kind !== 'home_assistant_api' ||
      credentials.baseUrl === null ||
      credentials.token === null
    ) {
      return {
        externalId: command.zoneExternalId,
        kind: 'alarm_panel',
        name: command.zoneExternalId,
        unit: null,
        lastValue: null,
        lastState: command.mode,
      };
    }
    const service =
      command.mode === 'disarmed'
        ? 'alarm_disarm'
        : command.mode === 'armed_home'
          ? 'alarm_arm_home'
          : 'alarm_arm_away';
    try {
      const url = new URL(`/api/services/alarm_control_panel/${service}`, credentials.baseUrl);
      await assertPublicHost(url.hostname);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entity_id: command.zoneExternalId }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'error',
      });
      if (!response.ok) {
        return null;
      }
      return {
        externalId: command.zoneExternalId,
        kind: 'alarm_panel',
        name: command.zoneExternalId,
        unit: null,
        lastValue: null,
        lastState: command.mode,
      };
    } catch {
      return null;
    }
  }

  /**
   * Asks Home Assistant to create a temporary lock code via the `lock` domain service when possible;
   * otherwise returns a local random code so the DomuSafe record can still be created in mock-friendly
   * deployments.
   *
   * @param credentials - Opened connection settings.
   * @param request - Lock, label and validity window.
   * @returns The code and optional remote slot.
   */
  async issueTemporaryLockCode(
    credentials: BridgeCredentials,
    request: TemporaryLockCodeRequest,
  ): Promise<TemporaryLockCodeResult> {
    const code = String(Math.floor(100_000 + Math.random() * 900_000));
    if (
      credentials.kind !== 'home_assistant_api' ||
      credentials.baseUrl === null ||
      credentials.token === null
    ) {
      return { code, externalSlotId: null };
    }
    try {
      const url = new URL('/api/services/lock/set_usercode', credentials.baseUrl);
      await assertPublicHost(url.hostname);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entity_id: request.deviceExternalId,
          code,
          code_slot_name: request.label,
          code_slot: undefined,
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'error',
      });
      return { code, externalSlotId: response.ok ? request.label : null };
    } catch {
      return { code, externalSlotId: null };
    }
  }
}
