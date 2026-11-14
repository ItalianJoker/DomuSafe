import {
  calendarDateInTimeZone,
  decodeCursor,
  decide,
  encodeCursor,
  endOfWeek,
  MEMBER_ROLES,
  type CreatePushSubscriptionRequest,
  type MemberRole,
  type Me,
  type Notification,
  type NotificationPreference,
  type NotificationPreferenceList,
  type PushPayload,
  type PushSubscription,
  type UpdateNotificationPreferencesRequest,
} from '@domusafe/contracts';
import { fromBase64Url, toBase64Url } from '@domusafe/crypto';
import { recordAudit, withContext, type Database } from '@domusafe/db';
import { ProblemError } from '../../http/problem.js';
import type { AuthenticatedAccount } from '../../types.js';
import type { TenancyService } from '../tenancy/service.js';
import type { PushSender } from './push.js';
import * as repo from './repository.js';

const accountPrincipal = (accountId: string): { kind: 'account'; accountId: string } => ({
  kind: 'account',
  accountId,
});

const systemPrincipal = { kind: 'system' as const };

/** One page of notifications. */
export interface NotificationPage {
  readonly items: Notification[];
  readonly nextCursor: string | null;
}

/** Summary of one deadline push cycle. */
export interface DeadlinePushSummary {
  readonly families: number;
  readonly notifications: number;
  readonly pushAttempts: number;
  readonly pushDelivered: number;
}

/**
 * Notifications, browser push subscriptions, preferences and the deadline push job.
 *
 * Preconditions: VAPID keys are configured when push delivery is required.
 * Postconditions: push payloads stay free of vault material, PIN and recovery phrases.
 * Data contract: preference default is opt-in (`push: false` until the account enables it).
 *
 * @param db - Database bound to the `domusafe_app` pool.
 * @param tenancy - Family membership checks.
 * @param options - VAPID public key and optional push sender.
 * @param now - Clock, injectable for tests.
 * @returns The service.
 */
export function createNotificationsService(
  db: Database,
  tenancy: TenancyService,
  options: {
    readonly vapidPublicKey: string | null;
    readonly pushSender: PushSender | null;
  },
  now: () => Date = () => new Date(),
) {
  return {
    /** Public VAPID key exposed on `GET /me`, or null when push is not configured. */
    vapidPublicKey: options.vapidPublicKey,

    /**
     * Registers or refreshes a browser push subscription for the account.
     *
     * @param caller - Authenticated account.
     * @param body - Endpoint and client keys.
     * @returns The stored subscription (without key material).
     */
    async createPushSubscription(
      caller: AuthenticatedAccount,
      body: CreatePushSubscriptionRequest,
    ): Promise<PushSubscription> {
      if (options.vapidPublicKey === null) {
        throw new ProblemError('upstream_unavailable', {
          detail: 'Browser push is not configured on this server',
        });
      }
      const p256dh = fromBase64Url(body.p256dh);
      const auth = fromBase64Url(body.auth);
      if (p256dh.byteLength < 16 || auth.byteLength < 8) {
        throw new ProblemError('validation_failed', {
          errors: [{ path: 'body', code: 'invalid_keys', message: 'Push keys are too short' }],
        });
      }
      const row = await withContext(db, { principal: accountPrincipal(caller.id) }, async (tx) => {
        const saved = await repo.upsertPushSubscription(tx, {
          accountId: caller.id,
          endpoint: body.endpoint,
          p256dh,
          auth,
          deviceId: body.deviceId ?? null,
        });
        await recordAudit(tx, {
          familyId: null,
          actor: { kind: 'account', id: caller.id },
          action: 'notifications.push_subscription.upserted',
          outcome: 'success',
          resourceType: 'push_subscriptions',
          resourceId: saved.id,
        });
        return saved;
      });
      return viewSubscription(row);
    },

    /**
     * Disables a push subscription owned by the account.
     *
     * @param caller - Authenticated account.
     * @param subscriptionId - Row id.
     */
    async deletePushSubscription(caller: AuthenticatedAccount, subscriptionId: string): Promise<void> {
      await withContext(db, { principal: accountPrincipal(caller.id) }, async (tx) => {
        const existing = await repo.findPushSubscription(tx, caller.id, subscriptionId);
        if (existing === null) {
          throw new ProblemError('not_found');
        }
        if (existing.disabledAt === null) {
          await repo.disablePushSubscription(tx, subscriptionId, now());
        }
        await recordAudit(tx, {
          familyId: null,
          actor: { kind: 'account', id: caller.id },
          action: 'notifications.push_subscription.disabled',
          outcome: 'success',
          resourceType: 'push_subscriptions',
          resourceId: subscriptionId,
        });
      });
    },

    /**
     * Lists notification preferences of the account.
     *
     * @param caller - Authenticated account.
     * @returns Preference rows (empty categories mean defaults: in-app on, push off).
     */
    async listPreferences(caller: AuthenticatedAccount): Promise<NotificationPreferenceList> {
      const rows = await withContext(db, { principal: accountPrincipal(caller.id) }, (tx) =>
        repo.listPreferences(tx, caller.id),
      );
      return { items: rows.map(viewPreference) };
    },

    /**
     * Replaces preference rows for the families the account belongs to.
     *
     * @param caller - Authenticated account.
     * @param body - Preference items.
     * @returns The updated list.
     */
    async updatePreferences(
      caller: AuthenticatedAccount,
      body: UpdateNotificationPreferencesRequest,
    ): Promise<NotificationPreferenceList> {
      for (const item of body.items) {
        if ((await tenancy.resolveTenant(caller.id, item.familyId)) === null) {
          throw new ProblemError('validation_failed', {
            errors: [
              {
                path: 'body.items.familyId',
                code: 'not_accessible',
                message: 'Family not accessible',
              },
            ],
          });
        }
      }
      await withContext(db, { principal: accountPrincipal(caller.id) }, async (tx) => {
        for (const item of body.items) {
          await repo.upsertPreference(tx, {
            accountId: caller.id,
            familyId: item.familyId,
            category: item.category,
            inApp: item.inApp,
            push: item.push,
            email: item.email,
            quietStart: quietDb(item.quietStart),
            quietEnd: quietDb(item.quietEnd),
          });
        }
        await recordAudit(tx, {
          familyId: null,
          actor: { kind: 'account', id: caller.id },
          action: 'notifications.preferences.updated',
          outcome: 'success',
        });
      });
      return this.listPreferences(caller);
    },

    /**
     * Lists notifications of the account.
     *
     * @param caller - Authenticated account.
     * @param query - Unread filter and cursor.
     * @returns A page of notifications.
     */
    async listNotifications(
      caller: AuthenticatedAccount,
      query: { readonly unreadOnly: boolean; readonly limit: number; readonly cursor?: string },
    ): Promise<NotificationPage> {
      let afterCreatedAt: Date | undefined;
      let afterId: string | undefined;
      if (query.cursor !== undefined) {
        const position = decodeCursor(query.cursor);
        if (position === null || typeof position[0] !== 'string') {
          throw new ProblemError('cursor_invalid');
        }
        afterCreatedAt = new Date(position[0]);
        afterId = position[1];
        if (Number.isNaN(afterCreatedAt.getTime())) {
          throw new ProblemError('cursor_invalid');
        }
      }
      const rows = await withContext(db, { principal: accountPrincipal(caller.id) }, (tx) =>
        repo.listNotifications(tx, caller.id, {
          unreadOnly: query.unreadOnly,
          limit: query.limit,
          ...(afterCreatedAt === undefined || afterId === undefined ? {} : { afterCreatedAt, afterId }),
        }),
      );
      const hasMore = rows.length > query.limit;
      const slice = hasMore ? rows.slice(0, query.limit) : rows;
      const last = slice.at(-1);
      return {
        items: slice.map(viewNotification),
        nextCursor:
          hasMore && last !== undefined ? encodeCursor([last.createdAt.toISOString(), last.id]) : null,
      };
    },

    /**
     * Marks one notification as read.
     *
     * @param caller - Authenticated account.
     * @param notificationId - Row id.
     */
    async markRead(caller: AuthenticatedAccount, notificationId: string): Promise<void> {
      await withContext(db, { principal: accountPrincipal(caller.id) }, async (tx) => {
        const existing = await repo.findNotification(tx, caller.id, notificationId);
        if (existing === null) {
          throw new ProblemError('not_found');
        }
        if (existing.readAt === null) {
          await repo.markNotificationRead(tx, caller.id, notificationId, now());
        }
      });
    },

    /**
     * Marks every unread notification as read.
     *
     * @param caller - Authenticated account.
     */
    async markAllRead(caller: AuthenticatedAccount): Promise<void> {
      await withContext(db, { principal: accountPrincipal(caller.id) }, (tx) =>
        repo.markAllNotificationsRead(tx, caller.id, now()),
      );
    },

    /**
     * Scans families for overdue and this-week maintenance deadlines and delivers browser push
     * to members who opted in.
     *
     * Preconditions: when `pushSender` is null, notifications are still created but not pushed.
     * Postconditions: at most one notification per account, family and task per calendar day.
     * Data contract: push body names the task title only — no house address or vault data.
     *
     * @returns Counters for logging and tests.
     */
    async processDeadlineAlerts(): Promise<DeadlinePushSummary> {
      const families = await withContext(db, { principal: systemPrincipal }, (tx) =>
        repo.listFamiliesForDeadlinePush(tx),
      );
      let notificationCount = 0;
      let pushAttempts = 0;
      let pushDelivered = 0;
      const instant = now();

      for (const family of families) {
        const today = calendarDateInTimeZone(instant, family.timezone);
        const until = endOfWeek(today);
        const { dayStart, dayEnd } = calendarDayBounds(today, family.timezone);

        const work = await withContext(
          db,
          { principal: systemPrincipal, familyId: family.familyId },
          async (tx) => {
            const tasks = await repo.listOpenMaintenanceUntil(tx, family.familyId, until);
            if (tasks.length === 0) {
              return [] as const;
            }
            const members = await repo.listDeadlineMembers(tx, family.familyId);
            const created: {
              accountId: string;
              notificationId: string;
              locale: 'it' | 'en';
              payload: PushPayload;
            }[] = [];
            for (const member of members) {
              const role = asMemberRole(member.role);
              if (role === null) {
                continue;
              }
              if (!decide({ role, isOwner: false, vaultFamilyConcession: false }, 'deadlines.read').allowed) {
                continue;
              }
              if (!(await repo.isDeadlinePushEnabled(tx, member.accountId, family.familyId))) {
                continue;
              }
              for (const task of tasks) {
                const overdue = task.dueDate < today;
                const copy = deadlineCopy(overdue, task.title, 'it');
                const row = await repo.insertNotificationIfNew(
                  tx,
                  {
                    accountId: member.accountId,
                    familyId: family.familyId,
                    category: 'deadline',
                    title: copy.title,
                    body: copy.body,
                    link: '/',
                    resourceType: 'maintenance_tasks',
                    resourceId: task.id,
                  },
                  dayStart,
                  dayEnd,
                );
                if (row === null) {
                  continue;
                }
                created.push({
                  accountId: member.accountId,
                  notificationId: row.id,
                  locale: 'it',
                  payload: { title: copy.title, body: copy.body, url: '/' },
                });
              }
            }
            return created;
          },
        );

        notificationCount += work.length;

        for (const item of work) {
          if (options.pushSender === null) {
            continue;
          }
          const subscriptions = await withContext(db, { principal: systemPrincipal }, (tx) =>
            repo.listActivePushSubscriptions(tx, item.accountId),
          );
          let anyDelivered = false;
          for (const subscription of subscriptions) {
            pushAttempts += 1;
            const result = await options.pushSender.send(
              {
                endpoint: subscription.endpoint,
                p256dh: toBase64Url(subscription.p256dh),
                auth: toBase64Url(subscription.auth),
              },
              item.payload,
            );
            await withContext(db, { principal: systemPrincipal }, async (tx) => {
              if (result.ok) {
                await repo.markPushSuccess(tx, subscription.id, instant);
              } else {
                await repo.markPushFailure(tx, subscription.id, instant, result.gone);
              }
            });
            if (result.ok) {
              anyDelivered = true;
              pushDelivered += 1;
            }
          }
          if (anyDelivered) {
            await withContext(db, { principal: systemPrincipal }, (tx) =>
              repo.markNotificationPushed(tx, item.notificationId, instant),
            );
          }
        }
      }

      return {
        families: families.length,
        notifications: notificationCount,
        pushAttempts,
        pushDelivered,
      };
    },
  };
}

/** Notifications service. */
export type NotificationsService = ReturnType<typeof createNotificationsService>;

/**
 * Merges the VAPID public key into a `GET /me` payload.
 *
 * @param me - Profile without the key.
 * @param vapidPublicKey - Public key or null.
 * @returns Full `Me` response.
 */
export function withVapidPublicKey(me: Omit<Me, 'vapidPublicKey'>, vapidPublicKey: string | null): Me {
  return { ...me, vapidPublicKey };
}

function viewSubscription(row: repo.PushSubscriptionRow): PushSubscription {
  return {
    id: row.id,
    endpoint: row.endpoint,
    deviceId: row.deviceId,
    createdAt: row.createdAt.toISOString(),
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    disabledAt: row.disabledAt?.toISOString() ?? null,
  };
}

function viewPreference(row: repo.PreferenceRow): NotificationPreference {
  return {
    familyId: row.familyId,
    category: row.category,
    inApp: row.inApp,
    push: row.push,
    email: row.email,
    quietStart: quietApi(row.quietStart),
    quietEnd: quietApi(row.quietEnd),
  };
}

function viewNotification(row: repo.NotificationRow): Notification {
  return {
    id: row.id,
    familyId: row.familyId,
    category: row.category,
    title: row.title,
    body: row.body,
    link: row.link,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    pushSentAt: row.pushSentAt?.toISOString() ?? null,
  };
}

function quietDb(value: string | null | undefined): string | null {
  return value === undefined ? null : value;
}

function quietApi(value: string | null): string | null {
  return value;
}

function deadlineCopy(
  overdue: boolean,
  taskTitle: string,
  locale: 'it' | 'en',
): { title: string; body: string } {
  if (locale === 'en') {
    return overdue
      ? { title: 'Overdue deadline', body: taskTitle.slice(0, 1000) }
      : { title: 'Deadline this week', body: taskTitle.slice(0, 1000) };
  }
  return overdue
    ? { title: 'Scadenza in ritardo', body: taskTitle.slice(0, 1000) }
    : { title: 'Scadenza di questa settimana', body: taskTitle.slice(0, 1000) };
}

/**
 * UTC bounds that cover one calendar day in a time zone (approximate via noon anchoring).
 *
 * @param today - `YYYY-MM-DD` in the family zone.
 * @param timeZone - IANA zone.
 * @returns Inclusive start and exclusive end instants.
 */
function calendarDayBounds(today: string, timeZone: string): { dayStart: Date; dayEnd: Date } {
  const noon = wallTimeToUtc(`${today}T12:00:00`, timeZone);
  const dayStart = new Date(noon.getTime() - 12 * 60 * 60 * 1000);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart, dayEnd };
}

function wallTimeToUtc(localIso: string, timeZone: string): Date {
  const probe = new Date(`${localIso}Z`);
  const asLocal = calendarDateInTimeZone(probe, timeZone);
  const expected = localIso.slice(0, 10);
  const diffDays = expected === asLocal ? 0 : expected > asLocal ? 1 : -1;
  return new Date(probe.getTime() + diffDays * 24 * 60 * 60 * 1000);
}

function asMemberRole(value: string): MemberRole | null {
  return (MEMBER_ROLES as readonly string[]).includes(value) ? (value as MemberRole) : null;
}
