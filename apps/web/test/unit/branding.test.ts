import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('host mark copy', () => {
  it('writes the Italian sentences without abbreviations', () => {
    const text = readFileSync(resolve(import.meta.dirname, '../../messages/it.json'), 'utf8');
    const messages = JSON.parse(text) as Record<string, string>;
    const banned = /\b(?:QR|A4|A5|ICE|IBAN|PIN|URL|PNG|JPEG|PDF|KB|S3)\b/u;
    for (const key of Object.keys(messages)) {
      if (key.startsWith('host') || key.startsWith('guideHost')) {
        expect(messages[key], key).not.toMatch(banned);
      }
    }
  });
});
