import { createECDH } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CryptoFormatError,
  DecryptionError,
  InvalidRecoveryPhraseError,
  ServerSecretBox,
  aad,
  bytesToWords,
  constantTimeEqual,
  createAccountKeys,
  decodePairingQr,
  deriveAccountPrivateKeyKek,
  deriveBackupKey,
  derivePairingMaterial,
  derivePinVerifier,
  deriveRecoveryMaterial,
  deriveVaultSecret,
  deriveVaultUnlockKey,
  ecdhSharedSecret,
  encodePairingQr,
  fromBase64Url,
  fromHex,
  fromUtf8,
  generateDeviceKey,
  generateScopeKey,
  grantScopeKey,
  importAesKey,
  importPublicKey,
  isUuidV7,
  openAccountKeyForDevice,
  openAccountPrivateKey,
  openEnvelope,
  openGrant,
  openRecord,
  openS1,
  openScopeKeyGrant,
  openStream,
  openVaultPrivateKey,
  openVaultPrivateKeyWithRecovery,
  parseMasterKeys,
  prepareVaultPin,
  publicKeyFingerprint,
  randomBytes,
  recoverWithPhrase,
  recoveryEntropyFromPhrase,
  recoveryPhraseFromEntropy,
  recoveryVerifierDigest,
  sealEnvelope,
  sealRecord,
  sealStream,
  toBase64Url,
  toHex,
  utf8,
  uuidv7,
  validatePin,
  wrapAccountKeyForDevice,
  type Bytes,
} from '../src/index.js';
import { VECTORS } from './vectors.js';

async function privateKeyFromScalar(dHex: string): Promise<{ privateKey: CryptoKey; publicKey: Bytes }> {
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(dHex, 'hex'));
  const publicKey = new Uint8Array(ecdh.getPublicKey());
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: toBase64Url(fromHex(dHex)),
    x: toBase64Url(publicKey.slice(1, 33)),
    y: toBase64Url(publicKey.slice(33)),
  };
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ]);
  return { privateKey, publicKey };
}

describe('bytes', () => {
  it('round-trips base64url and hex for every length', () => {
    for (let length = 0; length < 40; length += 1) {
      const bytes = randomBytes(length);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
      expect(fromHex(toHex(bytes))).toEqual(bytes);
    }
  });

  it('matches the platform base64url encoder', () => {
    const bytes = randomBytes(257);
    expect(toBase64Url(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
  });

  it('rejects malformed base64url and hex', () => {
    expect(() => fromBase64Url('a')).toThrow(TypeError);
    expect(() => fromBase64Url('ab+/')).toThrow(TypeError);
    expect(() => fromHex('abc')).toThrow(TypeError);
  });

  it('compares in constant time semantics', () => {
    expect(constantTimeEqual(utf8('abc'), utf8('abc'))).toBe(true);
    expect(constantTimeEqual(utf8('abc'), utf8('abd'))).toBe(false);
    expect(constantTimeEqual(utf8('abc'), utf8('ab'))).toBe(false);
  });
});

describe('phase 2 vectors', () => {
  it('derives the vault hierarchy with HKDF', async () => {
    const accountKey = fromHex(VECTORS.hkdf.accountKey);
    const vaultSecret = await deriveVaultSecret(accountKey);
    expect(toHex(vaultSecret)).toBe(VECTORS.hkdf.vaultSecret);
    expect(toHex(await deriveVaultUnlockKey(vaultSecret, fromHex(VECTORS.hkdf.serverShare)))).toBe(
      VECTORS.hkdf.vaultUnlockKey,
    );
    expect(toHex(await deriveAccountPrivateKeyKek(accountKey))).toBe(VECTORS.hkdf.accountPrivateKeyKek);
  });

  it('opens the DS-ENV record vector and its wrapped DEK', async () => {
    const { envelope, dekWrap } = VECTORS;
    const scopeKey = await importAesKey(fromHex(dekWrap.scopeKey));
    const dek = await openEnvelope(
      scopeKey,
      fromBase64Url(dekWrap.wrap),
      aad.dek(envelope.table, envelope.recordId, dekWrap.scopeId, dekWrap.scopeVersion),
    );
    expect(toHex(dek)).toBe(envelope.key);
    const plaintext = await openEnvelope(
      await importAesKey(dek),
      fromBase64Url(envelope.envelope),
      aad.record(envelope.table, envelope.recordId, envelope.version),
    );
    expect(fromUtf8(plaintext)).toBe(envelope.plaintext);
    await expect(
      openRecord({
        table: envelope.table,
        recordId: envelope.recordId,
        version: envelope.version,
        scopeKey: fromHex(dekWrap.scopeKey),
        sealed: {
          scopeId: dekWrap.scopeId,
          keyVersion: dekWrap.scopeVersion,
          dek: fromBase64Url(dekWrap.wrap),
          payload: fromBase64Url(envelope.envelope),
        },
      }),
    ).resolves.toEqual(JSON.parse(envelope.plaintext));
  });

  it('rejects the record vector under another version or record id', async () => {
    const { envelope } = VECTORS;
    const key = await importAesKey(fromHex(envelope.key));
    await expect(
      openEnvelope(key, fromBase64Url(envelope.envelope), aad.record(envelope.table, envelope.recordId, 2)),
    ).rejects.toBeInstanceOf(DecryptionError);
    await expect(
      openEnvelope(key, fromBase64Url(envelope.envelope), aad.record(envelope.table, uuidv7(), 1)),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('derives the Argon2id PIN verifier', async () => {
    const verifier = await derivePinVerifier(VECTORS.pin.pin, fromHex(VECTORS.pin.salt));
    expect(toBase64Url(verifier)).toBe(VECTORS.pin.verifier);
  });

  it('derives the backup key with Argon2id', async () => {
    const key = await deriveBackupKey(VECTORS.backup.passphrase, fromHex(VECTORS.backup.salt));
    expect(toHex(key)).toBe(VECTORS.backup.key);
  });

  it('encodes and decodes the recovery phrase and derives its material', async () => {
    const entropy = fromHex(VECTORS.recovery.entropy);
    expect(recoveryPhraseFromEntropy(entropy)).toBe(VECTORS.recovery.phrase);
    expect(
      recoveryEntropyFromPhrase(`  ${VECTORS.recovery.phrase.toUpperCase().replaceAll(' ', '\n ')} `),
    ).toEqual(entropy);
    const material = await deriveRecoveryMaterial(entropy);
    expect(toHex(material.accountKeyKek)).toBe(VECTORS.recovery.accountKeyKek);
    expect(toHex(material.privateKeyKek)).toBe(VECTORS.recovery.privateKeyKek);
    expect(toBase64Url(material.verifier)).toBe(VECTORS.recovery.verifier);
    expect(toHex(await recoveryVerifierDigest(material.verifier))).toBe(VECTORS.recovery.verifierSha256);
  });

  it('rejects recovery phrases with a wrong word, count or checksum', () => {
    const words = VECTORS.recovery.phrase.split(' ');
    expect(() => recoveryEntropyFromPhrase(words.slice(0, 23).join(' '))).toThrow(InvalidRecoveryPhraseError);
    expect(() => recoveryEntropyFromPhrase([...words.slice(0, 23), 'pizzaiolo'].join(' '))).toThrow(
      InvalidRecoveryPhraseError,
    );
    expect(() => recoveryEntropyFromPhrase([...words.slice(0, 23), 'abaco'].join(' '))).toThrow(
      InvalidRecoveryPhraseError,
    );
  });

  it('opens the DS-GRANT vector and computes the fingerprint', async () => {
    const { grant, dekWrap } = VECTORS;
    const recipient = await privateKeyFromScalar(grant.recipientPrivateD);
    expect(toHex(recipient.publicKey)).toBe(grant.recipientPublic);
    const scopeKey = await openGrant(
      recipient.privateKey,
      recipient.publicKey,
      fromBase64Url(grant.grant),
      aad.grant(dekWrap.scopeId, dekWrap.scopeVersion, 'account', grant.granteeId),
    );
    expect(toHex(scopeKey)).toBe(dekWrap.scopeKey);
    await expect(
      openGrant(
        recipient.privateKey,
        recipient.publicKey,
        fromBase64Url(grant.grant),
        aad.grant(dekWrap.scopeId, dekWrap.scopeVersion, 'vault', grant.granteeId),
      ),
    ).rejects.toBeInstanceOf(DecryptionError);
    expect(await publicKeyFingerprint(recipient.publicKey)).toEqual(grant.fingerprint);
  });

  it('derives the pairing words and transfer key', async () => {
    const { pairing } = VECTORS;
    const b = await privateKeyFromScalar(pairing.bPrivateD);
    const shared = await ecdhSharedSecret(b.privateKey, await importPublicKey(fromHex(pairing.aPublic)));
    expect(toHex(shared)).toBe(pairing.sharedSecret);
    const material = await derivePairingMaterial({
      sharedSecret: shared,
      pairingSecret: fromHex(pairing.pairingSecret),
      existingDevicePublicKey: fromHex(pairing.aPublic),
      newDevicePublicKey: fromHex(pairing.bPublic),
    });
    expect(material.verificationWords).toEqual(pairing.words);
    expect(toHex(material.transferKey)).toBe(pairing.transferKey);
  });

  it('opens the DS-STREAM vector', async () => {
    const { stream } = VECTORS;
    const plaintext = await openStream(
      await importAesKey(fromHex(stream.key)),
      fromBase64Url(stream.stream),
      aad.file(stream.fileId),
    );
    expect(fromUtf8(plaintext)).toBe(stream.plaintext);
  });

  it('opens the S1 vector', async () => {
    const { classS } = VECTORS;
    const plaintext = await openS1(
      await importAesKey(fromHex(classS.key)),
      fromBase64Url(classS.blob),
      aad.serverSecret('account_pins', 'server_share', classS.accountId),
    );
    expect(toHex(plaintext)).toBe(classS.plaintext);
  });
});

describe('formats', () => {
  it('seals envelopes with a fresh IV each time', async () => {
    const key = await importAesKey(randomBytes(32));
    const data = utf8('stesso testo');
    const first = await sealEnvelope(key, data, aad.file('a'));
    const second = await sealEnvelope(key, data, aad.file('a'));
    expect(toHex(first)).not.toBe(toHex(second));
    expect(await openEnvelope(key, second, aad.file('a'))).toEqual(data);
  });

  it('rejects envelopes with a wrong version or length', async () => {
    const key = await importAesKey(randomBytes(32));
    const sealed = await sealEnvelope(key, utf8('x'), aad.file('a'));
    sealed[0] = 2;
    await expect(openEnvelope(key, sealed, aad.file('a'))).rejects.toBeInstanceOf(CryptoFormatError);
    await expect(openEnvelope(key, sealed.slice(0, 20), aad.file('a'))).rejects.toBeInstanceOf(
      CryptoFormatError,
    );
  });

  it('round-trips streams across chunk boundaries and detects truncation', async () => {
    const key = await importAesKey(randomBytes(32));
    for (const length of [0, 1, 1_048_576, 1_048_577, 2_500_000]) {
      const data = randomBytes(length);
      const sealed = await sealStream(key, data, aad.file('f'));
      expect(await openStream(key, sealed, aad.file('f'))).toEqual(data);
    }
    const twoChunks = await sealStream(key, randomBytes(1_048_577), aad.file('f'));
    await expect(
      openStream(key, twoChunks.slice(0, 12 + 1_048_576 + 16), aad.file('f')),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects associated-data components with separators', () => {
    expect(() => aad.file('a|b')).toThrow(TypeError);
    expect(() => aad.record('t', 'id', -1)).toThrow(TypeError);
  });
});

describe('key hierarchy', () => {
  it('creates account keys that open from the device and from the recovery phrase', async () => {
    const accountId = uuidv7();
    const deviceId = uuidv7();
    const { bundle, secrets } = await createAccountKeys(accountId);
    expect(bundle.publicKey).toHaveLength(65);
    expect(secrets.recoveryPhrase.split(' ')).toHaveLength(24);
    expect(bundle.fingerprint).toHaveLength(6);

    const deviceKey = await generateDeviceKey();
    const wrapped = await wrapAccountKeyForDevice(deviceKey, secrets.accountKey, accountId, deviceId);
    expect(await openAccountKeyForDevice(deviceKey, wrapped, accountId, deviceId)).toEqual(
      secrets.accountKey,
    );
    await expect(openAccountKeyForDevice(deviceKey, wrapped, accountId, uuidv7())).rejects.toBeInstanceOf(
      DecryptionError,
    );

    const recovered = await recoverWithPhrase(secrets.recoveryPhrase, bundle, accountId);
    expect(recovered.accountKey).toEqual(secrets.accountKey);
    expect(await recoveryVerifierDigest(recovered.verifier)).toEqual(bundle.recoveryVerifierSha256);

    const privateKey = await openAccountPrivateKey(recovered.accountKey, bundle.wrappedPrivateKey, accountId);
    const scopeId = uuidv7();
    const scopeKey = generateScopeKey();
    const grant = await grantScopeKey({
      scopeId,
      version: 1,
      scopeKey,
      grantee: 'account',
      granteeId: accountId,
      granteePublicKey: bundle.publicKey,
    });
    expect(
      await openScopeKeyGrant({
        grantBlob: grant,
        scopeId,
        version: 1,
        grantee: 'account',
        granteeId: accountId,
        privateKey,
        publicKey: bundle.publicKey,
      }),
    ).toEqual(scopeKey);
  });

  it('protects the vault key with PIN share and recovery, and survives a PIN change', async () => {
    const accountId = uuidv7();
    const { bundle, secrets } = await createAccountKeys(accountId);
    const first = await prepareVaultPin({
      accountId,
      accountKey: secrets.accountKey,
      pin: '924617',
      recoveryPublicKey: bundle.recoveryPublicKey,
      pinGeneration: 1,
    });
    expect(first.setup.verifier).toEqual(await derivePinVerifier('924617', first.setup.salt));

    const unlocked = await openVaultPrivateKey(
      {
        accountId,
        accountKey: secrets.accountKey,
        serverShare: first.setup.serverShare,
        wrappedVaultPrivateKey: first.setup.wrappedVaultPrivateKey,
        pinGeneration: 1,
      },
      true,
    );
    await expect(
      openVaultPrivateKey({
        accountId,
        accountKey: secrets.accountKey,
        serverShare: randomBytes(32),
        wrappedVaultPrivateKey: first.setup.wrappedVaultPrivateKey,
        pinGeneration: 1,
      }),
    ).rejects.toBeInstanceOf(DecryptionError);

    const changed = await prepareVaultPin({
      accountId,
      accountKey: secrets.accountKey,
      pin: '531870',
      recoveryPublicKey: bundle.recoveryPublicKey,
      pinGeneration: 2,
      existingVaultPrivateKey: unlocked,
      existingVaultPublicKey: first.setup.vaultPublicKey,
    });
    expect(changed.setup.vaultPublicKey).toEqual(first.setup.vaultPublicKey);

    const recovered = await recoverWithPhrase(secrets.recoveryPhrase, bundle, accountId);
    const viaRecovery = await openVaultPrivateKeyWithRecovery({
      recoveryPrivateKey: recovered.recoveryPrivateKey,
      recoveryPublicKey: bundle.recoveryPublicKey,
      recoverySealedVaultKey: first.setup.recoverySealedVaultKey,
      accountId,
    });
    const scopeId = uuidv7();
    const scopeKey = generateScopeKey();
    const grant = await grantScopeKey({
      scopeId,
      version: 1,
      scopeKey,
      grantee: 'vault',
      granteeId: accountId,
      granteePublicKey: changed.setup.vaultPublicKey,
    });
    expect(
      await openScopeKeyGrant({
        grantBlob: grant,
        scopeId,
        version: 1,
        grantee: 'vault',
        granteeId: accountId,
        privateKey: viaRecovery,
        publicKey: changed.setup.vaultPublicKey,
      }),
    ).toEqual(scopeKey);
  }, 30_000);

  it('seals records with a fresh DEK bound to table, id, version and scope', async () => {
    const scopeKey = generateScopeKey();
    const input = {
      table: 'utilities',
      recordId: uuidv7(),
      version: 3,
      scopeId: uuidv7(),
      scopeVersion: 2,
      scopeKey,
      payload: { iban: 'IT60X0542811101000000123456' },
    };
    const sealed = await sealRecord(input);
    const again = await sealRecord(input);
    expect(toHex(sealed.dek)).not.toBe(toHex(again.dek));
    await expect(
      openRecord({ table: input.table, recordId: input.recordId, version: 3, sealed, scopeKey }),
    ).resolves.toEqual(input.payload);
    await expect(
      openRecord({ table: 'subscriptions_services', recordId: input.recordId, version: 3, sealed, scopeKey }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe('server secrets', () => {
  it('seals with the active version and opens older versions', async () => {
    const v1 = toBase64Url(randomBytes(32));
    const v2 = toBase64Url(randomBytes(32));
    const oldBox = await ServerSecretBox.create(parseMasterKeys(`1:${v1}`), 1);
    const box = await ServerSecretBox.create(parseMasterKeys(`2:${v2},1:${v1}`), 2);
    const location = { table: 'account_pins', column: 'server_share', rowId: uuidv7() };
    const secret = randomBytes(32);
    const old = await oldBox.seal(secret, location);
    expect(box.needsReseal(old)).toBe(true);
    expect(await box.open(old, location)).toEqual(secret);
    const fresh = await box.seal(secret, location);
    expect(box.needsReseal(fresh)).toBe(false);
    await expect(box.open(fresh, { ...location, rowId: uuidv7() })).rejects.toBeInstanceOf(DecryptionError);
    expect(await box.betterAuthSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('rejects malformed keyrings', () => {
    expect(() => parseMasterKeys('1:abc')).toThrow(CryptoFormatError);
    const key = toBase64Url(randomBytes(32));
    expect(() => parseMasterKeys(`1:${key},1:${key}`)).toThrow(CryptoFormatError);
  });
});

describe('words, pairing, ids, PIN rules', () => {
  it('extracts 11-bit words most significant first', () => {
    expect(bytesToWords(new Uint8Array([0, 0]), 1)).toEqual(['abaco']);
    expect(() => bytesToWords(new Uint8Array(1), 1)).toThrow(RangeError);
  });

  it('round-trips the pairing QR payload', () => {
    const qr = { channelId: uuidv7(), publicKey: fromHex(VECTORS.pairing.aPublic), secret: randomBytes(16) };
    expect(decodePairingQr(encodePairingQr(qr))).toEqual(qr);
    expect(() => decodePairingQr('domusafe-pair:2:x:y:z')).toThrow(CryptoFormatError);
  });

  it('generates UUIDv7 values in time order', () => {
    const first = uuidv7(1_700_000_000_000);
    const second = uuidv7(1_700_000_000_001);
    expect(isUuidV7(first)).toBe(true);
    expect(first < second).toBe(true);
    expect(isUuidV7('01900000-0000-4000-8000-000000000000')).toBe(false);
  });

  it('validates PIN rules locally', () => {
    expect(validatePin('12345')).toEqual({ ok: false, reason: 'too_short' });
    expect(validatePin('111111')).toEqual({ ok: false, reason: 'trivial' });
    expect(validatePin('123456')).toEqual({ ok: false, reason: 'trivial' });
    expect(validatePin('987654')).toEqual({ ok: false, reason: 'trivial' });
    expect(validatePin('890123')).toEqual({ ok: false, reason: 'trivial' });
    expect(validatePin('150387', ['150387'])).toEqual({ ok: false, reason: 'trivial' });
    expect(validatePin('924617')).toEqual({ ok: true });
    expect(validatePin('x'.repeat(65))).toEqual({ ok: false, reason: 'too_long' });
  });
});
