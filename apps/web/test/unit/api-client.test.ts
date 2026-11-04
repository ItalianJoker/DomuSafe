import { describe, expect, it } from 'vitest';
import { createApi } from '../../src/lib/api.js';

describe('api client', () => {
  it('sends the anti-forgery header and an idempotency key on creation', async () => {
    const seen: { method: string; headers: Headers; url: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      seen.push({ method: request.method, headers: request.headers, url: request.url });
      const body =
        request.method === 'GET'
          ? {
              accountId: '019a0000-0000-7000-8000-000000000010',
              email: 'ada@example.test',
              emailVerified: false,
              displayName: 'Ada',
              locale: 'it',
              theme: 'system',
              twoFactorEnabled: false,
              primaryFamilyId: null,
              lastFamilyId: null,
              lastHouseId: null,
              families: [],
            }
          : { family: familyBody(), house: houseBody() };
      return new Response(JSON.stringify(request.url.endsWith('/me') ? body : body), {
        status: request.method === 'GET' ? 200 : 201,
        headers: { 'content-type': 'application/json' },
      });
    };
    const api = createApi({ baseUrl: 'http://127.0.0.1:9', fetch: fetchImpl });
    expect(await api.getMe()).toMatchObject({ displayName: 'Ada' });
    await api.createFamily(
      {
        name: 'Rossi',
        timezone: 'Europe/Rome',
        baseCurrency: 'EUR',
        locale: 'it',
        firstHouse: { name: 'Casa' },
      },
      '019a0000-0000-7000-8000-000000000099',
    );
    const get = seen[0];
    const post = seen[1];
    expect(get?.headers.get('x-domusafe-request')).toBeNull();
    expect(get?.headers.get('accept-language')).toBe('it');
    expect(post?.headers.get('x-domusafe-request')).toBe('1');
    expect(post?.headers.get('idempotency-key')).toBe('019a0000-0000-7000-8000-000000000099');
  });
});

function familyBody() {
  return {
    id: '019a0000-0000-7000-8000-000000000001',
    name: 'Rossi',
    ownerAccountId: '019a0000-0000-7000-8000-000000000010',
    timezone: 'Europe/Rome',
    baseCurrency: 'EUR',
    locale: 'it',
    plan: { tier: 'free', source: 'paid', trialEndsAt: null, watermark: true },
    role: 'admin',
    version: 1,
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
  };
}

function houseBody() {
  return {
    id: '019a0000-0000-7000-8000-000000000002',
    familyId: '019a0000-0000-7000-8000-000000000001',
    name: 'Casa',
    addressLine: null,
    postalCode: null,
    city: null,
    province: null,
    country: 'IT',
    sortOrder: 0,
    planLocked: false,
    version: 1,
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
  };
}
