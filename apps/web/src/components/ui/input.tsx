import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.js';

/**
 * Single-line text control.
 *
 * Preconditions: none.
 * Postconditions: renders a native input with the shared border, height and focus ring.
 * Data contract: all native input attributes pass through, including `name` and `autoComplete`.
 *
 * @param props - Input attributes.
 * @returns The input.
 */
export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-[13px] text-foreground',
        'placeholder:text-muted-foreground disabled:opacity-40',
        className,
      )}
      {...props}
    />
  );
}
