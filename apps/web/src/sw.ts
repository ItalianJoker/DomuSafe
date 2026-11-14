/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// App shell only. API responses are not precached: the server stays the source of truth.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('push', (event) => {
  event.waitUntil(showPushNotification(event));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = readNotificationUrl(event.notification.data);
  event.waitUntil(openOrFocus(target));
});

/**
 * Shows a browser notification from a push event.
 *
 * Preconditions: the payload is minimal JSON (`title`, `body`, `url`) or plain text.
 * Postconditions: a system notification is shown; missing fields fall back to DomuSafe defaults.
 *
 * @param event - Push event from the browser.
 */
async function showPushNotification(event: PushEvent): Promise<void> {
  const parsed = parsePushPayload(event.data);
  await self.registration.showNotification(parsed.title, {
    body: parsed.body,
    data: { url: parsed.url },
    tag: 'domusafe-deadline',
  });
}

function parsePushPayload(data: PushMessageData | null): { title: string; body: string; url: string } {
  const fallback = {
    title: 'DomuSafe',
    body: 'Hai una scadenza da controllare.',
    url: '/',
  };
  if (data === null) {
    return fallback;
  }
  try {
    const json: unknown = data.json();
    if (typeof json === 'object' && json !== null) {
      const record = json as Record<string, unknown>;
      return {
        title: typeof record.title === 'string' && record.title.length > 0 ? record.title : fallback.title,
        body: typeof record.body === 'string' && record.body.length > 0 ? record.body : fallback.body,
        url: typeof record.url === 'string' && record.url.startsWith('/') ? record.url : fallback.url,
      };
    }
  } catch {
    const text = data.text();
    if (text.length > 0) {
      return { ...fallback, body: text.slice(0, 1000) };
    }
  }
  return fallback;
}

function readNotificationUrl(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'url' in data) {
    const url = (data as { url: unknown }).url;
    if (typeof url === 'string' && url.startsWith('/')) {
      return url;
    }
  }
  return '/';
}

async function openOrFocus(path: string): Promise<void> {
  const absolute = new URL(path, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    if ('focus' in client) {
      await client.focus();
      if ('navigate' in client) {
        await client.navigate(absolute);
      }
      return;
    }
  }
  await self.clients.openWindow(absolute);
}
