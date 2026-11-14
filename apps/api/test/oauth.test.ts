import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { listConfiguredAuthProviders } from '../src/auth/auth.js';
import { loadConfig } from '../src/config.js';
import { Client, createTestApp, type TestApp } from './helpers.js';

function baseEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    PUBLIC_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: 'postgres://domusafe_app@localhost:5432/domusafe',
    DOMUSAFE_MASTER_KEYS: `1:${randomBytes(32).toString('base64url')}`,
    DOMUSAFE_MASTER_KEY_ACTIVE: '1',
    ...extra,
  };
}

describe('OAuth and OpenID Connect configuration', () => {
  it('leaves providers empty when credentials are unset', () => {
    const config = loadConfig(baseEnv());
    expect(config.googleAuth).toBeNull();
    expect(config.openIdAuth).toBeNull();
    expect(listConfiguredAuthProviders(config.googleAuth, config.openIdAuth)).toEqual([]);
  });

  it('accepts Google and a discovery OpenID Connect provider together', () => {
    const config = loadConfig(
      baseEnv({
        GOOGLE_CLIENT_ID: 'google-client',
        GOOGLE_CLIENT_SECRET: 'google-secret-value',
        OIDC_CLIENT_ID: 'oidc-client',
        OIDC_CLIENT_SECRET: 'oidc-secret-value',
        OIDC_DISCOVERY_URL: 'https://idp.example.test/realms/demo/.well-known/openid-configuration',
        OIDC_PROVIDER_ID: 'openid',
      }),
    );
    expect(config.googleAuth).toEqual({
      clientId: 'google-client',
      clientSecret: 'google-secret-value',
    });
    expect(config.openIdAuth).toEqual({
      providerId: 'openid',
      clientId: 'oidc-client',
      clientSecret: 'oidc-secret-value',
      discoveryUrl: 'https://idp.example.test/realms/demo/.well-known/openid-configuration',
    });
    expect(listConfiguredAuthProviders(config.googleAuth, config.openIdAuth)).toEqual([
      { id: 'google', kind: 'google' },
      { id: 'openid', kind: 'openid' },
    ]);
  });

  it('rejects incomplete Google or OpenID Connect pairs', () => {
    expect(() => loadConfig(baseEnv({ GOOGLE_CLIENT_ID: 'only-id' }))).toThrow(/GOOGLE_CLIENT_ID/);
    expect(() =>
      loadConfig(
        baseEnv({
          OIDC_CLIENT_ID: 'oidc-client',
          OIDC_CLIENT_SECRET: 'oidc-secret-value',
        }),
      ),
    ).toThrow(/OIDC_CLIENT_ID/);
    expect(() =>
      loadConfig(
        baseEnv({
          OIDC_CLIENT_ID: 'oidc-client',
          OIDC_CLIENT_SECRET: 'oidc-secret-value',
          OIDC_DISCOVERY_URL: 'https://idp.example.test/.well-known/openid-configuration',
          OIDC_PROVIDER_ID: 'google',
        }),
      ),
    ).toThrow(/OIDC_PROVIDER_ID/);
  });
});

describe('OAuth provider routes', () => {
  let testApp: TestApp;

  it('exposes an empty public provider list by default', async () => {
    testApp = await createTestApp();
    try {
      const client = new Client(testApp.app);
      const response = await client.request('GET', '/api/v1/auth/providers');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ providers: [] });
    } finally {
      await testApp.close();
    }
  });

  it('rejects social sign-in when Google is not configured', async () => {
    testApp = await createTestApp();
    try {
      const client = new Client(testApp.app);
      const response = await client.request('POST', '/api/auth/sign-in/social', {
        body: { provider: 'google', callbackURL: '/', disableRedirect: true },
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    } finally {
      await testApp.close();
    }
  });

  it('lists Google and starts the social redirect when credentials are set', async () => {
    testApp = await createTestApp({
      env: {
        GOOGLE_CLIENT_ID: 'google-test-client.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'google-test-secret-value',
      },
    });
    try {
      const client = new Client(testApp.app);
      const listed = await client.request('GET', '/api/v1/auth/providers');
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toEqual({ providers: [{ id: 'google', kind: 'google' }] });

      const start = await client.request('POST', '/api/auth/sign-in/social', {
        body: { provider: 'google', callbackURL: '/', disableRedirect: true },
      });
      expect(start.statusCode).toBe(200);
      const body = start.json<{ redirect: boolean; url?: string }>();
      // Better Auth sets `redirect: false` when `disableRedirect` is true, and still returns `url`.
      expect(body.redirect).toBe(false);
      expect(body.url).toMatch(/^https:\/\/accounts\.google\.com\//);
    } finally {
      await testApp.close();
    }
  });
});
