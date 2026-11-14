import {
  houses,
  maintenanceTasks,
  memberships,
  notificationPreferences,
  notifications,
  pushSubscriptions,
  type NotificationCategory,
  type Transaction,
} from '@domusafe/db';
import { and, asc, desc, eq, gte, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';

/** Stored push subscription row. */
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
/** Stored notification row. */
export type NotificationRow = typeof notifications.$inferSelect;
/** Stored preference row. */
export type PreferenceRow = typeof notificationPreferences.$inferSelect;

/**
 * Lists active families for the deadline push worker.
 *
 * Preconditions: the transaction uses the system principal.
 * Postconditions: trashed families are omitted.
 *
 * @param tx - System transaction.
 * @returns Family id and IANA time zone.
 */
export async function listFamiliesForDeadlinePush(
  tx: Transaction,
): Promise<readonly { familyId: string; timezone: string }[]> {
  const result = await tx.execute<{ family_id: string; timezone: string }>(
    sql`select family_id, timezone from app.families_for_deadline_push()`,
  );
  return result.rows.map((row) => ({ familyId: row.family_id, timezone: row.timezone }));
}

/**
 * Lists active non-guest members of a family.
 *
 * @param tx - Transaction with family context (system).
 * @param familyId - Family id.
 * @returns Account ids and roles.
 */
export async function listDeadlineMembers(
  tx: Transaction,
  familyId: string,
): Promise<readonly { accountId: string; role: string }[]> {
  return tx
    .select({ accountId: memberships.accountId, role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.familyId, familyId),
        eq(memberships.status, 'active'),
        sql`(${memberships.expiresAt} is null or ${memberships.expiresAt} > now())`,
        sql`${memberships.role} is distinct from 'guest'`,
      ),
    );
}

/**
 * Lists open maintenance tasks with a due date on or before `until` for every house of the family.
 *
 * @param tx - Family transaction.
 * @param familyId - Family id.
 * @param until - Inclusive calendar date (family time zone).
 * @returns Tasks that still need attention.
 */
export async function listOpenMaintenanceUntil(
  tx: Transaction,
  familyId: string,
  until: string,
): Promise<readonly { id: string; houseId: string; title: string; dueDate: string }[]> {
  const rows = await tx
    .select({
      id: maintenanceTasks.id,
      houseId: maintenanceTasks.houseId,
      title: maintenanceTasks.title,
      dueDate: maintenanceTasks.nextDueDate,
    })
    .from(maintenanceTasks)
    .innerJoin(
      houses,
      and(eq(houses.id, maintenanceTasks.houseId), eq(houses.familyId, maintenanceTasks.familyId)),
    )
    .where(
      and(
        eq(maintenanceTasks.familyId, familyId),
        isNull(maintenanceTasks.deletedAt),
        isNull(houses.deletedAt),
        eq(maintenanceTasks.active, true),
        isNotNull(maintenanceTasks.nextDueDate),
        lte(maintenanceTasks.nextDueDate, until),
        or(
          isNull(maintenanceTasks.lastDoneOn),
          lt(maintenanceTasks.lastDoneOn, maintenanceTasks.nextDueDate),
        ),
      ),
    )
    .orderBy(asc(maintenanceTasks.nextDueDate))
    .limit(500);
  return rows.flatMap((row) =>
    row.dueDate === null
      ? []
      : [{ id: row.id, houseId: row.houseId, title: row.title, dueDate: row.dueDate }],
  );
}

/**
 * Upserts a push subscription by endpoint (re-subscribe on the same browser).
 *
 * @param tx - Account transaction.
 * @param input - Subscription material.
 * @returns The stored row.
 */
export async function upsertPushSubscription(
  tx: Transaction,
  input: {
    readonly accountId: string;
    readonly endpoint: string;
    readonly p256dh: Uint8Array<ArrayBuffer>;
    readonly auth: Uint8Array<ArrayBuffer>;
    readonly deviceId: string | null;
  },
): Promise<PushSubscriptionRow> {
  const [row] = await tx
    .insert(pushSubscriptions)
    .values({
      accountId: input.accountId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      deviceId: input.deviceId,
      failureCount: 0,
      disabledAt: null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        accountId: input.accountId,
        p256dh: input.p256dh,
        auth: input.auth,
        deviceId: input.deviceId,
        failureCount: 0,
        disabledAt: null,
      },
    })
    .returning();
  if (row === undefined) {
    throw new Error('Push subscription upsert returned no row');
  }
  return row;
}

/**
 * Finds a push subscription owned by the account.
 *
 * @param tx - Account transaction.
 * @param accountId - Owner.
 * @param subscriptionId - Row id.
 * @returns The row, or null.
 */
export async function findPushSubscription(
  tx: Transaction,
  accountId: string,
  subscriptionId: string,
): Promise<PushSubscriptionRow | null> {
  const [row] = await tx
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.id, subscriptionId), eq(pushSubscriptions.accountId, accountId)));
  return row ?? null;
}

/**
 * Soft-disables a subscription (unsubscribe or gone endpoint).
 *
 * @param tx - Transaction.
 * @param subscriptionId - Row id.
 * @param at - Instant of disable.
 */
export async function disablePushSubscription(
  tx: Transaction,
  subscriptionId: string,
  at: Date,
): Promise<void> {
  await tx.update(pushSubscriptions).set({ disabledAt: at }).where(eq(pushSubscriptions.id, subscriptionId));
}

/**
 * Lists active push subscriptions of one account.
 *
 * @param tx - Transaction.
 * @param accountId - Owner.
 * @returns Active rows.
 */
export async function listActivePushSubscriptions(
  tx: Transaction,
  accountId: string,
): Promise<readonly PushSubscriptionRow[]> {
  return tx
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.accountId, accountId), isNull(pushSubscriptions.disabledAt)));
}

/**
 * Records a successful push delivery.
 *
 * @param tx - Transaction.
 * @param subscriptionId - Row id.
 * @param at - Instant.
 */
export async function markPushSuccess(tx: Transaction, subscriptionId: string, at: Date): Promise<void> {
  await tx
    .update(pushSubscriptions)
    .set({ lastSuccessAt: at, failureCount: 0 })
    .where(eq(pushSubscriptions.id, subscriptionId));
}

/**
 * Records a failed push delivery and disables after repeated failures.
 *
 * @param tx - Transaction.
 * @param subscriptionId - Row id.
 * @param at - Instant.
 * @param gone - Whether the push service reported the endpoint as gone.
 */
export async function markPushFailure(
  tx: Transaction,
  subscriptionId: string,
  at: Date,
  gone: boolean,
): Promise<void> {
  if (gone) {
    await disablePushSubscription(tx, subscriptionId, at);
    return;
  }
  await tx
    .update(pushSubscriptions)
    .set({
      failureCount: sql`${pushSubscriptions.failureCount} + 1`,
      disabledAt: sql`case when ${pushSubscriptions.failureCount} + 1 >= 20 then ${at} else ${pushSubscriptions.disabledAt} end`,
    })
    .where(eq(pushSubscriptions.id, subscriptionId));
}

/**
 * Lists preference rows of the account.
 *
 * @param tx - Account transaction.
 * @param accountId - Owner.
 * @returns Preference rows.
 */
export async function listPreferences(tx: Transaction, accountId: string): Promise<readonly PreferenceRow[]> {
  return tx
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.accountId, accountId))
    .orderBy(asc(notificationPreferences.familyId), asc(notificationPreferences.category));
}

/**
 * Upserts one preference row.
 *
 * @param tx - Account transaction.
 * @param input - Preference values.
 * @returns The stored row.
 */
export async function upsertPreference(
  tx: Transaction,
  input: {
    readonly accountId: string;
    readonly familyId: string;
    readonly category: NotificationCategory;
    readonly inApp: boolean;
    readonly push: boolean;
    readonly email: boolean;
    readonly quietStart: string | null;
    readonly quietEnd: string | null;
  },
): Promise<PreferenceRow> {
  const [row] = await tx
    .insert(notificationPreferences)
    .values({
      accountId: input.accountId,
      familyId: input.familyId,
      category: input.category,
      inApp: input.inApp,
      push: input.push,
      email: input.email,
      quietStart: input.quietStart,
      quietEnd: input.quietEnd,
    })
    .onConflictDoUpdate({
      target: [
        notificationPreferences.accountId,
        notificationPreferences.familyId,
        notificationPreferences.category,
      ],
      set: {
        inApp: input.inApp,
        push: input.push,
        email: input.email,
        quietStart: input.quietStart,
        quietEnd: input.quietEnd,
      },
    })
    .returning();
  if (row === undefined) {
    throw new Error('Preference upsert returned no row');
  }
  return row;
}

/**
 * Loads the deadline preference row for one account in a family, if any.
 *
 * @param tx - Transaction.
 * @param accountId - Account.
 * @param familyId - Family.
 * @returns Preference flags, or null when the row is missing.
 */
export async function findDeadlinePreference(
  tx: Transaction,
  accountId: string,
  familyId: string,
): Promise<{ readonly inApp: boolean; readonly push: boolean } | null> {
  const [row] = await tx
    .select({
      inApp: notificationPreferences.inApp,
      push: notificationPreferences.push,
    })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.accountId, accountId),
        eq(notificationPreferences.familyId, familyId),
        eq(notificationPreferences.category, 'deadline'),
      ),
    );
  return row ?? null;
}

/**
 * Whether the in-app inbox should receive deadline alerts for one account in a family.
 *
 * @param tx - Transaction.
 * @param accountId - Account.
 * @param familyId - Family.
 * @returns True when no preference row exists (default) or `in_app` is on.
 */
export async function isDeadlineInAppEnabled(
  tx: Transaction,
  accountId: string,
  familyId: string,
): Promise<boolean> {
  const row = await findDeadlinePreference(tx, accountId, familyId);
  return row === null || row.inApp;
}

/**
 * Whether push is enabled for deadline alerts for one account in a family.
 *
 * @param tx - Transaction.
 * @param accountId - Account.
 * @param familyId - Family.
 * @returns True when the preference row exists and push is on.
 */
export async function isDeadlinePushEnabled(
  tx: Transaction,
  accountId: string,
  familyId: string,
): Promise<boolean> {
  const row = await findDeadlinePreference(tx, accountId, familyId);
  return row?.push === true;
}

/**
 * Inserts a notification when no matching one exists for the same resource on the same calendar day.
 *
 * @param tx - Transaction.
 * @param input - Notification fields.
 * @param dayStart - Start of the family calendar day (UTC instant).
 * @param dayEnd - Exclusive end of that day.
 * @returns The row, or null when a duplicate already exists.
 */
export async function insertNotificationIfNew(
  tx: Transaction,
  input: {
    readonly accountId: string;
    readonly familyId: string;
    readonly category: NotificationCategory;
    readonly title: string;
    readonly body: string;
    readonly link: string | null;
    readonly resourceType: string;
    readonly resourceId: string;
  },
  dayStart: Date,
  dayEnd: Date,
): Promise<NotificationRow | null> {
  const [existing] = await tx
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.accountId, input.accountId),
        eq(notifications.familyId, input.familyId),
        eq(notifications.category, input.category),
        eq(notifications.resourceType, input.resourceType),
        eq(notifications.resourceId, input.resourceId),
        gte(notifications.createdAt, dayStart),
        lt(notifications.createdAt, dayEnd),
      ),
    )
    .limit(1);
  if (existing !== undefined) {
    return null;
  }
  const [row] = await tx
    .insert(notifications)
    .values({
      accountId: input.accountId,
      familyId: input.familyId,
      category: input.category,
      title: input.title,
      body: input.body,
      link: input.link,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Notification insert returned no row');
  }
  return row;
}

/**
 * Marks a notification as push-delivered.
 *
 * @param tx - Transaction.
 * @param notificationId - Row id.
 * @param at - Instant.
 */
export async function markNotificationPushed(
  tx: Transaction,
  notificationId: string,
  at: Date,
): Promise<void> {
  await tx.update(notifications).set({ pushSentAt: at }).where(eq(notifications.id, notificationId));
}

/**
 * Lists notifications of the account, newest first.
 *
 * @param tx - Account transaction.
 * @param accountId - Owner.
 * @param options - Unread filter and pagination.
 * @returns At most `limit + 1` rows for cursor pagination.
 */
export async function listNotifications(
  tx: Transaction,
  accountId: string,
  options: {
    readonly unreadOnly: boolean;
    readonly limit: number;
    readonly afterCreatedAt?: Date;
    readonly afterId?: string;
  },
): Promise<readonly NotificationRow[]> {
  const filters = [eq(notifications.accountId, accountId)];
  if (options.unreadOnly) {
    filters.push(isNull(notifications.readAt));
  }
  if (options.afterCreatedAt !== undefined && options.afterId !== undefined) {
    filters.push(
      sql`(${notifications.createdAt}, ${notifications.id}) < (${options.afterCreatedAt}, ${options.afterId}::uuid)`,
    );
  }
  return tx
    .select()
    .from(notifications)
    .where(and(...filters))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(options.limit + 1);
}

/**
 * Finds one notification owned by the account.
 *
 * @param tx - Account transaction.
 * @param accountId - Owner.
 * @param notificationId - Row id.
 * @returns The row, or null.
 */
export async function findNotification(
  tx: Transaction,
  accountId: string,
  notificationId: string,
): Promise<NotificationRow | null> {
  const [row] = await tx
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.accountId, accountId)));
  return row ?? null;
}

/**
 * Marks one notification as read.
 *
 * @param tx - Account transaction.
 * @param accountId - Owner.
 * @param notificationId - Row id.
 * @param at - Instant.
 * @returns True when a row was updated.
 */
export async function markNotificationRead(
  tx: Transaction,
  accountId: string,
  notificationId: string,
  at: Date,
): Promise<boolean> {
  const updated = await tx
    .update(notifications)
    .set({ readAt: at })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.accountId, accountId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  return updated.length > 0;
}

/**
 * Marks every unread notification of the account as read.
 *
 * @param tx - Account transaction.
 * @param accountId - Owner.
 * @param at - Instant.
 * @returns How many rows were updated.
 */
export async function markAllNotificationsRead(
  tx: Transaction,
  accountId: string,
  at: Date,
): Promise<number> {
  const updated = await tx
    .update(notifications)
    .set({ readAt: at })
    .where(and(eq(notifications.accountId, accountId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}
