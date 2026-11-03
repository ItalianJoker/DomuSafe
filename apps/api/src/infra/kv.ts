import { Redis } from 'ioredis';

/**
 * Ephemeral key-value storage (phase 1 §3.5): rate-limit counters, idempotency records, Better Auth
 * secondary storage. Losing it never loses durable data.
 */
export interface KeyValueStore {
  /** Reads a value, or `null` when absent or expired. */
  get(key: string): Promise<string | null>;
  /** Writes a value with a time to live in seconds. */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Writes only when the key does not exist; returns `true` when written. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** Deletes a key. */
  delete(key: string): Promise<void>;
  /** Reads and deletes a value atomically. */
  getAndDelete(key: string): Promise<string | null>;
  /** Increments a counter atomically; a new counter starts at 1 and expires `ttlSeconds` after creation. */
  increment(key: string, ttlSeconds: number): Promise<number>;
  /** Releases connections. */
  close(): Promise<void>;
}

/** In-process store for development and tests; not shared between replicas. */
export class MemoryStore implements KeyValueStore {
  readonly #entries = new Map<string, { value: string; expiresAt: number }>();

  /** Reads a value, or `null` when absent or expired. */
  get(key: string): Promise<string | null> {
    const entry = this.#entries.get(key);
    if (entry === undefined || entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  /** Writes a value with a time to live in seconds. */
  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.#entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  /** Writes only when the key does not exist; returns `true` when written. */
  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if ((await this.get(key)) !== null) {
      return false;
    }
    await this.set(key, value, ttlSeconds);
    return true;
  }

  /** Deletes a key. */
  delete(key: string): Promise<void> {
    this.#entries.delete(key);
    return Promise.resolve();
  }

  /** Reads and deletes a value atomically. */
  async getAndDelete(key: string): Promise<string | null> {
    const value = await this.get(key);
    this.#entries.delete(key);
    return value;
  }

  /** Increments a counter atomically; a new counter starts at 1 and expires `ttlSeconds` after creation. */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    const current = await this.get(key);
    const entry = this.#entries.get(key);
    const next = (current === null ? 0 : Number(current)) + 1;
    this.#entries.set(key, {
      value: String(next),
      expiresAt: entry?.expiresAt ?? Date.now() + ttlSeconds * 1000,
    });
    return next;
  }

  /** Releases connections (no-op for memory). */
  close(): Promise<void> {
    this.#entries.clear();
    return Promise.resolve();
  }
}

const INCREMENT_SCRIPT = `
local value = redis.call('INCR', KEYS[1])
if value == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return value`;

/** Valkey-backed store shared by every API replica. */
export class ValkeyStore implements KeyValueStore {
  readonly client: Redis;

  /**
   * Connects to Valkey.
   *
   * @param url - `redis://` or `rediss://` URL of the Valkey server.
   */
  constructor(url: string) {
    this.client = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false });
  }

  /** Reads a value, or `null` when absent or expired. */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** Writes a value with a time to live in seconds. */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  /** Writes only when the key does not exist; returns `true` when written. */
  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  /** Deletes a key. */
  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  /** Reads and deletes a value atomically (`GETDEL`). */
  async getAndDelete(key: string): Promise<string | null> {
    return this.client.getdel(key);
  }

  /** Increments a counter atomically; the TTL is set in the same script when the counter is created. */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    return Number(await this.client.eval(INCREMENT_SCRIPT, 1, key, ttlSeconds));
  }

  /** Closes the connection. */
  async close(): Promise<void> {
    await this.client.quit();
  }
}
