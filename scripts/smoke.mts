/**
 * Smoke critico DomuSafe MVP (Node 22 + fake-indexeddb).
 * Esegue: licensing BASIC, IndexedDB save/load, vault PIN errato IT, print CSS.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import 'fake-indexeddb/auto';

import {
  DEFAULT_TIER,
  canAccessFeature,
  canAddResident,
  getMaxResidents,
} from '../src/lib/licensing';
import {
  VAULT_PIN_ERROR_MESSAGE,
  decryptVault,
  encryptVault,
  isVaultPinError,
} from '../src/lib/crypto-vault';
import { clearRunbook, loadRunbook, saveRunbook } from '../src/lib/storage';
import type { EncryptedVaultPayload } from '../src/types/domus';

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function record(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`PASS  ${name}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ name, ok: false, detail });
      console.error(`FAIL  ${name}: ${detail}`);
    }
  })();
}

await record('licensing: default tier is BASIC', () => {
  assert.equal(DEFAULT_TIER, 'BASIC');
});

await record('licensing: BASIC max 2 residents + gate flags', () => {
  assert.equal(getMaxResidents('BASIC'), 2);
  assert.equal(canAddResident('BASIC', 0), true);
  assert.equal(canAddResident('BASIC', 1), true);
  assert.equal(canAddResident('BASIC', 2), false);
  assert.equal(canAccessFeature('BASIC', 'allowLevel3Vault'), false);
  assert.equal(canAccessFeature('BASIC', 'allowCloudSync'), false);
  assert.equal(canAccessFeature('ADVANCED', 'allowLevel3Vault'), true);
});

await record('storage: IndexedDB save/load round-trip', async () => {
  await clearRunbook();
  const fresh = await loadRunbook();
  assert.equal(fresh.version, '1.0.0');
  assert.equal(fresh.tier, 'BASIC');
  fresh.level1_public.houseName = 'Casa Smoke Test';
  fresh.level1_public.wifi.ssid = 'DomuSafe-WiFi';
  const saved = await saveRunbook(fresh);
  assert.equal(saved.level1_public.houseName, 'Casa Smoke Test');
  const reloaded = await loadRunbook();
  assert.equal(reloaded.documentId, saved.documentId);
  assert.equal(reloaded.level1_public.houseName, 'Casa Smoke Test');
  assert.equal(reloaded.level1_public.wifi.ssid, 'DomuSafe-WiFi');
  await clearRunbook();
});

await record('vault: encrypt/decrypt + wrong PIN Italian error', async () => {
  const payload: EncryptedVaultPayload = {
    bankAccounts: [
      {
        institution: 'Banca Test',
        accountType: 'Corrente',
        ownershipDetails: 'Intestatario unico',
      },
    ],
    lifeInsurances: [],
    laborAndPension: {
      socialSecurityInstitution: 'INPS',
      tfrStorageLocation: 'IN_AZIENDA',
      hrContact: 'hr@example.com',
    },
    utilitiesLocations: {
      lastBillsFolderLocation: 'Cassetto ufficio',
      activeSubscriptionsToRevoke: [],
    },
    digitalLegacy: {
      appleLegacyContactActive: false,
      googleInactiveManagerActive: false,
      passwordManagerKitLocation: 'Cassaforte',
    },
  };

  const encrypted = await encryptVault(payload, '1234');
  const decrypted = await decryptVault(encrypted, '1234');
  assert.equal(decrypted.bankAccounts[0]?.institution, 'Banca Test');

  let caught: unknown;
  try {
    await decryptVault(encrypted, '0000');
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error, 'expected Error on wrong PIN');
  assert.equal((caught as Error).message, VAULT_PIN_ERROR_MESSAGE);
  assert.equal(VAULT_PIN_ERROR_MESSAGE, 'PIN errato o dati non validi');
  assert.equal(isVaultPinError(caught), true);
});

await record('print CSS: A4 + ice-privacy-flap present', () => {
  const printPath = resolve('src/styles/print.css');
  assert.equal(existsSync(printPath), true);
  const css = readFileSync(printPath, 'utf8');
  assert.match(css, /@media print/);
  assert.match(css, /size:\s*A4/);
  assert.match(css, /\.ice-privacy-flap/);
  assert.match(css, /PIEGA O SIGILLA/);
  assert.match(css, /\.no-print/);

  const globals = readFileSync(resolve('src/app/globals.css'), 'utf8');
  assert.match(globals, /print\.css/);
});

const failed = results.filter((r) => !r.ok);
console.log(`\nSmoke summary: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  process.exitCode = 1;
}
