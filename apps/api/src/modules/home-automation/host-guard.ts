import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/**
 * Whether an IP address is private, loopback, link-local or otherwise unsafe for server-side fetch.
 *
 * @param address - IPv4 or IPv6 literal.
 * @returns `true` when the address must not be contacted from the SaaS path.
 */
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split('.').map((part) => Number(part));
    const [a = 0, b = 0] = parts;
    if (a === 10 || a === 127 || a === 0) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 100 && b >= 64 && b <= 127) {
      return true;
    }
    return false;
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80') ||
      normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:192.168.') ||
      /^::ffff:172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
    );
  }
  return true;
}

/**
 * Rejects literal private/loopback hosts without contacting DNS.
 *
 * Preconditions: `hostname` comes from a parsed URL.
 * Postconditions: either returns or throws `host_blocked`.
 * Data contract: used when persisting bridge settings so offline hosts can still be saved.
 *
 * @param hostname - Host from the URL.
 * @throws When the host is an obvious non-public destination.
 */
export function assertSafeHostname(hostname: string): void {
  if (isIP(hostname) !== 0) {
    if (isBlockedAddress(hostname)) {
      throw new Error('host_blocked');
    }
    return;
  }
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) {
    throw new Error('host_blocked');
  }
}

/**
 * Resolves a hostname and rejects blocked destinations (SSRF guard for live fetches).
 *
 * Preconditions: `hostname` comes from a parsed URL about to be contacted.
 * Postconditions: either returns or throws `host_blocked`.
 * Data contract: no DNS details leave this function.
 *
 * @param hostname - Host from the URL.
 * @throws When DNS fails or the address is blocked.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  assertSafeHostname(hostname);
  if (isIP(hostname) !== 0) {
    return;
  }
  const resolved = await lookup(hostname, { all: true });
  if (resolved.length === 0) {
    throw new Error('host_blocked');
  }
  for (const entry of resolved) {
    if (isBlockedAddress(entry.address)) {
      throw new Error('host_blocked');
    }
  }
}
