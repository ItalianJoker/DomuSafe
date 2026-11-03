/**
 * Codifica binaria condivisa (vault + sync E2EE).
 * Nessuna dipendenza Node: funziona in browser, Edge e smoke Node 22+.
 */

/** Uint8Array → Base64 standard (padding incluso). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** Base64 standard → Uint8Array. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Base64url senza padding — adatto a deep-link / QR (RFC 4648 §5).
 * Evita `+`, `/` e `=` che rompono hash URL e QR densi.
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

/** Base64url (con o senza padding) → Uint8Array. */
export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return base64ToBytes(padded + '='.repeat(padLen));
}
