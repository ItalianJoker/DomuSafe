/**
 * Smoke critico DomuSafe (Node 22 + fake-indexeddb).
 * Esegue: licensing, multi-casa, vault PIN, sync E2EE gate/invariants, print CSS.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import 'fake-indexeddb/auto';

import {
  DEFAULT_TIER,
  canAccessFeature,
  canAddHouse,
  canAddResident,
  getMaxHouses,
  getMaxResidents,
  resolveConfiguredTier,
  shouldShowPrintWatermark,
} from '../src/lib/licensing';
import {
  VAULT_PIN_ERROR_MESSAGE,
  decryptVault,
  encryptVault,
  isVaultPinError,
} from '../src/lib/crypto-vault';
import {
  SYNC_CREDENTIALS_ERROR_MESSAGE,
  buildPairingUrl,
  createSyncIdentity,
  decryptHouseCollection,
  encodePairingPayload,
  encryptHouseCollection,
  isSyncCredentialsError,
  parsePairingPayload,
} from '../src/lib/crypto-sync';
import {
  envelopeLooksEncrypted,
  writeEnvelope,
  readEnvelope,
} from '../src/lib/sync-server';
import {
  addHouse,
  clearRunbook,
  getActiveHouse,
  loadHouseCollection,
  loadRunbook,
  removeHouse,
  saveRunbook,
} from '../src/lib/storage';
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
  assert.equal(resolveConfiguredTier(undefined), 'BASIC');
  assert.equal(resolveConfiguredTier(''), 'BASIC');
  assert.equal(resolveConfiguredTier('nope'), 'BASIC');
  assert.equal(resolveConfiguredTier('advanced'), 'ADVANCED');
  assert.equal(resolveConfiguredTier('PREMIUM'), 'PREMIUM');
});

await record('licensing: BASIC max 2 residents + gate flags', () => {
  assert.equal(getMaxResidents('BASIC'), 2);
  assert.equal(canAddResident('BASIC', 0), true);
  assert.equal(canAddResident('BASIC', 1), true);
  assert.equal(canAddResident('BASIC', 2), false);
  assert.equal(canAccessFeature('BASIC', 'allowLevel3Vault'), false);
  assert.equal(canAccessFeature('BASIC', 'allowCloudSync'), false);
  assert.equal(canAccessFeature('ADVANCED', 'allowLevel3Vault'), true);
  assert.equal(canAccessFeature('ADVANCED', 'allowCloudSync'), true);
  assert.equal(canAccessFeature('PREMIUM', 'allowLevel3Vault'), true);
  assert.equal(canAccessFeature('PREMIUM', 'allowCloudSync'), true);
});

await record('licensing: ADVANCED houses ≤3 + unlimited ICE + no watermark', () => {
  assert.equal(getMaxHouses('BASIC'), 1);
  assert.equal(getMaxHouses('ADVANCED'), 3);
  assert.equal(canAddHouse('ADVANCED', 2), true);
  assert.equal(canAddHouse('ADVANCED', 3), false);
  assert.equal(canAddResident('ADVANCED', 99), true);
  assert.equal(Number.isFinite(getMaxResidents('ADVANCED')), false);
  assert.equal(shouldShowPrintWatermark('BASIC'), true);
  assert.equal(shouldShowPrintWatermark('ADVANCED'), false);
  assert.equal(shouldShowPrintWatermark('PREMIUM'), false);
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

await record('storage: multi-house ADVANCED limit + remove', async () => {
  await clearRunbook();
  let collection = await loadHouseCollection();
  assert.equal(collection.houses.length, 1);

  const second = await addHouse('ADVANCED');
  assert.ok(second);
  assert.equal(second!.houses.length, 2);

  const third = await addHouse('ADVANCED');
  assert.ok(third);
  assert.equal(third!.houses.length, 3);

  const blocked = await addHouse('ADVANCED');
  assert.equal(blocked, null);

  const basicBlocked = await addHouse('BASIC');
  assert.equal(basicBlocked, null);

  collection = (await removeHouse(third!.houses[2]!.documentId))!;
  assert.equal(collection.houses.length, 2);
  assert.ok(getActiveHouse(collection));

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

await record('ui modules: FeatureGate + Level3VaultPanel present', () => {
  assert.equal(existsSync(resolve('src/components/FeatureGate.tsx')), true);
  assert.equal(existsSync(resolve('src/components/Level3VaultPanel.tsx')), true);
  assert.equal(existsSync(resolve('src/components/HouseSwitcher.tsx')), true);
  const vaultUi = readFileSync(
    resolve('src/components/Level3VaultPanel.tsx'),
    'utf8'
  );
  assert.match(vaultUi, /PIN errato|VAULT_PIN_ERROR_MESSAGE/);
  assert.match(vaultUi, /encryptVault/);
  assert.match(vaultUi, /decryptVault/);
});

await record('sync: feature gate BASIC local-only / ADVANCED allowed', () => {
  assert.equal(canAccessFeature('BASIC', 'allowCloudSync'), false);
  assert.equal(canAccessFeature('ADVANCED', 'allowCloudSync'), true);
  const appUi = readFileSync(resolve('src/components/DomuSafeApp.tsx'), 'utf8');
  assert.match(appUi, /allowCloudSync/);
  assert.match(appUi, /CloudSyncPanel/);
  assert.match(appUi, /solo locale/);
  const syncUi = readFileSync(
    resolve('src/components/CloudSyncPanel.tsx'),
    'utf8'
  );
  assert.match(syncUi, /encryptHouseCollection/);
  assert.match(syncUi, /uploadSyncEnvelope/);
  assert.match(syncUi, /SYNC_CREDENTIALS_ERROR_MESSAGE/);
});

await record('sync: encrypt-before-upload invariant + wrong PIN', async () => {
  await clearRunbook();
  const collection = await loadHouseCollection();
  collection.houses[0]!.level1_public.houseName = 'Villa Segreta Sync';

  const { syncId, keyBytes } = createSyncIdentity();
  const { envelope, keyBytes: usedKey } = await encryptHouseCollection(
    collection,
    { revision: 1, keyBytes }
  );

  assert.equal(envelope.format, 'domusync-1');
  assert.equal(envelope.revision, 1);
  assert.equal(envelopeLooksEncrypted(envelope), true);
  assert.equal(envelope.ciphertextBase64.includes('Villa Segreta'), false);
  assert.equal(envelope.ciphertextBase64.includes('level1_public'), false);

  // Persistenza server: solo envelope (simula API PUT senza rete).
  const tmp = mkdtempSync(resolve(tmpdir(), 'domusafe-sync-'));
  process.env.DOMUSAFE_SYNC_DIR = tmp;
  const written = await writeEnvelope(syncId, envelope);
  assert.equal(written.ok, true);
  const stored = await readEnvelope(syncId);
  assert.ok(stored);
  assert.equal(stored!.ciphertextBase64, envelope.ciphertextBase64);
  const disk = readFileSync(resolve(tmp, `${syncId}.json`), 'utf8');
  assert.equal(disk.includes('Villa Segreta'), false);
  assert.equal(disk.includes('level1_public'), false);

  const roundTrip = await decryptHouseCollection(envelope, {
    keyBytes: usedKey,
  });
  assert.equal(
    roundTrip.houses[0]?.level1_public.houseName,
    'Villa Segreta Sync'
  );

  // PIN path + wrong credentials Italian message
  const pinSealed = await encryptHouseCollection(collection, {
    revision: 2,
    pin: 'sync-pin-ok',
  });
  assert.ok(pinSealed.envelope.saltBase64);
  const pinOk = await decryptHouseCollection(pinSealed.envelope, {
    pin: 'sync-pin-ok',
  });
  assert.equal(pinOk.houses[0]?.level1_public.houseName, 'Villa Segreta Sync');

  let caught: unknown;
  try {
    await decryptHouseCollection(pinSealed.envelope, { pin: 'wrong-pin' });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.equal((caught as Error).message, SYNC_CREDENTIALS_ERROR_MESSAGE);
  assert.equal(isSyncCredentialsError(caught), true);

  const newer = await writeEnvelope(syncId, { ...envelope, revision: 5 });
  assert.equal(newer.ok, true);
  const conflict = await writeEnvelope(syncId, {
    ...envelope,
    revision: 2,
  });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) {
    assert.equal(conflict.status, 409);
  }

  rmSync(tmp, { recursive: true, force: true });
  delete process.env.DOMUSAFE_SYNC_DIR;
  await clearRunbook();
});

await record('sync: QR pairing encode/decode + deep-link', () => {
  const { syncId, keyBytes } = createSyncIdentity();
  const token = encodePairingPayload(syncId, keyBytes);
  assert.match(token, /^ds1\.[a-f0-9]{64}\./u);
  const parsed = parsePairingPayload(token);
  assert.ok(parsed);
  assert.equal(parsed!.syncId, syncId);
  assert.equal(parsed!.keyBytes.length, 32);

  const url = buildPairingUrl('http://localhost:3000', syncId, keyBytes);
  assert.match(url, /^http:\/\/localhost:3000\/#ds1\./u);
  const fromUrl = parsePairingPayload(url);
  assert.ok(fromUrl);
  assert.equal(fromUrl!.syncId, syncId);

  assert.equal(parsePairingPayload('not-a-pairing'), null);
  assert.equal(existsSync(resolve('src/app/api/sync/[syncId]/route.ts')), true);
});

const failed = results.filter((r) => !r.ok);
console.log(`\nSmoke summary: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  process.exitCode = 1;
}
