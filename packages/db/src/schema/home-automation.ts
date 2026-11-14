import { sql } from 'drizzle-orm';
import { doublePrecision, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { bytea, instant } from '../columns.js';
import {
  haConnectionKindEnum,
  haConnectionStatusEnum,
  haDeviceKindEnum,
  haEventKindEnum,
  haLockCodeStatusEnum,
  haZoneAlarmStateEnum,
} from './enums.js';

/** Home Assistant or MQTT connection of one house. Secrets are class S blobs. */
export const haConnections = pgTable('ha_connections', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id').notNull(),
  kind: haConnectionKindEnum('kind').notNull(),
  name: text('name').notNull(),
  baseUrl: text('base_url'),
  mqttUrl: text('mqtt_url'),
  mqttTopicPrefix: text('mqtt_topic_prefix'),
  mqttUsername: text('mqtt_username'),
  credentialsSealed: bytea('credentials_sealed'),
  inboundSecretCurrentSealed: bytea('inbound_secret_current_sealed'),
  inboundSecretPreviousSealed: bytea('inbound_secret_previous_sealed'),
  secretRotatedAt: instant('secret_rotated_at'),
  status: haConnectionStatusEnum('status').notNull().default('active'),
  lastEventAt: instant('last_event_at'),
  lastCheckedAt: instant('last_checked_at'),
  lastErrorCode: text('last_error_code'),
  deletedAt: instant('deleted_at'),
});

/** Named alarm zone of a house. */
export const haZones = pgTable('ha_zones', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id').notNull(),
  name: text('name').notNull(),
  externalId: text('external_id'),
  alarmState: haZoneAlarmStateEnum('alarm_state').notNull().default('disarmed'),
  deletedAt: instant('deleted_at'),
});

/** Synced entity or device under a connection. */
export const haDevices = pgTable('ha_devices', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id').notNull(),
  connectionId: uuid('connection_id').notNull(),
  zoneId: uuid('zone_id'),
  roomId: uuid('room_id'),
  externalId: text('external_id').notNull(),
  kind: haDeviceKindEnum('kind').notNull().default('other'),
  name: text('name').notNull(),
  unit: text('unit'),
  lastValue: doublePrecision('last_value'),
  lastState: text('last_state'),
  lastSeenAt: instant('last_seen_at'),
  deletedAt: instant('deleted_at'),
});

/** Append-only home-automation event. */
export const haEvents = pgTable('ha_events', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id').notNull(),
  deviceId: uuid('device_id'),
  occurredAt: instant('occurred_at').notNull(),
  kind: haEventKindEnum('kind').notNull(),
  state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
  notifiedAt: instant('notified_at'),
  createdAt: instant('created_at').notNull().defaultNow(),
});

/** Issued temporary smart-lock code metadata (the full code is shown once). */
export const haLockCodes = pgTable('ha_lock_codes', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id').notNull(),
  deviceId: uuid('device_id').notNull(),
  label: text('label').notNull(),
  validFrom: instant('valid_from').notNull(),
  validUntil: instant('valid_until').notNull(),
  codeSuffix: text('code_suffix').notNull(),
  status: haLockCodeStatusEnum('status').notNull().default('active'),
  externalSlot: text('external_slot'),
  deletedAt: instant('deleted_at'),
});
