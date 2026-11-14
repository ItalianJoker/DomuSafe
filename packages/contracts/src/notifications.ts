import { z } from 'zod';
import { base64UrlSchema, instantSchema, pageSchema, uuidSchema } from './common.js';

/** Categories of in-app and browser notifications. */
export const NOTIFICATION_CATEGORIES = [
  'deadline',
  'vault_reminder',
  'emergency_scan',
  'sos',
  'chore',
  'approval',
  'security',
  'system',
] as const;

/** One notification category. */
export const notificationCategorySchema = z
  .enum(NOTIFICATION_CATEGORIES)
  .meta({ id: 'NotificationCategory' });
/** One notification category. */
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;

/** An in-app notification. */
export const notificationSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    category: notificationCategorySchema,
    title: z.string().min(1).max(140),
    body: z.string().min(1).max(1000),
    link: z.string().min(1).max(500).nullable(),
    resourceType: z.string().min(1).max(80).nullable(),
    resourceId: uuidSchema.nullable(),
    createdAt: instantSchema,
    readAt: instantSchema.nullable(),
    pushSentAt: instantSchema.nullable(),
  })
  .strict()
  .meta({ id: 'Notification' });
/** An in-app notification. */
export type Notification = z.infer<typeof notificationSchema>;

/** Page of notifications. */
export const notificationPageSchema = pageSchema(notificationSchema).meta({ id: 'NotificationPage' });
/** Page of notifications. */
export type NotificationPage = z.infer<typeof notificationPageSchema>;

/** Query of `GET /me/notifications`. */
export const notificationListQuerySchema = z
  .object({
    unreadOnly: z.coerce.boolean().default(false),
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

/** Path of a single notification. */
export const notificationParamsSchema = z.object({ notificationId: uuidSchema }).strict();

/** A stored browser push subscription (without the secret key material). */
export const pushSubscriptionSchema = z
  .object({
    id: uuidSchema,
    endpoint: z.url().max(2048),
    deviceId: uuidSchema.nullable(),
    createdAt: instantSchema,
    lastSuccessAt: instantSchema.nullable(),
    disabledAt: instantSchema.nullable(),
  })
  .strict()
  .meta({ id: 'PushSubscription' });
/** A stored browser push subscription. */
export type PushSubscription = z.infer<typeof pushSubscriptionSchema>;

/** Body of `POST /me/push-subscriptions`. */
export const createPushSubscriptionRequestSchema = z
  .object({
    endpoint: z.url().max(2048),
    p256dh: base64UrlSchema,
    auth: base64UrlSchema,
    deviceId: uuidSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreatePushSubscriptionRequest' });
/** Body of `POST /me/push-subscriptions`. */
export type CreatePushSubscriptionRequest = z.infer<typeof createPushSubscriptionRequestSchema>;

/** Path of a push subscription. */
export const pushSubscriptionParamsSchema = z.object({ subscriptionId: uuidSchema }).strict();

/** Quiet hours as `HH:MM` in the family time zone, or null when unset. */
const quietTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM')
  .nullable();

/** One preference row for a family and category. */
export const notificationPreferenceSchema = z
  .object({
    familyId: uuidSchema,
    category: notificationCategorySchema,
    inApp: z.boolean(),
    push: z.boolean(),
    email: z.boolean(),
    quietStart: quietTimeSchema,
    quietEnd: quietTimeSchema,
  })
  .strict()
  .meta({ id: 'NotificationPreference' });
/** One preference row. */
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;

/** Response of `GET /me/notification-preferences`. */
export const notificationPreferenceListSchema = z
  .object({ items: z.array(notificationPreferenceSchema).max(200) })
  .strict()
  .meta({ id: 'NotificationPreferenceList' });
/** Response of `GET /me/notification-preferences`. */
export type NotificationPreferenceList = z.infer<typeof notificationPreferenceListSchema>;

/** Body of `PUT /me/notification-preferences`. */
export const updateNotificationPreferencesRequestSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            familyId: uuidSchema,
            category: notificationCategorySchema,
            inApp: z.boolean(),
            push: z.boolean(),
            email: z.boolean(),
            quietStart: quietTimeSchema.optional(),
            quietEnd: quietTimeSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (value) =>
      value.items.every(
        (item) =>
          (item.quietStart === undefined && item.quietEnd === undefined) ||
          (item.quietStart !== undefined && item.quietEnd !== undefined),
      ),
    'Quiet start and end must be set together',
  )
  .meta({ id: 'UpdateNotificationPreferencesRequest' });
/** Body of `PUT /me/notification-preferences`. */
export type UpdateNotificationPreferencesRequest = z.infer<typeof updateNotificationPreferencesRequestSchema>;

/** Minimal payload delivered to the service worker (no sensitive fields). */
export const pushPayloadSchema = z
  .object({
    title: z.string().min(1).max(140),
    body: z.string().min(1).max(1000),
    url: z.string().min(1).max(500),
  })
  .strict()
  .meta({ id: 'PushPayload' });
/** Minimal push payload. */
export type PushPayload = z.infer<typeof pushPayloadSchema>;
