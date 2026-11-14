import {
  createPushSubscriptionRequestSchema,
  notificationListQuerySchema,
  notificationPageSchema,
  notificationParamsSchema,
  notificationPreferenceListSchema,
  pushSubscriptionParamsSchema,
  pushSubscriptionSchema,
  updateNotificationPreferencesRequestSchema,
} from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { AuthenticatedAccount } from '../../types.js';
import type { NotificationsService } from './service.js';

function caller(request: { account: AuthenticatedAccount | null }): AuthenticatedAccount {
  if (request.account === null) {
    throw new ProblemError('unauthenticated');
  }
  return request.account;
}

/**
 * Account notification routes: inbox, preferences and browser push subscriptions (phase 3 §5.2).
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Notifications service.
 */
export const notificationRoutes: FastifyPluginAsyncZod<{ notifications: NotificationsService }> = async (
  app,
  { notifications },
) => {
  app.get(
    '/api/v1/me/notifications',
    {
      config: { access: 'account' },
      schema: {
        tags: ['notifications'],
        operationId: 'notifications.list',
        summary: 'In-app notifications of the current account',
        querystring: notificationListQuerySchema,
        response: { 200: notificationPageSchema, ...problemResponses(400, 401) },
      },
    },
    async (request) =>
      notifications.listNotifications(caller(request), {
        unreadOnly: request.query.unreadOnly,
        limit: request.query.limit,
        ...(request.query.cursor === undefined ? {} : { cursor: request.query.cursor }),
      }),
  );

  app.post(
    '/api/v1/me/notifications/:notificationId/read',
    {
      config: { access: 'account' },
      schema: {
        tags: ['notifications'],
        operationId: 'notifications.markRead',
        summary: 'Mark one notification as read',
        params: notificationParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 404) },
      },
    },
    async (request, reply) => {
      await notifications.markRead(caller(request), request.params.notificationId);
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/api/v1/me/notifications/read-all',
    {
      config: { access: 'account' },
      schema: {
        tags: ['notifications'],
        operationId: 'notifications.markAllRead',
        summary: 'Mark every notification as read',
        response: { 204: z.null(), ...problemResponses(401) },
      },
    },
    async (request, reply) => {
      await notifications.markAllRead(caller(request));
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/api/v1/me/notification-preferences',
    {
      config: { access: 'account' },
      schema: {
        tags: ['notifications'],
        operationId: 'notifications.listPreferences',
        summary: 'Notification channel preferences',
        response: { 200: notificationPreferenceListSchema, ...problemResponses(401) },
      },
    },
    async (request) => notifications.listPreferences(caller(request)),
  );

  app.put(
    '/api/v1/me/notification-preferences',
    {
      config: { access: 'account' },
      schema: {
        tags: ['notifications'],
        operationId: 'notifications.updatePreferences',
        summary: 'Replace notification channel preferences',
        body: updateNotificationPreferencesRequestSchema,
        response: { 200: notificationPreferenceListSchema, ...problemResponses(400, 401, 403) },
      },
    },
    async (request) => notifications.updatePreferences(caller(request), request.body),
  );

  app.post(
    '/api/v1/me/push-subscriptions',
    {
      config: { access: 'account', idempotent: true },
      schema: {
        tags: ['notifications'],
        operationId: 'notifications.createPushSubscription',
        summary: 'Register a browser push subscription',
        body: createPushSubscriptionRequestSchema,
        response: {
          201: pushSubscriptionSchema,
          ...problemResponses(400, 401, 409, 502),
        },
      },
    },
    async (request, reply) => {
      const created = await notifications.createPushSubscription(caller(request), request.body);
      return reply.code(201).send(created);
    },
  );

  app.delete(
    '/api/v1/me/push-subscriptions/:subscriptionId',
    {
      config: { access: 'account' },
      schema: {
        tags: ['notifications'],
        operationId: 'notifications.deletePushSubscription',
        summary: 'Disable a browser push subscription',
        params: pushSubscriptionParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 404) },
      },
    },
    async (request, reply) => {
      await notifications.deletePushSubscription(caller(request), request.params.subscriptionId);
      return reply.code(204).send(null);
    },
  );
};
