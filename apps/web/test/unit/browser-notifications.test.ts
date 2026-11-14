import { describe, expect, it } from 'vitest';
import { urlBase64ToUint8Array } from '@/features/account/browser-notifications.js';

describe('browser notification helpers', () => {
  it('decodes a URL-safe public key for PushManager', () => {
    const key = 'BL_bJopDhgCFII2jpZ0JsHQytLBG4qylGJs2nNDstjRY5rcPNzEloDwV2BiFtF_4v6BkJnKO5YlhyQRpdxRMm2Y';
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes.byteLength).toBe(65);
    expect(bytes[0]).toBe(4);
  });
});
