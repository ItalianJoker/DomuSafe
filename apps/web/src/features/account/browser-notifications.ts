import type {
  CreatePushSubscriptionRequest,
  NotificationPreference,
  NotificationPreferenceList,
  PushSubscription,
  UpdateNotificationPreferencesRequest,
} from '@domusafe/contracts';

const STORAGE_KEY = 'domusafe.pushSubscriptionId';

/** Result of asking the browser for notification permission. */
export type PushPermission = NotificationPermission | 'unsupported';

/**
 * Current browser permission for system notifications.
 *
 * @returns The permission, or `unsupported` when the API is missing.
 */
export function pushPermissionState(): PushPermission {
  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Enables browser deadline alerts: permission, PushManager subscribe, API subscription and preference.
 *
 * Preconditions: `vapidPublicKey` is the server public key; the page is served over HTTPS or localhost.
 * Postconditions: the preference for `deadline` has `push: true` for the family; a subscription row exists.
 *
 * @param options - Keys, family and API callbacks.
 */
export async function enableBrowserDeadlineAlerts(options: {
  readonly vapidPublicKey: string;
  readonly familyId: string;
  readonly subscribe: (body: CreatePushSubscriptionRequest) => Promise<PushSubscription>;
  readonly savePreference: (
    items: UpdateNotificationPreferencesRequest['items'],
  ) => Promise<NotificationPreferenceList>;
}): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('unsupported');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('denied');
  }
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(options.vapidPublicKey),
    }));
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (endpoint === undefined || p256dh === undefined || auth === undefined) {
    throw new Error('incomplete');
  }
  const saved = await options.subscribe({ endpoint, p256dh, auth });
  try {
    localStorage.setItem(STORAGE_KEY, saved.id);
  } catch {
    // Private mode may reject storage; the preference still enables delivery.
  }
  await options.savePreference([
    {
      familyId: options.familyId,
      category: 'deadline',
      inApp: true,
      push: true,
      email: false,
      quietStart: null,
      quietEnd: null,
    },
  ]);
}

/**
 * Disables browser deadline alerts for the family and drops the local PushManager subscription.
 *
 * Preconditions: the account may update preferences for `familyId`.
 * Postconditions: preference `push` is false; the browser subscription is unsubscribed when present.
 *
 * @param options - Family and API callbacks.
 */
export async function disableBrowserDeadlineAlerts(options: {
  readonly familyId: string;
  readonly listPreferences: () => Promise<NotificationPreferenceList>;
  readonly savePreference: (
    items: UpdateNotificationPreferencesRequest['items'],
  ) => Promise<NotificationPreferenceList>;
  readonly deleteSubscription: (subscriptionId: string) => Promise<void>;
}): Promise<void> {
  const current = await options.listPreferences();
  const existing = current.items.find(
    (item: NotificationPreference) => item.familyId === options.familyId && item.category === 'deadline',
  );
  await options.savePreference([
    {
      familyId: options.familyId,
      category: 'deadline',
      inApp: existing?.inApp ?? true,
      push: false,
      email: existing?.email ?? false,
      quietStart: existing?.quietStart ?? null,
      quietEnd: existing?.quietEnd ?? null,
    },
  ]);

  let subscriptionId: string | null = null;
  try {
    subscriptionId = localStorage.getItem(STORAGE_KEY);
  } catch {
    subscriptionId = null;
  }
  if (subscriptionId !== null) {
    try {
      await options.deleteSubscription(subscriptionId);
    } catch {
      // Already gone on the server.
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription !== null) {
    await subscription.unsubscribe();
  }
}

/**
 * Decodes a URL-safe base64 VAPID public key for `PushManager.subscribe`.
 *
 * @param base64String - Server public key.
 * @returns Bytes for `applicationServerKey`.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}
