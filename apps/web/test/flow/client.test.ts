import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { buildApp } from '@domusafe/api';
import { createTestDatabase, requireAdminUrl } from '@domusafe/db/testing';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createApi } from '../../src/lib/api.js';
import { createSession } from '../../src/lib/session.js';

const PASSWORD = 'una-password-lunga-42';

describe('shell client against the API', () => {
  let close: (() => Promise<void>) | undefined;
  const originBox: { origin: string } = { origin: '' };

  beforeAll(async () => {
    const port = await freePort();
    const origin = `http://127.0.0.1:${String(port)}`;
    originBox.origin = origin;
    const database = await createTestDatabase(requireAdminUrl(), inject('templateDatabase'));
    const app = await buildApp({
      config: {
        nodeEnv: 'test',
        host: '127.0.0.1',
        port,
        logLevel: 'silent',
        publicOrigin: origin,
        trustedOrigins: [origin],
        trustProxy: false,
        databaseUrl: database.appUrl,
        databasePoolSize: 4,
        valkeyUrl: null,
        masterKeys: `1:${randomBytes(32).toString('base64url')}`,
        masterKeyActive: 1,
      },
      globalRateLimitPerMinute: 100_000,
    });
    await app.listen({ host: '127.0.0.1', port });
    close = async () => {
      await app.close();
      await database.drop();
    };
  }, 60_000);

  afterAll(async () => {
    await close?.();
  });

  it('creates an account, a family, a house and remembers the theme', async () => {
    const fetchImpl = cookieFetch(originBox.origin);
    const session = createSession({ baseUrl: originBox.origin, fetch: fetchImpl });
    const api = createApi({ baseUrl: originBox.origin, fetch: fetchImpl });
    const created = await session.signUp('Ada Rossi', `ada-${randomUUID()}@example.test`, PASSWORD);
    expect(created).toEqual({ status: 'created' });
    const me = await api.getMe();
    expect(me).toMatchObject({ displayName: 'Ada Rossi', theme: 'system', families: [] });
    const family = await api.createFamily(
      {
        name: 'Famiglia Rossi',
        timezone: 'Europe/Rome',
        baseCurrency: 'EUR',
        locale: 'it',
        firstHouse: { name: 'Casa al mare' },
      },
      randomUUID(),
    );
    expect(family.house.name).toBe('Casa al mare');
    const houses = await api.listHouses(family.family.id);
    expect(houses.map((house) => house.name)).toEqual(['Casa al mare']);
    const themed = await api.updateProfile({ theme: 'dark' });
    expect(themed.theme).toBe('dark');
    await enableTwoFactor(fetchImpl, originBox.origin, PASSWORD);
    const first = houses[0];
    if (first === undefined) {
      throw new Error('missing house');
    }
    const edited = await api.updateHouse(family.family.id, first.id, first.version, {
      name: 'Casa al mare',
      addressLine: 'Via Roma 1',
      postalCode: '00100',
      city: 'Roma',
      province: 'Roma',
      country: 'IT',
    });
    expect(edited).toMatchObject({ city: 'Roma', addressLine: 'Via Roma 1' });
    await expect(
      api.createHouse(family.family.id, { name: 'Seconda casa', country: 'IT' }, randomUUID()),
    ).rejects.toMatchObject({ problem: { code: 'plan_limit_reached' } });
    const updated = await api.updateProfile({ lastFamilyId: family.family.id, lastHouseId: first.id });
    expect(updated).toMatchObject({ theme: 'dark', lastHouseId: first.id });
  });
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('No port'));
        return;
      }
      const { port } = address;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

async function enableTwoFactor(fetchImpl: typeof fetch, origin: string, password: string): Promise<void> {
  const enable = await fetchImpl(`${origin}/api/auth/two-factor/enable`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ password }),
  });
  if (!enable.ok) {
    throw new Error(`two-factor enable failed: ${String(enable.status)} ${await enable.text()}`);
  }
  const payload = (await enable.json()) as { totpURI: string };
  const secret = new URL(payload.totpURI).searchParams.get('secret') ?? '';
  const verify = await fetchImpl(`${origin}/api/auth/two-factor/verify-totp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ code: totp(secret) }),
  });
  if (!verify.ok) {
    throw new Error(`two-factor verify failed: ${String(verify.status)} ${await verify.text()}`);
  }
}

function totp(secret: string, now: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, '0');
}

function base32Decode(text: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of text.replace(/=+$/u, '').toUpperCase()) {
    const index = alphabet.indexOf(char);
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function cookieFetch(origin: string): typeof fetch {
  const jar = new Map<string, string>();
  return async (input, init) => {
    const request = new Request(input, init);
    const headers = new Headers(request.headers);
    headers.set('origin', origin);
    if (jar.size > 0) {
      headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    const response = await fetch(new Request(request, { headers }));
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq <= 0) {
        continue;
      }
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '' || /max-age=0/iu.test(line)) {
        jar.delete(name);
      } else {
        jar.set(name, value);
      }
    }
    return response;
  };
}
