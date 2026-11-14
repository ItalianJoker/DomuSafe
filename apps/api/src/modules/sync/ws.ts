import {
  REALTIME_SUBPROTOCOL,
  realtimeClientMessageSchema,
  type RealtimeServerMessage,
} from '@domusafe/contracts';
import websocket from '@fastify/websocket';
import { fromNodeHeaders } from 'better-auth/node';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import type { Auth } from '../../auth/auth.js';
import type { TenancyService } from '../tenancy/service.js';
import type { RealtimeConnection, RealtimeHub } from './hub.js';

/** Dependencies of the WebSocket plugin. */
export interface RealtimeWsOptions {
  readonly auth: Auth;
  readonly tenancy: TenancyService;
  readonly hub: RealtimeHub;
  readonly trustedOrigins: readonly string[];
}

const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 60_000;
const MAX_MESSAGE_BYTES = 4096;

function send(socket: WebSocket, message: RealtimeServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/**
 * WebSocket `/ws` with subprotocol `domusafe.v1` (phase 3 §7.1).
 *
 * Preconditions: the upgrade carries a session cookie and an allowed `Origin`.
 * Postconditions: subscriptions are limited to families the account belongs to and houses it can see.
 * Data contract: only notification envelopes cross the socket; never resource contents.
 *
 * @param app - Fastify instance.
 * @param options - Auth, tenancy and hub.
 */
export async function registerRealtimeWs(app: FastifyInstance, options: RealtimeWsOptions): Promise<void> {
  const { auth, tenancy, hub, trustedOrigins } = options;

  await app.register(websocket, {
    options: {
      maxPayload: MAX_MESSAGE_BYTES,
    },
  });

  app.get(
    '/ws',
    {
      config: { access: 'public' },
      websocket: true,
      schema: { hide: true },
    },
    (socket, request) => {
      const origin = request.headers.origin;
      if (origin !== undefined && !trustedOrigins.includes(origin)) {
        send(socket, { type: 'error', code: 'forbidden' });
        socket.close(1008, 'origin');
        return;
      }
      const protocolsHeader = request.headers['sec-websocket-protocol'];
      const protocols =
        typeof protocolsHeader === 'string' ? protocolsHeader.split(',').map((value) => value.trim()) : [];
      if (!protocols.includes(REALTIME_SUBPROTOCOL)) {
        send(socket, { type: 'error', code: 'invalid_message' });
        socket.close(1002, 'protocol');
        return;
      }

      // Buffer frames that arrive while the session is resolved (handshake completes before this).
      const pending: RawData[] = [];
      let connection: RealtimeConnection | null = null;
      let ready = false;

      const heartbeat = setInterval(() => {
        if (connection === null) {
          return;
        }
        if (Date.now() - connection.lastPongAt > PONG_TIMEOUT_MS) {
          socket.close(1001, 'pong_timeout');
          return;
        }
        if (socket.readyState === socket.OPEN) {
          socket.ping();
        }
      }, PING_INTERVAL_MS);

      socket.on('pong', () => {
        if (connection !== null) {
          connection.lastPongAt = Date.now();
        }
      });

      const handleMessage = (raw: RawData): void => {
        if (connection === null) {
          return;
        }
        const active = connection;
        active.lastPongAt = Date.now();
        const text = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : '';
        if (text.length > MAX_MESSAGE_BYTES) {
          send(socket, { type: 'error', code: 'invalid_message' });
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          send(socket, { type: 'error', code: 'invalid_message' });
          return;
        }
        const message = realtimeClientMessageSchema.safeParse(parsed);
        if (!message.success) {
          send(socket, { type: 'error', code: 'invalid_message' });
          return;
        }
        if (message.data.type === 'ping') {
          send(socket, { type: 'pong' });
          return;
        }
        if (message.data.type === 'unsubscribe') {
          active.channels.delete(message.data.channel);
          send(socket, { type: 'unsubscribed', channel: message.data.channel });
          return;
        }

        const channel = message.data.channel;
        const [kind, id] = channel.split(':') as [string, string];
        void (async () => {
          if (kind === 'family') {
            const resolved = await tenancy.resolveTenant(active.auth.accountId, id);
            if (resolved === null) {
              send(socket, { type: 'error', code: 'forbidden' });
              return;
            }
            const houseIds = resolved.allHouses
              ? []
              : await tenancy.membershipHouseIds(active.auth.accountId, id);
            active.auth = {
              accountId: active.auth.accountId,
              sessionId: active.auth.sessionId,
              familyId: id,
              role: resolved.role,
              plan: resolved.plan,
              allHouses: resolved.allHouses,
              houseIds: new Set(houseIds),
            };
            active.channels.add(channel);
            send(socket, { type: 'subscribed', channel });
            return;
          }

          if (kind === 'house') {
            if (active.auth.familyId === '') {
              send(socket, { type: 'error', code: 'forbidden' });
              return;
            }
            const visible = await tenancy.houseVisible(active.auth.accountId, active.auth.familyId, id);
            if (!visible) {
              send(socket, { type: 'error', code: 'forbidden' });
              return;
            }
            active.channels.add(channel);
            send(socket, { type: 'subscribed', channel });
            return;
          }

          send(socket, { type: 'error', code: 'invalid_message' });
        })();
      };

      socket.on('message', (raw) => {
        if (!ready) {
          pending.push(raw);
          return;
        }
        handleMessage(raw);
      });

      socket.on('close', () => {
        clearInterval(heartbeat);
        if (connection !== null) {
          hub.detach(connection.id);
        }
      });

      void (async () => {
        const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
        if (session === null) {
          send(socket, { type: 'error', code: 'unauthenticated' });
          socket.close(4401, 'unauthenticated');
          return;
        }
        connection = {
          id: randomUUID(),
          socket,
          auth: {
            accountId: session.user.id,
            sessionId: session.session.id,
            familyId: '',
            role: 'guest',
            plan: { tier: 'free', source: 'paid', trialEndsAt: null },
            allHouses: true,
            houseIds: new Set(),
          },
          channels: new Set(),
          lastPongAt: Date.now(),
        };
        hub.attach(connection);
        ready = true;
        for (const raw of pending) {
          handleMessage(raw);
        }
        pending.length = 0;
      })();
    },
  );
}
