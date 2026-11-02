/**
 * Smoke critico DomuSafe (Node 22).
 * Account filesystem (no IndexedDB), licensing Free→Premium + trial,
 * vault, sync E2EE family-scoped, custom fields Premium, checklists,
 * Premium pack: audit log, SOS provider, branding, inheritance kit,
 * PWA shell, Docker/self-host docs, copy piani IT.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  DEFAULT_TIER,
  canAccessFeature,
  canAddHouse,
  canAddResident,
  getMaxHouses,
  getMaxResidents,
  resolveConfiguredTier,
  resolveEffectiveTier,
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
  authenticateAccount,
  createFamilyOnServer,
  createInviteOnServer,
  acceptInviteOnServer,
  registerAccount,
  resetAppDataForTests,
  toPublicAccount,
  writeHousesBlob,
  readHousesBlob,
  writeSuccessionBlob,
  readSuccessionBlob,
  appendAuditEntry,
  readAuditLog,
  updateFamilyBranding,
  ensureFamilyScanToken,
  findFamilyByScanToken,
  hashIpForAudit,
} from '../src/lib/account-server';
import {
  dispatchSos,
  resolveSosProviderId,
} from '../src/lib/sos-provider';
import { accountCanAccess } from '../src/lib/premium-gate';
import {
  prepareRegistrationCrypto,
  encryptJsonAtRest,
  decryptJsonAtRest,
  unlockDataKeyFromAccount,
} from '../src/lib/crypto-auth';
import {
  createEmptyResidentTaxBlock,
  createDefaultSuccessionChecklist,
  TAX_CATALOG,
  ensureResidentTaxYear,
} from '../src/lib/checklist-defaults';
import {
  createInitialLicense,
  startPremiumTrial,
  isTrialActive,
  effectiveTierFromLicense,
  PREMIUM_TRIAL_MS,
  TRIAL_ALREADY_USED_MESSAGE,
} from '../src/lib/trial';
import { TIER_COPY, TIER_SUMMARY } from '../src/lib/tier-copy';
import type { EncryptedVaultPayload } from '../src/types/domus';
import type { DomusHouseCollection } from '../src/lib/storage';

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

const dataDir = mkdtempSync(resolve(tmpdir(), 'domusafe-app-'));
process.env.DOMUSAFE_DATA_DIR = dataDir;

await record('licensing: default tier is FREE', () => {
  assert.equal(DEFAULT_TIER, 'FREE');
  assert.equal(resolveConfiguredTier(undefined), 'FREE');
  assert.equal(resolveConfiguredTier('advanced'), 'ADVANCED');
  assert.equal(resolveConfiguredTier('premium'), 'PREMIUM');
});

await record('licensing: Free/Basic/Advanced/Premium gates', () => {
  assert.equal(canAccessFeature('FREE', 'allowLevel3Vault'), false);
  assert.equal(canAccessFeature('BASIC', 'allowLevel3Vault'), false);
  assert.equal(canAccessFeature('ADVANCED', 'allowLevel3Vault'), true);
  assert.equal(canAccessFeature('ADVANCED', 'allowCloudSync'), false);
  assert.equal(canAccessFeature('ADVANCED', 'allowCustomFields'), false);
  assert.equal(canAccessFeature('ADVANCED', 'allowPersonalPatrimonio'), false);
  assert.equal(canAccessFeature('ADVANCED', 'allowResidentTax'), false);
  assert.equal(canAccessFeature('ADVANCED', 'auditLog'), false);
  assert.equal(canAccessFeature('ADVANCED', 'allowSmsAlerts'), false);
  assert.equal(canAccessFeature('ADVANCED', 'customBranding'), false);
  assert.equal(canAccessFeature('PREMIUM', 'allowCloudSync'), true);
  assert.equal(canAccessFeature('PREMIUM', 'allowCustomFields'), true);
  assert.equal(canAccessFeature('PREMIUM', 'allowResidentTax'), true);
  assert.equal(canAccessFeature('PREMIUM', 'allowSuccessionChecklist'), true);
  assert.equal(canAccessFeature('PREMIUM', 'allowPersonalPatrimonio'), true);
  assert.equal(canAccessFeature('PREMIUM', 'auditLog'), true);
  assert.equal(canAccessFeature('PREMIUM', 'allowSmsAlerts'), true);
  assert.equal(canAccessFeature('PREMIUM', 'customBranding'), true);
  assert.equal(canAddHouse('ADVANCED', 3), false);
  assert.equal(canAddResident('FREE', 1), false);
  assert.equal(canAddResident('BASIC', 2), true);
  assert.equal(getMaxHouses('PREMIUM'), 999);
  assert.equal(getMaxResidents('FREE'), 1);
  assert.equal(Number.isFinite(getMaxResidents('BASIC')), false);
  assert.equal(shouldShowPrintWatermark('FREE'), true);
  assert.equal(shouldShowPrintWatermark('BASIC'), true);
  assert.equal(shouldShowPrintWatermark('ADVANCED'), false);
  assert.equal(shouldShowPrintWatermark('PREMIUM'), false);
  assert.equal(
    accountCanAccess(createInitialLicense('FREE'), 'auditLog'),
    false
  );
  assert.equal(
    accountCanAccess(
      { baseTier: 'PREMIUM', trialUsed: false },
      'customBranding'
    ),
    true
  );
});
await record('trial: 30-day Premium once per account', () => {
  let license = createInitialLicense('FREE');
  assert.equal(effectiveTierFromLicense(license), 'FREE');
  assert.equal(resolveEffectiveTier(license), 'FREE');
  license = startPremiumTrial(license, 1_000_000);
  assert.equal(isTrialActive(license, 1_000_000), true);
  assert.equal(effectiveTierFromLicense(license, 1_000_000), 'PREMIUM');
  assert.equal(canAccessFeature('PREMIUM', 'allowCustomFields'), true);
  assert.equal(
    effectiveTierFromLicense(license, 1_000_000 + PREMIUM_TRIAL_MS + 1),
    'FREE'
  );
  let caught: unknown;
  try {
    startPremiumTrial(license, 1_000_000 + PREMIUM_TRIAL_MS + 2);
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof Error);
  assert.equal((caught as Error).message, TRIAL_ALREADY_USED_MESSAGE);
});

await record('account server: register/login/family/invite (filesystem)', async () => {
  await resetAppDataForTests();
  const cryptoMaterial = await prepareRegistrationCrypto('password-ok-12');
  const account = await registerAccount({
    email: 'owner@example.it',
    password: 'password-ok-12',
    displayName: 'Luca',
    dataKeySaltBase64: cryptoMaterial.dataKeySaltBase64,
    wrappedDataKeyBase64: cryptoMaterial.wrappedDataKeyBase64,
    wrappedDataKeyIvBase64: cryptoMaterial.wrappedDataKeyIvBase64,
  });
  assert.equal(account.email, 'owner@example.it');
  assert.equal(account.license.baseTier, 'FREE');
  const pub = toPublicAccount(account);
  assert.equal('passwordHashHex' in pub, false);

  const authed = await authenticateAccount('owner@example.it', 'password-ok-12');
  assert.equal(authed.accountId, account.accountId);

  let loginFail: unknown;
  try {
    await authenticateAccount('owner@example.it', 'wrong-password');
  } catch (e) {
    loginFail = e;
  }
  assert.ok(loginFail instanceof Error);

  const family = await createFamilyOnServer({
    name: 'Famiglia Test',
    ownerAccountId: account.accountId,
    ownerEmail: account.email,
    ownerDisplayName: account.displayName,
  });
  assert.equal(family.members.length, 1);

  const { inviteCode } = await createInviteOnServer({
    familyId: family.familyId,
    createdByAccountId: account.accountId,
  });
  assert.match(inviteCode, /^df1\./);

  const memberCrypto = await prepareRegistrationCrypto('member-pass-99');
  const member = await registerAccount({
    email: 'member@example.it',
    password: 'member-pass-99',
    displayName: 'Anna',
    dataKeySaltBase64: memberCrypto.dataKeySaltBase64,
    wrappedDataKeyBase64: memberCrypto.wrappedDataKeyBase64,
    wrappedDataKeyIvBase64: memberCrypto.wrappedDataKeyIvBase64,
  });
  const joined = await acceptInviteOnServer({
    inviteCode,
    accountId: member.accountId,
    email: member.email,
    displayName: member.displayName,
  });
  assert.equal(joined.members.length, 2);
  assert.ok(family.scanToken);
  const byToken = await findFamilyByScanToken(family.scanToken!);
  assert.equal(byToken?.familyId, family.familyId);

  const dataKey = await unlockDataKeyFromAccount('password-ok-12', {
    dataKeySaltBase64: account.dataKeySaltBase64,
    wrappedDataKeyBase64: account.wrappedDataKeyBase64,
    wrappedDataKeyIvBase64: account.wrappedDataKeyIvBase64,
  });
  const collection: DomusHouseCollection = {
    version: '1.0.0',
    familyId: family.familyId,
    activeDocumentId: 'house-1',
    houses: [
      {
        version: '1.0.0',
        documentId: 'house-1',
        updatedAt: new Date().toISOString(),
        tier: 'FREE',
        level1_public: {
          houseName: 'Casa Segreta',
          utilities: {
            waterCutoff: { location: '', instructions: '' },
            gasCutoff: { location: '', instructions: '' },
            electricPanel: {
              breakerLocation: '',
              externalMeterLocation: '',
            },
            heatingBoiler: { location: '' },
          },
          wifi: { ssid: 'x', password: 'y' },
          wasteSchedule: [],
          artisanContacts: [],
        },
        level2_ice: { residents: [], pets: [] },
      },
    ],
  };
  const sealed = await encryptJsonAtRest(collection, dataKey);
  await writeHousesBlob(family.familyId, {
    version: 'enc-1',
    ...sealed,
    updatedAt: new Date().toISOString(),
  });
  const stored = await readHousesBlob(family.familyId);
  assert.ok(stored);
  assert.equal(stored!.ciphertextBase64.includes('Casa Segreta'), false);
  const roundTrip = await decryptJsonAtRest<DomusHouseCollection>(
    stored!,
    dataKey
  );
  assert.equal(roundTrip.houses[0]?.level1_public.houseName, 'Casa Segreta');

  const succession = createDefaultSuccessionChecklist(family.familyId);
  const succSealed = await encryptJsonAtRest(succession, dataKey);
  await writeSuccessionBlob(family.familyId, {
    version: 'enc-1',
    ...succSealed,
    updatedAt: new Date().toISOString(),
  });
  const succStored = await readSuccessionBlob(family.familyId);
  assert.ok(succStored);
  const succPlain = await decryptJsonAtRest<typeof succession>(
    succStored!,
    dataKey
  );
  assert.equal(succPlain.familyId, family.familyId);
  assert.ok(succPlain.items.length >= 5);
});

await record('checklists: tax on residente + succession Famiglia', () => {
  const tax = createEmptyResidentTaxBlock(2026);
  assert.equal(tax.years[0]?.year, 2026);
  assert.equal(tax.years[0]?.items.length, TAX_CATALOG.length);
  const nextYear = ensureResidentTaxYear(tax, 2027);
  assert.ok(nextYear.years.some((y) => y.year === 2027));
  const succ = createDefaultSuccessionChecklist('fam-1');
  assert.equal(succ.familyId, 'fam-1');
  assert.ok(succ.items.some((i) => i.category === 'WILL'));
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
    customFields: [{ id: 'cf1', label: 'Nota libera', value: 'solo Premium' }],
  };
  const encrypted = await encryptVault(payload, '1234');
  const decrypted = await decryptVault(encrypted, '1234');
  assert.equal(decrypted.bankAccounts[0]?.institution, 'Banca Test');
  assert.equal(decrypted.customFields?.[0]?.label, 'Nota libera');
  let caught: unknown;
  try {
    await decryptVault(encrypted, '0000');
  } catch (error) {
    caught = error;
  }
  assert.equal((caught as Error).message, VAULT_PIN_ERROR_MESSAGE);
  assert.equal(isVaultPinError(caught), true);
});

await record('print CSS + branding + responsive shell assets', () => {
  const printPath = resolve('src/styles/print.css');
  assert.equal(existsSync(printPath), true);
  const css = readFileSync(printPath, 'utf8');
  assert.match(css, /@media print/);
  assert.match(css, /\.ice-privacy-flap/);
  const globals = readFileSync(resolve('src/app/globals.css'), 'utf8');
  assert.match(globals, /--brand-ink/);
  assert.match(globals, /print\.css/);
  assert.match(globals, /safe-area-inset/);
  assert.match(globals, /app-shell-main/);
  assert.equal(existsSync(resolve('public/domusafe-logo.svg')), true);
  assert.equal(existsSync(resolve('src/components/DomuSafeLogo.tsx')), true);
  assert.equal(
    existsSync(resolve('src/components/CustomFieldsEditor.tsx')),
    true
  );
});

await record('ui: auth gate + manuale + license + tax/succession modules', () => {
  assert.equal(existsSync(resolve('src/components/AuthScreen.tsx')), true);
  assert.equal(existsSync(resolve('src/components/ManualeUtente.tsx')), true);
  assert.equal(existsSync(resolve('src/components/LicensePanel.tsx')), true);
  assert.equal(
    existsSync(resolve('src/components/ResidentTaxChecklist.tsx')),
    true
  );
  assert.equal(
    existsSync(resolve('src/components/SuccessionChecklistPanel.tsx')),
    true
  );
  assert.equal(existsSync(resolve('src/lib/account-server.ts')), true);
  const app = readFileSync(resolve('src/components/DomuSafeApp.tsx'), 'utf8');
  assert.match(app, /SessionProvider/);
  assert.match(app, /allowLevel3Vault/);
  assert.match(app, /allowCloudSync/);
  assert.match(app, /allowCustomFields|allowSuccessionChecklist/);
  assert.match(app, /auditLog/);
  assert.match(app, /allowSmsAlerts/);
  assert.match(app, /customBranding/);
  assert.match(app, /InheritanceKitPanel/);
  assert.match(app, /md:hidden/);
  assert.match(app, /AppTabs/);
  assert.equal(
    existsSync(resolve('src/app/api/auth/register/route.ts')),
    true
  );
  const storage = readFileSync(resolve('src/lib/storage.ts'), 'utf8');
  assert.equal(storage.includes('idb-keyval'), false);
  assert.equal(storage.includes('indexedDB'), false);
  const authClient = readFileSync(resolve('src/lib/auth-client.ts'), 'utf8');
  assert.equal(authClient.includes('idb-keyval'), false);
  const readme = readFileSync(resolve('README.md'), 'utf8');
  assert.match(readme, /telefono/i);
  assert.match(readme, /BSL 1\.1|Business Source License/i);
  assert.match(readme, /Use Limitation|Non consentito/i);
  assert.match(readme, /registro accessi|Registro accessi/i);
  assert.match(readme, /I piani, spiegati con chiarezza/);
  assert.match(readme, /\*\*Free\*\*/);
  assert.match(readme, /\*\*Basic\*\*/);
  assert.match(readme, /\*\*Advanced\*\*/);
  assert.match(readme, /\*\*Premium\*\*/);
  assert.match(readme, /Watermark/);
  assert.match(readme, /Privacy/);
  assert.match(readme, /SELF-HOST\.md/);
  assert.match(readme, /PWA/);
  // README prodotto IT: niente one-liner EN, niente deploy-first
  assert.equal(readme.includes('Your home handbook'), false);
  assert.equal(readme.toLowerCase().includes('docker run'), false);
  assert.equal(readme.toLowerCase().includes('pnpm'), false);
  assert.equal(readme.includes('DOMUSAFE_SOS_PROVIDER'), false);
  const selfHost = readFileSync(resolve('SELF-HOST.md'), 'utf8');
  assert.match(selfHost, /Dockerfile/);
  assert.match(selfHost, /DOMUSAFE_SOS_PROVIDER/);
  assert.match(selfHost, /ghcr\.io/);
  assert.equal(existsSync(resolve('docker-compose.yml')), true);
  assert.equal(existsSync(resolve('Dockerfile')), true);
  const license = readFileSync(resolve('LICENSE.md'), 'utf8');
  assert.match(license, /Business Source License 1\.1/);
  assert.match(license, /Use Limitation/);
  assert.match(license, /36 months/);
  assert.equal(existsSync(resolve('LICENSE')), true);
  const manuale = readFileSync(
    resolve('src/components/ManualeUtente.tsx'),
    'utf8'
  );
  assert.match(manuale, /Piani: Free, Basic, Advanced, Premium/);
  assert.match(manuale, /Prova Premium/);
  assert.match(manuale, /Installare DomuSafe sul telefono/);
});

await record('tier copy: Free→Premium IT clarity', () => {
  assert.match(TIER_COPY.FREE.audience, /iniziare/i);
  assert.ok(TIER_COPY.FREE.includes.some((l) => /Watermark/i.test(l)));
  assert.ok(TIER_COPY.FREE.limits.some((l) => /Cassaforte/i.test(l)));
  assert.ok(TIER_COPY.BASIC.includes.some((l) => /illimitat/i.test(l)));
  assert.ok(
    TIER_COPY.ADVANCED.includes.some((l) => /Cassaforte|Famiglia/i.test(l))
  );
  assert.ok(
    TIER_COPY.ADVANCED.limits.some((l) => /tasse|patrimoniali|sync/i.test(l))
  );
  assert.equal(TIER_COPY.PREMIUM.limits.length, 0);
  assert.ok(
    TIER_COPY.PREMIUM.includes.some((l) => /personalizzat/i.test(l))
  );
  assert.match(TIER_SUMMARY.FREE, /Watermark/);
  assert.match(TIER_SUMMARY.PREMIUM, /Tutto/);
  const panel = readFileSync(
    resolve('src/components/LicensePanel.tsx'),
    'utf8'
  );
  assert.match(panel, /TIER_COPY/);
  assert.match(panel, /Confronta i piani/);
});

await record('pwa: manifest + icons + offline shell + register', () => {
  assert.equal(existsSync(resolve('public/manifest.webmanifest')), true);
  assert.equal(existsSync(resolve('public/sw.js')), true);
  assert.equal(existsSync(resolve('public/offline.html')), true);
  assert.equal(existsSync(resolve('public/icons/icon-192.png')), true);
  assert.equal(existsSync(resolve('public/icons/icon-512.png')), true);
  assert.equal(existsSync(resolve('public/icons/maskable-512.png')), true);
  assert.equal(existsSync(resolve('public/icons/apple-touch-icon.png')), true);
  assert.equal(existsSync(resolve('src/components/PwaRegister.tsx')), true);
  const manifest = readFileSync(
    resolve('public/manifest.webmanifest'),
    'utf8'
  );
  assert.match(manifest, /"name": "DomuSafe"/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /icon-512\.png/);
  const sw = readFileSync(resolve('public/sw.js'), 'utf8');
  assert.match(sw, /domusafe-shell/);
  assert.match(sw, /\/api\//);
  assert.match(sw, /offline\.html/);
  const layout = readFileSync(resolve('src/app/layout.tsx'), 'utf8');
  assert.match(layout, /manifest\.webmanifest/);
  assert.match(layout, /PwaRegister/);
  assert.equal(existsSync(resolve('.github/workflows/ghcr.yml')), true);
  const ghcr = readFileSync(resolve('.github/workflows/ghcr.yml'), 'utf8');
  assert.match(ghcr, /ghcr\.io/);
  assert.match(ghcr, /packages: write/);
});

await record('premium pack: audit + SOS provider + branding + kit assets', async () => {
  await resetAppDataForTests();
  assert.equal(resolveSosProviderId(undefined), 'log');
  assert.equal(resolveSosProviderId('webhook'), 'webhook');
  assert.equal(resolveSosProviderId('twilio'), 'twilio');

  const sos = await dispatchSos({
    familyId: 'fam-sos',
    message: 'Prova SOS DomuSafe',
    channels: ['sms', 'whatsapp'],
    recipients: [
      { name: 'Mario', phoneNumber: '+39 333 1112233', relationship: 'Figlio' },
    ],
    dryRun: true,
  });
  assert.equal(sos.provider, 'log');
  assert.equal(sos.dryRun, true);
  assert.ok(sos.details.length >= 2);

  const cryptoMaterial = await prepareRegistrationCrypto('premium-pack-12');
  const account = await registerAccount({
    email: 'premium@example.it',
    password: 'premium-pack-12',
    displayName: 'Host',
    dataKeySaltBase64: cryptoMaterial.dataKeySaltBase64,
    wrappedDataKeyBase64: cryptoMaterial.wrappedDataKeyBase64,
    wrappedDataKeyIvBase64: cryptoMaterial.wrappedDataKeyIvBase64,
  });
  const family = await createFamilyOnServer({
    name: 'Famiglia Premium',
    ownerAccountId: account.accountId,
    ownerEmail: account.email,
    ownerDisplayName: account.displayName,
  });
  assert.ok(family.scanToken);
  const ensured = await ensureFamilyScanToken(family.familyId);
  assert.equal(ensured.scanToken, family.scanToken);

  const log1 = await appendAuditEntry(family.familyId, {
    kind: 'SCAN',
    actorLabel: 'Ospite · TestUA',
    houseName: 'Casa Rosa',
    ipHash: hashIpForAudit('203.0.113.10'),
  });
  assert.equal(log1.entries.length, 1);
  assert.equal(log1.entries[0]?.kind, 'SCAN');
  const log2 = await readAuditLog(family.familyId);
  assert.equal(log2.entries[0]?.houseName, 'Casa Rosa');

  const branded = await updateFamilyBranding(family.familyId, {
    hostDisplayName: 'Casa Rosa Host',
    accentColor: '#1a5c3a',
    tagline: 'Benvenuti',
  });
  assert.equal(branded.branding?.hostDisplayName, 'Casa Rosa Host');
  const cleared = await updateFamilyBranding(family.familyId, null);
  assert.equal(cleared.branding, undefined);

  assert.equal(existsSync(resolve('src/components/AuditLogPanel.tsx')), true);
  assert.equal(existsSync(resolve('src/components/SosAlertsPanel.tsx')), true);
  assert.equal(existsSync(resolve('src/components/BrandingPanel.tsx')), true);
  assert.equal(
    existsSync(resolve('src/components/InheritanceKitPanel.tsx')),
    true
  );
  assert.equal(existsSync(resolve('src/lib/sos-provider.ts')), true);
  assert.equal(existsSync(resolve('src/app/api/sos/route.ts')), true);
  assert.equal(
    existsSync(resolve('src/app/api/family/[familyId]/audit/route.ts')),
    true
  );
  assert.equal(
    existsSync(resolve('src/app/api/family/[familyId]/branding/route.ts')),
    true
  );
  assert.equal(existsSync(resolve('src/app/s/[token]/page.tsx')), true);
  const printCss = readFileSync(resolve('src/styles/print.css'), 'utf8');
  assert.match(printCss, /inheritance-kit/);
  assert.match(printCss, /print-inheritance-only/);
});

await record('sync: E2EE family-scoped envelope + QR pairing', async () => {
  const familyId = 'fam-sync-1';
  const collection: DomusHouseCollection = {
    version: '1.0.0',
    familyId,
    activeDocumentId: 'h1',
    houses: [
      {
        version: '1.0.0',
        documentId: 'h1',
        updatedAt: new Date().toISOString(),
        tier: 'PREMIUM',
        level1_public: {
          houseName: 'Villa Segreta Sync',
          utilities: {
            waterCutoff: { location: '', instructions: '' },
            gasCutoff: { location: '', instructions: '' },
            electricPanel: {
              breakerLocation: '',
              externalMeterLocation: '',
            },
            heatingBoiler: { location: '' },
          },
          wifi: { ssid: '', password: '' },
          wasteSchedule: [],
          artisanContacts: [],
          customFields: [
            { id: 'x', label: 'Allarme', value: '1234' },
          ],
        },
        level2_ice: { residents: [], pets: [] },
      },
    ],
  };
  const { syncId, keyBytes } = createSyncIdentity();
  const { envelope, keyBytes: usedKey } = await encryptHouseCollection(
    collection,
    { revision: 1, familyId, keyBytes }
  );
  assert.equal(envelope.familyId, familyId);
  assert.equal(envelopeLooksEncrypted(envelope), true);
  const tmp = mkdtempSync(resolve(tmpdir(), 'domusafe-sync-'));
  process.env.DOMUSAFE_SYNC_DIR = tmp;
  const written = await writeEnvelope(syncId, envelope);
  assert.equal(written.ok, true);
  const stored = await readEnvelope(syncId);
  assert.ok(stored);
  assert.equal(stored!.familyId, familyId);
  const disk = readFileSync(resolve(tmp, `${syncId}.json`), 'utf8');
  assert.equal(disk.includes('Villa Segreta'), false);
  const roundTrip = await decryptHouseCollection(envelope, {
    keyBytes: usedKey,
  });
  assert.equal(
    roundTrip.houses[0]?.level1_public.houseName,
    'Villa Segreta Sync'
  );
  assert.equal(
    roundTrip.houses[0]?.level1_public.customFields?.[0]?.label,
    'Allarme'
  );
  const pinSealed = await encryptHouseCollection(collection, {
    revision: 2,
    familyId,
    pin: 'sync-pin-ok',
  });
  let caught: unknown;
  try {
    await decryptHouseCollection(pinSealed.envelope, { pin: 'wrong-pin' });
  } catch (error) {
    caught = error;
  }
  assert.equal((caught as Error).message, SYNC_CREDENTIALS_ERROR_MESSAGE);
  assert.equal(isSyncCredentialsError(caught), true);
  const token = encodePairingPayload(syncId, keyBytes);
  assert.match(token, /^ds1\./);
  assert.ok(parsePairingPayload(token));
  assert.match(
    buildPairingUrl('http://localhost:3000', syncId, keyBytes),
    /#ds1\./
  );
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.DOMUSAFE_SYNC_DIR;
});

rmSync(dataDir, { recursive: true, force: true });
delete process.env.DOMUSAFE_DATA_DIR;

const failed = results.filter((r) => !r.ok);
console.log(
  `\nSmoke summary: ${results.length - failed.length}/${results.length} passed`
);
if (failed.length > 0) {
  process.exitCode = 1;
}
