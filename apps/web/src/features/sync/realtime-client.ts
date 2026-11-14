/** Connection state shown in the shell status. */
export type SyncConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'unavailable';

/** Content-free change notification from `/ws`. */
export interface SyncRealtimeEvent {
  readonly kind: string;
  readonly resource: string;
  readonly id: string;
  readonly version: number | null;
  readonly houseId: string | null;
  readonly occurredAt: string;
}

/** Options of {@link FamilyRealtimeClient}. */
export interface FamilyRealtimeClientOptions {
  readonly familyId: string;
  readonly houseId: string;
  readonly enabled: boolean;
  readonly onState: (state: SyncConnectionState) => void;
  readonly onEvent: (event: SyncRealtimeEvent) => void;
  readonly onSessionRevoked: () => void;
}

const SUBPROTOCOL = 'domusafe.v1';

/**
 * Browser WebSocket client for family channels with safe reconnect.
 *
 * Preconditions: `enabled` is true only when the family plan includes realtime sync (or the trial).
 * Postconditions: subscribe messages are resent after every reconnect; contents never travel on the socket.
 * Data contract: only notification envelopes are parsed; malformed frames are ignored.
 *
 * Intentionally avoids importing Zod contracts so the shell gzip budget stays intact.
 */
export class FamilyRealtimeClient {
  readonly #options: FamilyRealtimeClientOptions;
  #socket: WebSocket | null = null;
  #closed = false;
  #attempt = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #pingTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Creates a client that is idle until {@link FamilyRealtimeClient.start} is called.
   *
   * @param options - Family, house and callbacks.
   */
  constructor(options: FamilyRealtimeClientOptions) {
    this.#options = options;
  }

  /** Opens the socket when enabled. */
  start(): void {
    if (!this.#options.enabled) {
      this.#options.onState('unavailable');
      return;
    }
    this.#connect();
  }

  /** Closes the socket and cancels reconnect. */
  stop(): void {
    this.#closed = true;
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#clearPing();
    this.#socket?.close();
    this.#socket = null;
  }

  #connect(): void {
    if (this.#closed) {
      return;
    }
    this.#options.onState(this.#attempt === 0 ? 'connecting' : 'reconnecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(url, [SUBPROTOCOL]);
    this.#socket = socket;

    socket.addEventListener('open', () => {
      this.#attempt = 0;
      this.#options.onState('live');
      this.#send({ type: 'subscribe', channel: `family:${this.#options.familyId}` });
      this.#send({ type: 'subscribe', channel: `house:${this.#options.houseId}` });
      this.#clearPing();
      this.#pingTimer = setInterval(() => {
        this.#send({ type: 'ping' });
      }, 25_000);
    });

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data) as unknown;
      } catch {
        return;
      }
      if (parsed === null || typeof parsed !== 'object' || !('type' in parsed)) {
        return;
      }
      const message = parsed as { type: string; event?: SyncRealtimeEvent; code?: string };
      if (message.type === 'event' && message.event !== undefined) {
        this.#options.onEvent(message.event);
        return;
      }
      if (message.type === 'session_revoked') {
        this.#options.onSessionRevoked();
        this.stop();
        this.#options.onState('offline');
        return;
      }
      if (message.type === 'error' && message.code === 'plan_required') {
        this.stop();
        this.#options.onState('unavailable');
      }
    });

    socket.addEventListener('close', () => {
      this.#clearPing();
      this.#socket = null;
      if (this.#closed) {
        return;
      }
      this.#options.onState('reconnecting');
      const delay = Math.min(30_000, 1000 * 2 ** this.#attempt);
      this.#attempt += 1;
      this.#timer = setTimeout(() => {
        this.#connect();
      }, delay);
    });

    socket.addEventListener('error', () => {
      socket.close();
    });
  }

  #send(message: { type: string; channel?: string }): void {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(JSON.stringify(message));
    }
  }

  #clearPing(): void {
    if (this.#pingTimer !== null) {
      clearInterval(this.#pingTimer);
      this.#pingTimer = null;
    }
  }
}
