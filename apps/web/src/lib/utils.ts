import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names the way the shared components expect.
 *
 * Preconditions: values are class strings, arrays or objects accepted by `clsx`.
 * Postconditions: Tailwind conflicts resolve to the last utility.
 * Data contract: the returned string is a single `class` attribute value.
 *
 * @param inputs - Class values.
 * @returns The merged class string.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
