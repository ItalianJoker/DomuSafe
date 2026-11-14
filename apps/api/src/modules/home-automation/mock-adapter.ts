import type {
  BridgeCredentials,
  EntitySnapshot,
  HomeAutomationAdapter,
  TemporaryLockCodeRequest,
  TemporaryLockCodeResult,
  ZoneAlarmCommand,
} from './adapter.js';

const MOCK_ENTITIES: readonly EntitySnapshot[] = [
  {
    externalId: 'sensor.cucina_temperatura',
    kind: 'temperature',
    name: 'Temperatura cucina',
    unit: '°C',
    lastValue: 21.5,
    lastState: '21.5',
  },
  {
    externalId: 'binary_sensor.ingresso_fumo',
    kind: 'smoke',
    name: 'Sensore fumo ingresso',
    unit: null,
    lastValue: null,
    lastState: 'off',
  },
  {
    externalId: 'alarm_control_panel.casa',
    kind: 'alarm_panel',
    name: 'Allarme casa',
    unit: null,
    lastValue: null,
    lastState: 'disarmed',
  },
  {
    externalId: 'lock.portone',
    kind: 'lock',
    name: 'Serratura portone',
    unit: null,
    lastValue: null,
    lastState: 'locked',
  },
];

/**
 * Deterministic bridge used in tests and when no live transport is configured.
 *
 * Preconditions: none.
 * Postconditions: never opens a network socket.
 * Data contract: entity identifiers and states are fixed fixtures.
 */
export class MockHomeAutomationAdapter implements HomeAutomationAdapter {
  /**
   * Accepts every non-empty credential set as healthy.
   *
   * @param credentials - Opened connection settings.
   * @returns Always successful with a short detail.
   */
  testConnection(
    credentials: BridgeCredentials,
  ): Promise<{ readonly ok: boolean; readonly detail: string | null }> {
    const ready =
      (credentials.kind === 'mqtt' && credentials.mqttUrl !== null) ||
      (credentials.kind !== 'mqtt' && credentials.baseUrl !== null);
    return Promise.resolve({
      ok: ready,
      detail: ready ? 'mock_ok' : 'mock_missing_endpoint',
    });
  }

  /**
   * Returns the fixed entity catalogue after a mock health check.
   *
   * @param credentials - Opened connection settings used for the health check.
   * @returns Fixture entities.
   */
  async listEntities(credentials: BridgeCredentials): Promise<readonly EntitySnapshot[]> {
    await this.testConnection(credentials);
    return MOCK_ENTITIES;
  }

  /**
   * Echoes the requested armed mode as the panel state.
   *
   * @param credentials - Opened connection settings used for the health check.
   * @param command - Target zone and mode.
   * @returns Snapshot for the house alarm panel.
   */
  async setZoneAlarm(
    credentials: BridgeCredentials,
    command: ZoneAlarmCommand,
  ): Promise<EntitySnapshot | null> {
    await this.testConnection(credentials);
    return {
      externalId: command.zoneExternalId,
      kind: 'alarm_panel',
      name: 'Allarme casa',
      unit: null,
      lastValue: null,
      lastState: command.mode,
    };
  }

  /**
   * Issues a deterministic six-digit guest code.
   *
   * @param credentials - Opened connection settings used for the health check.
   * @param request - Validity window used to salt the code.
   * @returns A code derived from the validity window so tests stay stable.
   */
  async issueTemporaryLockCode(
    credentials: BridgeCredentials,
    request: TemporaryLockCodeRequest,
  ): Promise<TemporaryLockCodeResult> {
    await this.testConnection(credentials);
    const stamp = String(request.validUntil.getTime() % 1_000_000).padStart(6, '0');
    return {
      code: stamp,
      externalSlotId: `mock-slot-${credentials.kind}-${request.deviceExternalId}`,
    };
  }
}
