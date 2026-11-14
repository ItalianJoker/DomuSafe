import {
  REALTIME_ALWAYS_KINDS,
  type RealtimeEvent,
  type RealtimeEventKind,
  type RealtimeServerMessage,
} from '@domusafe/contracts';
import { hasFeature } from '@domusafe/plans';
import type { EffectivePlan } from '@domusafe/plans';
import type { Redis } from 'ioredis';
import type { WebSocket } from 'ws';

/** Pub/sub channel used between API replicas for family fan-out. */
export const REALTIME_BUS_CHANNEL = 'domusafe:realtime';

/** Membership snapshot attached to an open socket. */
export interface RealtimeConnectionAuth {
  readonly accountId: string;
  readonly sessionId: string;
  readonly familyId: string;
  readonly role: string;
  readonly plan: EffectivePlan;
  readonly allHouses: boolean;
  /** When `allHouses` is false, only these houses may receive house-scoped events. */
  readonly houseIds: ReadonlySet<string>;
}

/** One live WebSocket subscription set. */
export interface RealtimeConnection {
  readonly id: string;
  readonly socket: WebSocket;
  auth: RealtimeConnectionAuth;
  readonly channels: Set<string>;
  lastPongAt: number;
}

/** Envelope published on the Valkey bus and delivered locally. */
export interface RealtimeBusMessage {
  readonly familyId: string;
  readonly channel: string;
  readonly event: RealtimeEvent;
  /** Personal resources reach only this account. */
  readonly ownerAccountId?: string | null;
  /** When set, guests never receive the event (technical house data). */
  readonly guestVisible?: boolean;
}

/**
 * Whether a connection may receive an event on a given channel under plan and scope rules.
 *
 * Preconditions: the connection already subscribed to `channel` after membership checks.
 * Postconditions: personal rows stay on the owner; guests skip technical rows; Free/Basic/Advanced
 * only receive the always-on kinds.
 * Data contract: the decision uses metadata only (no resource contents).
 *
 * @param connection - Open socket.
 * @param message - Bus message.
 * @returns `true` when the socket should receive the event.
 */
export function mayDeliver(connection: RealtimeConnection, message: RealtimeBusMessage): boolean {
  if (connection.auth.familyId !== message.familyId) {
    return false;
  }
  if (
    message.ownerAccountId !== undefined &&
    message.ownerAccountId !== null &&
    message.ownerAccountId !== connection.auth.accountId
  ) {
    return false;
  }
  if (message.guestVisible === false && connection.auth.role === 'guest') {
    return false;
  }
  const houseId = message.event.houseId;
  if (houseId !== null && !connection.auth.allHouses && !connection.auth.houseIds.has(houseId)) {
    return false;
  }
  if (hasFeature(connection.auth.plan.tier, 'realtime_sync')) {
    return true;
  }
  return (REALTIME_ALWAYS_KINDS as readonly RealtimeEventKind[]).includes(message.event.kind);
}

/**
 * In-process registry of WebSocket connections with optional Valkey fan-out across replicas.
 *
 * Preconditions: sockets are authenticated before `attach`.
 * Postconditions: `publish` reaches every eligible local subscriber; with Valkey, every replica too.
 * Data contract: payloads are notification envelopes without resource contents.
 */
export class RealtimeHub {
  readonly #connections = new Map<string, RealtimeConnection>();
  readonly #bySession = new Map<string, Set<string>>();
  readonly #subscriber: Redis | null;
  readonly #publisher: Redis | null;
  #closed = false;

  /**
   * Builds a hub, optionally backed by Valkey pub/sub for multi-replica fan-out.
   *
   * @param redis - Shared Valkey client; when set, a duplicate connection is used for subscribe.
   */
  constructor(redis: Redis | null = null) {
    if (redis === null) {
      this.#subscriber = null;
      this.#publisher = null;
      return;
    }
    this.#publisher = redis;
    this.#subscriber = redis.duplicate();
    void this.#subscriber.subscribe(REALTIME_BUS_CHANNEL);
    this.#subscriber.on('message', (channel, payload) => {
      if (channel !== REALTIME_BUS_CHANNEL) {
        return;
      }
      this.#deliverLocal(JSON.parse(payload) as RealtimeBusMessage);
    });
  }

  /**
   * Registers an authenticated socket.
   *
   * @param connection - Connection metadata and socket.
   */
  attach(connection: RealtimeConnection): void {
    this.#connections.set(connection.id, connection);
    const sessions = this.#bySession.get(connection.auth.sessionId) ?? new Set<string>();
    sessions.add(connection.id);
    this.#bySession.set(connection.auth.sessionId, sessions);
  }

  /**
   * Removes a socket from every index.
   *
   * @param connectionId - Connection id.
   */
  detach(connectionId: string): void {
    const connection = this.#connections.get(connectionId);
    if (connection === undefined) {
      return;
    }
    this.#connections.delete(connectionId);
    const sessions = this.#bySession.get(connection.auth.sessionId);
    if (sessions !== undefined) {
      sessions.delete(connectionId);
      if (sessions.size === 0) {
        this.#bySession.delete(connection.auth.sessionId);
      }
    }
  }

  /**
   * Looks up a live connection.
   *
   * @param connectionId - Connection id.
   * @returns The connection, or `undefined`.
   */
  get(connectionId: string): RealtimeConnection | undefined {
    return this.#connections.get(connectionId);
  }

  /**
   * Publishes a change notification to family and optional house channels.
   *
   * @param input - Family, event and optional visibility filters.
   */
  async publish(input: {
    readonly familyId: string;
    readonly event: RealtimeEvent;
    readonly ownerAccountId?: string | null;
    readonly guestVisible?: boolean;
  }): Promise<void> {
    if (this.#closed) {
      return;
    }
    const channels = [`family:${input.familyId}`];
    if (input.event.houseId !== null) {
      channels.push(`house:${input.event.houseId}`);
    }
    for (const channel of channels) {
      const message: RealtimeBusMessage = {
        familyId: input.familyId,
        channel,
        event: input.event,
        ...(input.ownerAccountId === undefined ? {} : { ownerAccountId: input.ownerAccountId }),
        ...(input.guestVisible === undefined ? {} : { guestVisible: input.guestVisible }),
      };
      if (this.#publisher === null) {
        this.#deliverLocal(message);
      } else {
        // The local subscriber receives the same message and delivers once per replica.
        await this.#publisher.publish(REALTIME_BUS_CHANNEL, JSON.stringify(message));
      }
    }
  }

  /**
   * Closes every socket that belongs to a revoked session.
   *
   * @param sessionId - Better Auth session id.
   */
  revokeSession(sessionId: string): void {
    const ids = this.#bySession.get(sessionId);
    if (ids === undefined) {
      return;
    }
    for (const id of [...ids]) {
      const connection = this.#connections.get(id);
      if (connection === undefined) {
        continue;
      }
      this.#send(connection, { type: 'session_revoked' });
      connection.socket.close(4001, 'session_revoked');
      this.detach(id);
    }
  }

  /**
   * Sends a server message when the socket is still open.
   *
   * @param connection - Target connection.
   * @param message - Server message.
   */
  send(connection: RealtimeConnection, message: RealtimeServerMessage): void {
    this.#send(connection, message);
  }

  /**
   * Releases the subscriber connection.
   */
  async close(): Promise<void> {
    this.#closed = true;
    for (const connection of this.#connections.values()) {
      connection.socket.close(1001, 'shutdown');
    }
    this.#connections.clear();
    this.#bySession.clear();
    if (this.#subscriber !== null) {
      await this.#subscriber.quit();
    }
  }

  #deliverLocal(message: RealtimeBusMessage): void {
    for (const connection of this.#connections.values()) {
      if (!connection.channels.has(message.channel)) {
        continue;
      }
      if (!mayDeliver(connection, message)) {
        continue;
      }
      this.#send(connection, { type: 'event', channel: message.channel, event: message.event });
    }
  }

  #send(connection: RealtimeConnection, message: RealtimeServerMessage): void {
    if (connection.socket.readyState !== connection.socket.OPEN) {
      return;
    }
    connection.socket.send(JSON.stringify(message));
  }
}

/**
 * Builds a realtime event with the current instant.
 *
 * @param input - Kind, resource and identifiers.
 * @param now - Clock.
 * @returns The event.
 */
export function buildRealtimeEvent(
  input: {
    readonly kind: RealtimeEventKind;
    readonly resource: string;
    readonly id: string;
    readonly version: number | null;
    readonly houseId: string | null;
  },
  now: () => Date = () => new Date(),
): RealtimeEvent {
  return {
    kind: input.kind,
    resource: input.resource,
    id: input.id,
    version: input.version,
    houseId: input.houseId,
    occurredAt: now().toISOString(),
  };
}
