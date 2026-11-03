/** Raised when bytes do not follow a DomuSafe binary format (wrong version, length or magic). */
export class CryptoFormatError extends Error {
  override readonly name = 'CryptoFormatError';
}

/** Raised when authenticated decryption fails: wrong key, wrong associated data or tampered bytes. */
export class DecryptionError extends Error {
  override readonly name = 'DecryptionError';
}

/** Raised when a recovery phrase is not 24 valid Italian BIP-39 words with a correct checksum. */
export class InvalidRecoveryPhraseError extends Error {
  override readonly name = 'InvalidRecoveryPhraseError';
}
