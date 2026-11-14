import { describe, expect, it } from 'vitest';
import { authProviderSchema, authProvidersSchema } from '../src/auth.js';

describe('auth providers contract', () => {
  it('accepts google and a discovery openid provider', () => {
    const parsed = authProvidersSchema.parse({
      providers: [
        { id: 'google', kind: 'google' },
        { id: 'openid', kind: 'openid' },
      ],
    });
    expect(parsed.providers).toHaveLength(2);
  });

  it('rejects uppercase provider ids and unknown kinds', () => {
    expect(() => authProviderSchema.parse({ id: 'Google', kind: 'google' })).toThrow();
    expect(() => authProviderSchema.parse({ id: 'google', kind: 'github' })).toThrow();
  });
});
