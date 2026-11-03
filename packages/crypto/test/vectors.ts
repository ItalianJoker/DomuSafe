/**
 * Fixed test vectors published in phase 2 (§11), computed with Node.js 26 Web Crypto, hash-wasm 4.12
 * and @scure/bip39 2.4. Fixed IVs exist only here.
 */
export const VECTORS = {
  hkdf: {
    accountKey: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    serverShare: '202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f',
    vaultSecret: '0663daaa634eb5bd5a04ed0fab17544813e60e9c7e44a01679dbc8c5ba1cdde9',
    vaultUnlockKey: 'ca9a901889bf6340b5fd475d42a2735f819b04a871e54c3d057ac55f98fd5089',
    accountPrivateKeyKek: '104989678007948f328e8a206068ccd606b9e56c7e26a6aaa5d2cd65bfce391e',
  },
  envelope: {
    key: '404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f',
    table: 'vault_items',
    recordId: '01900000-0000-7000-8000-000000000001',
    version: 1,
    plaintext: '{"titolo":"Polizza casa","numero":"VEC-0001"}',
    envelope:
      'AQABAgMEBQYHCAkKC0EnGBED4yjP4CiikteBpcH5pQ1qDT_MccIChuMs1BsxYkrmV_4BJk-AKEm9PALTELnOBW4vSMjUwxJTZxc',
  },
  dekWrap: {
    scopeKey: '606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f',
    scopeId: '01900000-0000-7000-8000-0000000000c1',
    scopeVersion: 1,
    wrap: 'ATAxMjM0NTY3ODk6O_6xfk1n48DlXv9z4dLj9KSn5zlADLb06UOSN-FuRRjvZWRHRQx3Cx22kPErTBmulg',
  },
  pin: {
    pin: '246810',
    salt: '000102030405060708090a0b0c0d0e0f',
    verifier: 'FK59ZPX63aMpZrVWsN_tk1OHR4Y44dSfsBX66Zmzkic',
  },
  recovery: {
    entropy: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    phrase:
      'abaco alogeno mitigare alogeno fenomeno affetto bravura bronzina ampio gonfio elaborato bisonte accadere nessuno europa monile autunno risibile alce criceto renna apparire mana trincea',
    accountKeyKek: '8cf25bff2be06fac977fc30998ba1cb1695fca6960a7cd4d55a5ae9c9ccab08e',
    privateKeyKek: 'aa74a1a5b4835f1b49ff43e659977e8092fddc20ac0aa04aa60fba41e7212479',
    verifier: 'sLF3V7lmcF_sWVh8iOWrOVhyukHdCxWxocXkoeGTj7s',
    verifierSha256: '79905fe6932a734610953ac6f1ab907feae7f20828d1d0cbf98461a4c6d13048',
  },
  grant: {
    recipientPrivateD: '1111111111111111111111111111111111111111111111111111111111111111',
    recipientPublic:
      '040217e617f0b6443928278f96999e69a23a4f2c152bdf6d6cdf66e5b80282d4ed194a7debcb97712d2dda3ca85aa8765a56f45fc758599652f2897c65306e5794',
    granteeId: '01900000-0000-7000-8000-0000000000b2',
    grant:
      'AQTWWpOXfKo9GwgYUv9Xp55GXxZgV3MEuurVBd06SFic81AYXolTct9iIeo6E3VX5HP922dV8FvVB8PFM_zpyRKFAQwNDg8QERITFBUWF3Xa3CYH60azheTxqZ2EpxKw3_o_mA99rZW_wxRx2ZIntcyKsZGW2tGOVhs1wq_BpQ',
    fingerprint: ['chitarra', 'indole', 'varcato', 'bubbone', 'parola', 'frenata'],
  },
  pairing: {
    aPublic:
      '0451a7580833898ea1b183cbd7350a4099078c6ef1c1e18e970cd7683035f25e7d0110522712b0b5a7cff081685486984a94e6831edac46e7360fa9d834a7a81a1',
    bPrivateD: '4444444444444444444444444444444444444444444444444444444444444444',
    bPublic:
      '045b36890dacbd7c9a96bb74a1ee28b3d2d75b72e09a20ef25cf8e6fd8a9f0350d0e14bed8d4682a34d83538bdff5b96e89a6666ec0db5745d02fa1210072df75a',
    pairingSecret: '000102030405060708090a0b0c0d0e0f',
    sharedSecret: '5238f9f956812e75918895390fa057a2063aa66d4d5eefbe6ecdcf78342d2922',
    words: ['portata', 'monastero', 'isolato', 'fucsia'],
    transferKey: '206aaae9ad9071f23dd027b2c30da46e849f2618ef12f844e3a3df464522a24b',
  },
  stream: {
    key: '404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f',
    fileId: '01900000-0000-7000-8000-0000000000f1',
    plaintext: 'abc',
    stream: 'RFNTMQGgoaKjpKWmhCAhwArP0K3WjTsBJlRVX3RJZQ',
  },
  classS: {
    key: '808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f',
    accountId: '01900000-0000-7000-8000-0000000000a1',
    plaintext: '202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f',
    blob: 'UwABUFFSU1RVVldYWVpbkqS0ZgNcJ8FGciEAo7P-sHZFJvQIEt4fmvJ1aumjuBbsXkjv9rqTx4J6EPltmXeA',
  },
  backup: {
    passphrase: 'cavallo batteria graffetta corretta',
    salt: '101112131415161718191a1b1c1d1e1f',
    key: '6a36380bb4889aa8198ee138aed174a41a9f2ccca066baa7e01ee68199550851',
  },
} as const;
