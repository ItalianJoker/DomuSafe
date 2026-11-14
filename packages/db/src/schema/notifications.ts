import { sql } from 'drizzle-orm';
import { boolean, pgTable, primaryKey, smallint, text, unique, uuid } from 'drizzle-orm/pg-core';
import { bytea, instant } from '../columns.js';

/** Categories of in-app and push notifications (phase 2 §6.9). */
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

/** One category of notification. */
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** In-app notification row (class C, RLS model A + system). */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    accountId: uuid('account_id').notNull(),
    familyId: uuid('family_id').notNull(),
    category: text('category', { enum: NOTIFICATION_CATEGORIES }).notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    resourceType: text('resource_type'),
    resourceId: uuid('resource_id'),
    createdAt: instant('created_at').notNull().defaultNow(),
    readAt: instant('read_at'),
    pushSentAt: instant('push_sent_at'),
  },
  (table) => [unique().on(table.familyId, table.id)],
);

/** Browser push subscription for one account (class C, RLS model A + system). */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  accountId: uuid('account_id').notNull(),
  deviceId: uuid('device_id'),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: bytea('p256dh').notNull(),
  auth: bytea('auth').notNull(),
  createdAt: instant('created_at').notNull().defaultNow(),
  lastSuccessAt: instant('last_success_at'),
  failureCount: smallint('failure_count').notNull().default(0),
  disabledAt: instant('disabled_at'),
});

/** Per-family, per-category notification channel preferences (class C). */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    accountId: uuid('account_id').notNull(),
    familyId: uuid('family_id').notNull(),
    category: text('category', { enum: NOTIFICATION_CATEGORIES }).notNull(),
    inApp: boolean('in_app').notNull().default(true),
    push: boolean('push').notNull().default(false),
    email: boolean('email').notNull().default(false),
    quietStart: text('quiet_start'),
    quietEnd: text('quiet_end'),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.familyId, table.category] }),
    unique().on(table.familyId, table.accountId, table.category),
  ],
);
