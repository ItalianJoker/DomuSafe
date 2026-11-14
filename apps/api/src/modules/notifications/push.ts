import type { PushPayload } from '@domusafe/contracts';
import webpush from 'web-push';

/** Outcome of one delivery attempt to a browser push endpoint. */
export type PushSendResult =
  { readonly ok: true } | { readonly ok: false; readonly gone: boolean; readonly statusCode: number | null };

/** One browser subscription as expected by the push library. */
export interface WebPushTarget {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

/**
 * Sends minimal JSON payloads to browser push endpoints (Web Push with VAPID).
 *
 * Preconditions: VAPID keys were configured when the sender was created.
 * Postconditions: a 404 or 410 response is reported as `gone` so the subscription can be disabled.
 * Data contract: the payload contains only title, body and an internal path.
 */
export interface PushSender {
  /**
   * Delivers one payload to one subscription.
   *
   * @param target - Endpoint and client keys.
   * @param payload - Minimal notification body.
   * @returns Success or a gone/failure signal.
   */
  send(target: WebPushTarget, payload: PushPayload): Promise<PushSendResult>;
}

/**
 * Builds a live sender backed by `web-push`.
 *
 * @param options - VAPID material and contact subject.
 * @returns The sender.
 */
export function createWebPushSender(options: {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly subject: string;
}): PushSender {
  webpush.setVapidDetails(options.subject, options.publicKey, options.privateKey);
  return {
    async send(target, payload) {
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 12, urgency: 'normal' },
        );
        return { ok: true };
      } catch (error) {
        const statusCode = statusOf(error);
        return { ok: false, gone: statusCode === 404 || statusCode === 410, statusCode };
      }
    },
  };
}

/**
 * Sender that records calls and never talks to the network (tests).
 *
 * @returns A recording sender and the list of delivered payloads.
 */
export function createRecordingPushSender(): {
  readonly sender: PushSender;
  readonly deliveries: { target: WebPushTarget; payload: PushPayload }[];
} {
  const deliveries: { target: WebPushTarget; payload: PushPayload }[] = [];
  return {
    deliveries,
    sender: {
      async send(target, payload) {
        deliveries.push({ target, payload });
        return { ok: true };
      },
    },
  };
}

function statusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return null;
  }
  const statusCode = Reflect.get(error, 'statusCode');
  return typeof statusCode === 'number' ? statusCode : null;
}
