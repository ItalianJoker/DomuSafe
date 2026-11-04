import { randomUUID } from 'node:crypto';
import {
  createAccountKeys,
  derivePinVerifier,
  fromBase64Url,
  generateDeviceKey,
  generateScopeKey,
  grantScopeKey,
  openRecord,
  openScopeKeyGrant,
  openVaultPrivateKey,
  openVaultPrivateKeyWithRecovery,
  PIN_KDF_PARAMS,
  prepareVaultPin,
  recoverWithPhrase,
  sealRecord,
  toBase64Url,
  uuidv7,
  wrapAccountKeyForDevice,
  type AccountKeySecrets,
  type VaultPinSetup,
} from '@domusafe/crypto';
import type { ProblemDetails, VaultItem } from '@domusafe/contracts';
import { formatEtag } from '@domusafe/contracts';
import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, type TestApp } from './helpers.js';

const PASSWORD = 'una-password-lunga-42';
const CODE = 'casa-tigli';
const NEW_CODE = 'casa-olivi';
const INSTITUTION = 'Banca dei tigli';

let ctx: TestApp;
let admin: pg.Pool;
let alice: Client;
let child: Client;
let aliceId: string;
let familyId: string;
let secrets: AccountKeySecrets;
let firstPin: VaultPinSetup;

function problem(response: LightMyRequestResponse): ProblemDetails {
  return response.json<ProblemDetails>();
}

function itemsUrl(): string {
  return `/api/v1/families/${familyId}/vault/items`;
}

async function send(
  client: Client,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<LightMyRequestResponse> {
  return client.request(method, url, {
    ...(body === undefined ? {} : { body }),
    headers: { 'idempotency-key': randomUUID(), ...headers },
  });
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  child = new Client(ctx.app);
  aliceId = await alice.signUp('Alice Rossi', 'alice-vault@example.test', PASSWORD);
  const childId = await child.signUp('Chiara Rossi', 'chiara-vault@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Rossi',
    firstHouse: { name: 'Casa di città' },
  });
  expect(created.statusCode).toBe(201);
  familyId = created.json<{ family: { id: string } }>().family.id;
  await admin.query(`insert into memberships (family_id, account_id, role) values ($1, $2, 'child')`, [
    familyId,
    childId,
  ]);
});

afterAll(async () => {
  await admin.end();
  await ctx.close();
});

describe('family vault', () => {
  it('keeps Free and a child out before any document is stored', async () => {
    const body = {
      id: uuidv7(),
      section: 'family_accounts',
      sealed: {
        scopeId: uuidv7(),
        keyVersion: 1,
        dek: toBase64Url(Uint8Array.of(1, ...new Uint8Array(40))),
        payload: toBase64Url(Uint8Array.of(1, ...new Uint8Array(40))),
      },
    };
    const free = await alice.create(itemsUrl(), body);
    expect(free.statusCode).toBe(403);
    expect(problem(free).code).toBe('plan_required');
    expect(problem(free).requiredPlan).toBe('advanced');
    const denied = await child.create(itemsUrl(), { ...body, id: uuidv7() });
    expect(denied.statusCode).toBe(403);
    expect(problem(denied).code).toBe('forbidden');
  });

  it('stores ciphertext and opens it with the code or the recovery phrase', async () => {
    await admin.query(`update families set plan = 'advanced' where id = $1`, [familyId]);
    const createdKeys = await createAccountKeys(aliceId);
    secrets = createdKeys.secrets;
    const stored = await send(alice, 'PUT', '/api/v1/me/keys', {
      publicKey: toBase64Url(createdKeys.bundle.publicKey),
      wrappedPrivateKey: toBase64Url(createdKeys.bundle.wrappedPrivateKey),
      recoveryPublicKey: toBase64Url(createdKeys.bundle.recoveryPublicKey),
      recoveryWrappedPrivateKey: toBase64Url(createdKeys.bundle.recoveryWrappedPrivateKey),
      recoveryWrappedAccountKey: toBase64Url(createdKeys.bundle.recoveryWrappedAccountKey),
      recoveryVerifierSha256: toBase64Url(createdKeys.bundle.recoveryVerifierSha256),
      fingerprint: createdKeys.bundle.fingerprint.join(' '),
    });
    expect(stored.statusCode).toBe(200);
    expect(stored.json()).not.toHaveProperty('recoveryWrappedAccountKey');

    const deviceKey = await generateDeviceKey();
    const deviceId = uuidv7();
    const wrappedAccountKey = await wrapAccountKeyForDevice(deviceKey, secrets.accountKey, aliceId, deviceId);
    const device = await send(alice, 'POST', '/api/v1/me/devices', {
      id: deviceId,
      label: 'Questo browser',
      platform: 'linux',
      wrappedAccountKey: toBase64Url(wrappedAccountKey),
      pairedVia: 'signup',
    });
    expect(device.statusCode).toBe(201);

    const prepared = await prepareVaultPin({
      accountId: aliceId,
      accountKey: secrets.accountKey,
      pin: CODE,
      recoveryPublicKey: createdKeys.bundle.recoveryPublicKey,
      pinGeneration: 1,
    });
    firstPin = prepared.setup;
    const pin = await send(alice, 'PUT', '/api/v1/me/vault-pin', {
      salt: toBase64Url(firstPin.salt),
      kdf: firstPin.kdf,
      verifier: toBase64Url(firstPin.verifier),
      serverShare: toBase64Url(firstPin.serverShare),
      wrappedVaultPrivateKey: toBase64Url(firstPin.wrappedVaultPrivateKey),
      pinGeneration: firstPin.pinGeneration,
      vaultPublicKey: toBase64Url(firstPin.vaultPublicKey),
      recoverySealedVaultKey: toBase64Url(firstPin.recoverySealedVaultKey),
    });
    expect(pin.statusCode).toBe(200);
    expect(pin.json()).toMatchObject({ state: 'active', remainingAttempts: 5 });

    const status = await alice.request('GET', '/api/v1/me/vault-pin');
    const salt = fromBase64Url(status.json<{ salt: string }>().salt);
    const wrong = await derivePinVerifier('codice-errato', salt, PIN_KDF_PARAMS);
    const rejected = await alice.request('POST', '/api/v1/me/vault-pin/unlock', {
      body: { verifier: toBase64Url(wrong) },
    });
    expect(rejected.statusCode).toBe(401);
    expect(problem(rejected)).toMatchObject({ code: 'pin_invalid', remainingAttempts: 4 });

    await pause(2100);
    const opened = await alice.request('POST', '/api/v1/me/vault-pin/unlock', {
      body: { verifier: toBase64Url(firstPin.verifier) },
    });
    expect(opened.statusCode).toBe(200);
    const unlocked = opened.json<{ serverShare: string; pinGeneration: number }>();
    const vaultPrivateKey = await openVaultPrivateKey({
      accountId: aliceId,
      accountKey: secrets.accountKey,
      serverShare: fromBase64Url(unlocked.serverShare),
      wrappedVaultPrivateKey: firstPin.wrappedVaultPrivateKey,
      pinGeneration: unlocked.pinGeneration,
    });
    const scopeId = uuidv7();
    const scopeKey = generateScopeKey();
    const grant = await grantScopeKey({
      scopeId,
      version: 1,
      scopeKey,
      grantee: 'vault',
      granteeId: aliceId,
      granteePublicKey: firstPin.vaultPublicKey,
    });
    const scope = await send(alice, 'PUT', `/api/v1/families/${familyId}/vault/scope`, {
      scopeId,
      grant: toBase64Url(grant),
    });
    expect(scope.statusCode).toBe(200);
    const granted = fromBase64Url(scope.json<{ grant: string }>().grant);
    expect(
      await openScopeKeyGrant({
        grantBlob: granted,
        scopeId,
        version: 1,
        grantee: 'vault',
        granteeId: aliceId,
        privateKey: vaultPrivateKey,
        publicKey: firstPin.vaultPublicKey,
      }),
    ).toEqual(scopeKey);

    const itemId = uuidv7();
    const payload = {
      schema: 1 as const,
      institution: INSTITUTION,
      relationship: 'current_account' as const,
      holder: 'Famiglia Rossi',
      referenceHint: '4321',
    };
    const sealed = await sealRecord({
      table: 'vault_items',
      recordId: itemId,
      version: 1,
      scopeId,
      scopeVersion: 1,
      scopeKey,
      payload,
    });
    const created = await send(alice, 'POST', itemsUrl(), {
      id: itemId,
      section: 'family_accounts',
      sealed: {
        scopeId: sealed.scopeId,
        keyVersion: sealed.keyVersion,
        dek: toBase64Url(sealed.dek),
        payload: toBase64Url(sealed.payload),
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain(INSTITUTION);
    const item = created.json<VaultItem>();
    expect(
      await openRecord({
        table: 'vault_items',
        recordId: itemId,
        version: 1,
        scopeKey,
        sealed: {
          scopeId: item.sealed.scopeId,
          keyVersion: item.sealed.keyVersion,
          dek: fromBase64Url(item.sealed.dek),
          payload: fromBase64Url(item.sealed.payload),
        },
      }),
    ).toEqual(payload);

    const locked = await alice.request('POST', '/api/v1/me/vault-pin/lock');
    expect(locked.statusCode).toBe(204);
    const closed = await alice.request('GET', itemsUrl());
    expect(closed.statusCode).toBe(423);
    expect(problem(closed).code).toBe('vault_locked');

    await admin.query(
      `update account_pins set failed_attempts = 5, locked_at = now() where account_id = $1`,
      [aliceId],
    );
    await pause(2100);
    const blocked = await alice.request('POST', '/api/v1/me/vault-pin/unlock', {
      body: { verifier: toBase64Url(firstPin.verifier) },
    });
    expect(blocked.statusCode).toBe(423);
    expect(problem(blocked).code).toBe('pin_locked');

    const keys = await alice.request('GET', '/api/v1/me/keys');
    const ready = keys.json<{
      recoverySealedVaultKey: string;
      recoveryPublicKey: string;
      vaultPublicKey: string;
    }>();
    const recovered = await recoverWithPhrase(
      secrets.recoveryPhrase,
      {
        recoveryWrappedAccountKey: createdKeys.bundle.recoveryWrappedAccountKey,
        recoveryWrappedPrivateKey: createdKeys.bundle.recoveryWrappedPrivateKey,
      },
      aliceId,
    );
    const recoveredVaultKey = await openVaultPrivateKeyWithRecovery({
      recoveryPrivateKey: recovered.recoveryPrivateKey,
      recoveryPublicKey: fromBase64Url(ready.recoveryPublicKey),
      recoverySealedVaultKey: fromBase64Url(ready.recoverySealedVaultKey),
      accountId: aliceId,
    });
    const replacement = await prepareVaultPin({
      accountId: aliceId,
      accountKey: recovered.accountKey,
      pin: NEW_CODE,
      recoveryPublicKey: fromBase64Url(ready.recoveryPublicKey),
      pinGeneration: 2,
      existingVaultPrivateKey: recoveredVaultKey,
      existingVaultPublicKey: fromBase64Url(ready.vaultPublicKey),
    });
    const reset = await send(alice, 'POST', '/api/v1/me/vault-pin/reset', {
      salt: toBase64Url(replacement.setup.salt),
      kdf: replacement.setup.kdf,
      verifier: toBase64Url(replacement.setup.verifier),
      serverShare: toBase64Url(replacement.setup.serverShare),
      wrappedVaultPrivateKey: toBase64Url(replacement.setup.wrappedVaultPrivateKey),
      pinGeneration: 2,
      recoveryVerifier: toBase64Url(recovered.verifier),
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toMatchObject({ state: 'active', pinGeneration: 2, remainingAttempts: 5 });

    await pause(2100);
    const again = await alice.request('POST', '/api/v1/me/vault-pin/unlock', {
      body: { verifier: toBase64Url(replacement.setup.verifier) },
    });
    expect(again.statusCode).toBe(200);
    const second = again.json<{ serverShare: string; pinGeneration: number }>();
    const reopened = await openVaultPrivateKey({
      accountId: aliceId,
      accountKey: recovered.accountKey,
      serverShare: fromBase64Url(second.serverShare),
      wrappedVaultPrivateKey: replacement.setup.wrappedVaultPrivateKey,
      pinGeneration: second.pinGeneration,
    });
    const scopeKeyAgain = await openScopeKeyGrant({
      grantBlob: granted,
      scopeId,
      version: 1,
      grantee: 'vault',
      granteeId: aliceId,
      privateKey: reopened,
      publicKey: fromBase64Url(ready.vaultPublicKey),
    });
    const listed = await alice.request('GET', `${itemsUrl()}?section=family_accounts`);
    expect(listed.statusCode).toBe(200);
    const page = listed.json<{ items: VaultItem[] }>();
    expect(page.items).toHaveLength(1);
    expect(JSON.stringify(page)).not.toContain(INSTITUTION);
    expect(
      await openRecord({
        table: 'vault_items',
        recordId: itemId,
        version: page.items[0]!.version,
        scopeKey: scopeKeyAgain,
        sealed: {
          scopeId: page.items[0]!.sealed.scopeId,
          keyVersion: page.items[0]!.sealed.keyVersion,
          dek: fromBase64Url(page.items[0]!.sealed.dek),
          payload: fromBase64Url(page.items[0]!.sealed.payload),
        },
      }),
    ).toEqual(payload);

    await admin.query(`update families set plan = 'basic' where id = $1`, [familyId]);
    const basic = await alice.create(itemsUrl(), {
      id: uuidv7(),
      section: 'mortgages',
      sealed: {
        scopeId,
        keyVersion: 1,
        dek: toBase64Url(sealed.dek),
        payload: toBase64Url(sealed.payload),
      },
    });
    expect(basic.statusCode).toBe(403);
    expect(problem(basic).requiredPlan).toBe('advanced');

    await admin.query(`update families set plan = 'free' where id = $1`, [familyId]);
    await admin.query(
      `insert into premium_trials (account_id, family_id, started_at, ends_at)
       select $1, $2, t, t + interval '30 days' from (select now() as t) s`,
      [aliceId, familyId],
    );
    const duringTrial = await send(
      alice,
      'PATCH',
      `${itemsUrl()}/${itemId}`,
      {
        sealed: {
          scopeId: item.sealed.scopeId,
          keyVersion: item.sealed.keyVersion,
          dek: item.sealed.dek,
          payload: item.sealed.payload,
        },
      },
      { 'if-match': formatEtag(item.version) },
    );
    expect(duringTrial.statusCode).toBe(200);
    expect(duringTrial.body).not.toContain(INSTITUTION);
  }, 120_000);
});
