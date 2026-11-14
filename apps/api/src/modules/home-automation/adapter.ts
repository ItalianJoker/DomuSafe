import type { HaDeviceKind, HaZoneAlarmState } from '@domusafe/contracts';

/** Credentials opened from sealed storage for one outbound bridge call. */
export interface BridgeCredentials {
  readonly kind: 'home_assistant_webhook' | 'home_assistant_api' | 'mqtt';
  readonly baseUrl: string | null;
  readonly token: string | null;
  readonly mqttUrl: string | null;
  readonly mqttTopicPrefix: string | null;
  readonly mqttUsername: string | null;
  readonly mqttPassword: string | null;
}

/** Latest state of one remote entity. */
export interface EntitySnapshot {
  readonly externalId: string;
  readonly kind: HaDeviceKind;
  readonly name: string;
  readonly unit: string | null;
  readonly lastValue: number | null;
  readonly lastState: string | null;
}

/** Request to create a temporary smart-lock code on the remote lock. */
export interface TemporaryLockCodeRequest {
  readonly deviceExternalId: string;
  readonly label: string;
  readonly validFrom: Date;
  readonly validUntil: Date;
}

/** Result of issuing a temporary smart-lock code. */
export interface TemporaryLockCodeResult {
  readonly code: string;
  readonly externalSlotId: string | null;
}

/** Command to change a zone alarm armed state. */
export interface ZoneAlarmCommand {
  readonly zoneExternalId: string;
  readonly mode: Extract<HaZoneAlarmState, 'disarmed' | 'armed_home' | 'armed_away'>;
}

/**
 * Outbound bridge to Home Assistant or an MQTT broker.
 *
 * Preconditions: credentials are already opened; hosts have been checked against the SSRF policy.
 * Postconditions: implementations must not throw raw network errors; they return structured failures
 * or throw `ProblemError` codes the service already understands (`upstream_unavailable`,
 * `domain_rule_violated`).
 * Data contract: no secrets are logged; entity identifiers stay opaque strings from the bridge.
 */
export interface HomeAutomationAdapter {
  /**
   * Probes whether the remote endpoint accepts the credentials.
   *
   * @param credentials - Opened connection settings.
   * @returns Whether the probe succeeded and an optional short detail for the admin.
   */
  testConnection(
    credentials: BridgeCredentials,
  ): Promise<{ readonly ok: boolean; readonly detail: string | null }>;

  /**
   * Lists current entity states from the remote bridge.
   *
   * @param credentials - Opened connection settings.
   * @returns Entity snapshots ready to upsert into `ha_devices`.
   */
  listEntities(credentials: BridgeCredentials): Promise<readonly EntitySnapshot[]>;

  /**
   * Arms or disarms a zone on the remote alarm panel.
   *
   * @param credentials - Opened connection settings.
   * @param command - Target zone and mode.
   * @returns Updated entity snapshot for the panel when available.
   */
  setZoneAlarm(credentials: BridgeCredentials, command: ZoneAlarmCommand): Promise<EntitySnapshot | null>;

  /**
   * Creates a temporary guest code on a smart lock.
   *
   * @param credentials - Opened connection settings.
   * @param request - Lock, label and validity window.
   * @returns The plaintext code and optional remote slot id.
   */
  issueTemporaryLockCode(
    credentials: BridgeCredentials,
    request: TemporaryLockCodeRequest,
  ): Promise<TemporaryLockCodeResult>;
}
