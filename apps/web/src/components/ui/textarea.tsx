import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.js';

/**
 * Multi-line text control used by the house manual.
 *
 * Preconditions: none.
 * Postconditions: renders a native textarea with the shared border and focus ring.
 * Data contract: native textarea attributes pass through.
 *
 * @param props - Textarea attributes.
 * @returns The control.
 */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-20 w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-[13px] text-foreground',
        'placeholder:text-muted-foreground disabled:opacity-40',
        className,
      )}
      {...props}
    />
  );
}
