import { z } from 'zod';
import { instantSchema, pageSchema, uuidSchema } from './common.js';

/** How a connection reaches the house bridge. */
export const HA_CONNECTION_KINDS = ['home_assistant_webhook', 'home_assistant_api', 'mqtt'] as const;
/** How a connection reaches the house bridge. */
export type HaConnectionKind = (typeof HA_CONNECTION_KINDS)[number];

/** Health of a stored connection. */
export const HA_CONNECTION_STATUSES = ['active', 'error', 'disabled'] as const;
/** Health of a stored connection. */
export type HaConnectionStatus = (typeof HA_CONNECTION_STATUSES)[number];

/** Kind of a synced device or entity. */
export const HA_DEVICE_KINDS = [
  'temperature',
  'humidity',
  'power',
  'energy',
  'solar_production',
  'battery',
  'ev_charger',
  'water_leak',
  'smoke',
  'door_window',
  'motion',
  'alarm_panel',
  'lock',
  'other',
] as const;
/** Kind of a synced device or entity. */
export type HaDeviceKind = (typeof HA_DEVICE_KINDS)[number];

/** Kind of a home-automation event. */
export const HA_EVENT_KINDS = [
  'alarm_triggered',
  'alarm_cleared',
  'leak_detected',
  'smoke_detected',
  'lock_locked',
  'lock_unlocked',
  'door_opened',
  'battery_low',
  'device_offline',
  'state_changed',
] as const;
/** Kind of a home-automation event. */
export type HaEventKind = (typeof HA_EVENT_KINDS)[number];

/** Armed state of a zone alarm. */
export const HA_ZONE_ALARM_STATES = ['disarmed', 'armed_home', 'armed_away', 'triggered'] as const;
/** Armed state of a zone alarm. */
export type HaZoneAlarmState = (typeof HA_ZONE_ALARM_STATES)[number];

/** Lifecycle of a temporary lock code. */
export const HA_LOCK_CODE_STATUSES = ['active', 'revoked', 'expired'] as const;
/** Lifecycle of a temporary lock code. */
export type HaLockCodeStatus = (typeof HA_LOCK_CODE_STATUSES)[number];

const nameSchema = z.string().trim().min(1).max(140);
const deviceNameSchema = z.string().trim().min(1).max(160);
const urlSchema = z.url().max(2048);
/** Broker URL (`mqtt:`, `mqtts:` or `tcp:`). Protocol is enforced in the service. */
const mqttUrlSchema = z.string().trim().min(1).max(2048);
const topicPrefixSchema = z.string().trim().min(1).max(200);
const usernameSchema = z.string().trim().min(1).max(200);
const tokenSchema = z.string().min(8).max(4096);
const passwordSchema = z.string().min(1).max(512);
const externalIdSchema = z.string().trim().min(1).max(200);
const unitSchema = z.string().trim().min(1).max(40);
const stateSchema = z.string().trim().min(1).max(200);
const labelSchema = z.string().trim().min(1).max(140);
const limitField = z.coerce.number().int().min(1).max(200).default(50);
const cursorField = z.string().max(512).optional();

/** One stored connection without secrets. */
export const haConnectionSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    kind: z.enum(HA_CONNECTION_KINDS),
    name: nameSchema,
    baseUrl: z.string().max(2048).nullable(),
    mqttUrl: z.string().max(2048).nullable(),
    mqttTopicPrefix: z.string().max(200).nullable(),
    mqttUsername: z.string().max(200).nullable(),
    hasCredentials: z.boolean(),
    hasInboundSecret: z.boolean(),
    status: z.enum(HA_CONNECTION_STATUSES),
    lastEventAt: instantSchema.nullable(),
    lastCheckedAt: instantSchema.nullable(),
    lastErrorCode: z.string().max(80).nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'HaConnection' });
/** One stored connection without secrets. */
export type HaConnection = z.infer<typeof haConnectionSchema>;

/** Page of connections. */
export const haConnectionPageSchema = pageSchema(haConnectionSchema).meta({ id: 'HaConnectionPage' });
/** Page of connections. */
export type HaConnectionPage = z.infer<typeof haConnectionPageSchema>;

/** Body to create a connection. Secrets are accepted once and sealed server-side. */
export const createHaConnectionRequestSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('mqtt'),
        name: nameSchema,
        mqttUrl: mqttUrlSchema,
        mqttTopicPrefix: topicPrefixSchema.nullable().optional(),
        mqttUsername: usernameSchema.nullable().optional(),
        mqttPassword: passwordSchema.optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('home_assistant_api'),
        name: nameSchema,
        baseUrl: urlSchema,
        token: tokenSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal('home_assistant_webhook'),
        name: nameSchema,
        baseUrl: urlSchema,
        token: tokenSchema.optional(),
      })
      .strict(),
  ])
  .meta({ id: 'CreateHaConnectionRequest' });
/** Body to create a connection. */
export type CreateHaConnectionRequest = z.infer<typeof createHaConnectionRequestSchema>;

/** Body to update connection settings. Omitted secrets stay unchanged. */
export const updateHaConnectionRequestSchema = z
  .object({
    name: nameSchema.optional(),
    baseUrl: urlSchema.nullable().optional(),
    token: tokenSchema.nullable().optional(),
    mqttUrl: mqttUrlSchema.nullable().optional(),
    mqttTopicPrefix: topicPrefixSchema.nullable().optional(),
    mqttUsername: usernameSchema.nullable().optional(),
    mqttPassword: passwordSchema.nullable().optional(),
    status: z.enum(HA_CONNECTION_STATUSES).optional(),
  })
  .strict()
  .meta({ id: 'UpdateHaConnectionRequest' });
/** Body to update connection settings. */
export type UpdateHaConnectionRequest = z.infer<typeof updateHaConnectionRequestSchema>;

/** Result of testing a connection through the bridge adapter. */
export const haConnectionTestResultSchema = z
  .object({
    ok: z.boolean(),
    detail: z.string().max(400).nullable(),
    connection: haConnectionSchema,
  })
  .strict()
  .meta({ id: 'HaConnectionTestResult' });
/** Result of testing a connection through the bridge adapter. */
export type HaConnectionTestResult = z.infer<typeof haConnectionTestResultSchema>;

/** Fresh inbound webhook secret, shown once after create or rotate. */
export const haInboundSecretResponseSchema = z
  .object({
    connection: haConnectionSchema,
    inboundSecret: z.string().min(16).max(128),
  })
  .strict()
  .meta({ id: 'HaInboundSecretResponse' });
/** Fresh inbound webhook secret, shown once after create or rotate. */
export type HaInboundSecretResponse = z.infer<typeof haInboundSecretResponseSchema>;

/** Create-connection response: inbound secret is present for webhook and API kinds. */
export const createHaConnectionResponseSchema = z
  .object({
    connection: haConnectionSchema,
    inboundSecret: z.string().min(16).max(128).nullable(),
  })
  .strict()
  .meta({ id: 'CreateHaConnectionResponse' });
/** Create-connection response. */
export type CreateHaConnectionResponse = z.infer<typeof createHaConnectionResponseSchema>;

/** One synced device with latest status. */
export const haDeviceSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    connectionId: uuidSchema,
    zoneId: uuidSchema.nullable(),
    roomId: uuidSchema.nullable(),
    externalId: externalIdSchema,
    kind: z.enum(HA_DEVICE_KINDS),
    name: deviceNameSchema,
    unit: unitSchema.nullable(),
    lastValue: z.number().nullable(),
    lastState: stateSchema.nullable(),
    lastSeenAt: instantSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'HaDevice' });
/** One synced device with latest status. */
export type HaDevice = z.infer<typeof haDeviceSchema>;

/** Page of devices. */
export const haDevicePageSchema = pageSchema(haDeviceSchema).meta({ id: 'HaDevicePage' });
/** Page of devices. */
export type HaDevicePage = z.infer<typeof haDevicePageSchema>;

/** Query of devices. */
export const haDeviceListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    kind: z.enum(HA_DEVICE_KINDS).optional(),
  })
  .strict();
/** Query of devices. */
export type HaDeviceListQuery = z.infer<typeof haDeviceListQuerySchema>;

/** Body to rename a device or assign it to a room or zone. */
export const updateHaDeviceRequestSchema = z
  .object({
    name: deviceNameSchema.optional(),
    zoneId: uuidSchema.nullable().optional(),
    roomId: uuidSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'UpdateHaDeviceRequest' });
/** Body to rename a device or assign it to a room or zone. */
export type UpdateHaDeviceRequest = z.infer<typeof updateHaDeviceRequestSchema>;

/** One zone alarm. */
export const haZoneSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    name: nameSchema,
    externalId: externalIdSchema.nullable(),
    alarmState: z.enum(HA_ZONE_ALARM_STATES),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'HaZone' });
/** One zone alarm. */
export type HaZone = z.infer<typeof haZoneSchema>;

/** Page of zones. */
export const haZonePageSchema = pageSchema(haZoneSchema).meta({ id: 'HaZonePage' });
/** Page of zones. */
export type HaZonePage = z.infer<typeof haZonePageSchema>;

/** Body to create a zone. */
export const createHaZoneRequestSchema = z
  .object({
    name: nameSchema,
    externalId: externalIdSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateHaZoneRequest' });
/** Body to create a zone. */
export type CreateHaZoneRequest = z.infer<typeof createHaZoneRequestSchema>;

/** Body to rename a zone or change its armed state. */
export const updateHaZoneRequestSchema = z
  .object({
    name: nameSchema.optional(),
    externalId: externalIdSchema.nullable().optional(),
    alarmState: z.enum(['disarmed', 'armed_home', 'armed_away']).optional(),
  })
  .strict()
  .meta({ id: 'UpdateHaZoneRequest' });
/** Body to rename a zone or change its armed state. */
export type UpdateHaZoneRequest = z.infer<typeof updateHaZoneRequestSchema>;

/** One home-automation event. */
export const haEventSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    deviceId: uuidSchema.nullable(),
    occurredAt: instantSchema,
    kind: z.enum(HA_EVENT_KINDS),
    state: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .strict()
  .meta({ id: 'HaEvent' });
/** One home-automation event. */
export type HaEvent = z.infer<typeof haEventSchema>;

/** Page of events. */
export const haEventPageSchema = pageSchema(haEventSchema).meta({ id: 'HaEventPage' });
/** Page of events. */
export type HaEventPage = z.infer<typeof haEventPageSchema>;

/** Metadata of an issued temporary lock code (full code only on create). */
export const haLockCodeSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema,
    deviceId: uuidSchema,
    label: labelSchema,
    validFrom: instantSchema,
    validUntil: instantSchema,
    codeSuffix: z.string().min(1).max(8),
    status: z.enum(HA_LOCK_CODE_STATUSES),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'HaLockCode' });
/** Metadata of an issued temporary lock code. */
export type HaLockCode = z.infer<typeof haLockCodeSchema>;

/** Page of lock codes. */
export const haLockCodePageSchema = pageSchema(haLockCodeSchema).meta({ id: 'HaLockCodePage' });
/** Page of lock codes. */
export type HaLockCodePage = z.infer<typeof haLockCodePageSchema>;

/** Body to issue a temporary smart-lock code. */
export const issueHaLockCodeRequestSchema = z
  .object({
    label: labelSchema,
    validFrom: instantSchema,
    validUntil: instantSchema,
  })
  .strict()
  .meta({ id: 'IssueHaLockCodeRequest' });
/** Body to issue a temporary smart-lock code. */
export type IssueHaLockCodeRequest = z.infer<typeof issueHaLockCodeRequestSchema>;

/** Response that includes the plaintext code once. */
export const issueHaLockCodeResponseSchema = z
  .object({
    lockCode: haLockCodeSchema,
    code: z.string().min(4).max(16),
  })
  .strict()
  .meta({ id: 'IssueHaLockCodeResponse' });
/** Response that includes the plaintext code once. */
export type IssueHaLockCodeResponse = z.infer<typeof issueHaLockCodeResponseSchema>;

/** Result of refreshing entity status through the adapter. */
export const haRefreshResultSchema = z
  .object({
    devices: z.array(haDeviceSchema).max(500),
  })
  .strict()
  .meta({ id: 'HaRefreshResult' });
/** Result of refreshing entity status through the adapter. */
export type HaRefreshResult = z.infer<typeof haRefreshResultSchema>;

/** Inbound Home Assistant webhook body (phase 3 §7.4). */
export const homeAssistantIngestSchema = z
  .object({
    events: z
      .array(
        z
          .object({
            entityId: externalIdSchema,
            state: stateSchema,
            value: z.number().nullable(),
            unit: unitSchema.nullable(),
            occurredAt: instantSchema,
            attributes: z
              .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
              .nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .meta({ id: 'HomeAssistantIngest' });
/** Inbound Home Assistant webhook body. */
export type HomeAssistantIngest = z.infer<typeof homeAssistantIngestSchema>;

/** Path params of one connection. */
export const haConnectionParamsSchema = z
  .object({ familyId: uuidSchema, houseId: uuidSchema, connectionId: uuidSchema })
  .strict();
/** Path params of one connection. */
export type HaConnectionParams = z.infer<typeof haConnectionParamsSchema>;

/** Path params of one device. */
export const haDeviceParamsSchema = z
  .object({ familyId: uuidSchema, houseId: uuidSchema, deviceId: uuidSchema })
  .strict();
/** Path params of one device. */
export type HaDeviceParams = z.infer<typeof haDeviceParamsSchema>;

/** Path params of one zone. */
export const haZoneParamsSchema = z
  .object({ familyId: uuidSchema, houseId: uuidSchema, zoneId: uuidSchema })
  .strict();
/** Path params of one zone. */
export type HaZoneParams = z.infer<typeof haZoneParamsSchema>;

/** Path params of the public Home Assistant webhook. */
export const haWebhookParamsSchema = z.object({ connectionId: uuidSchema }).strict();
/** Path params of the public Home Assistant webhook. */
export type HaWebhookParams = z.infer<typeof haWebhookParamsSchema>;
