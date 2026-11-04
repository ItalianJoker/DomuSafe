import type { DeviceLabel } from '@domusafe/contracts';

/**
 * Short device label the public page may send with a view.
 *
 * Preconditions: `userAgent` is the browser string, possibly empty. `maxTouchPoints` is zero or more.
 * Postconditions: an empty string yields null. Otherwise the result is Telefono, Tablet or Computer.
 * Data contract: the raw browser string is not returned.
 *
 * @param input - Browser facts already on the device.
 * @returns The label to send, or null when the browser did not provide one.
 */
export function readingDeviceLabel(input: {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
}): DeviceLabel | null {
  if (input.userAgent.trim() === '') {
    return null;
  }
  const agent = input.userAgent;
  const has = (needle: string): boolean => agent.includes(needle);
  const tablet =
    has('iPad') ||
    has('Tablet') ||
    (input.maxTouchPoints > 1 && has('Macintosh')) ||
    (has('Android') && !has('Mobile'));
  if (tablet) {
    return 'Tablet';
  }
  if (has('Mobi') || has('iPhone') || has('iPod') || has('Android') || has('webOS') || has('BlackBerry')) {
    return 'Telefono';
  }
  return 'Computer';
}
