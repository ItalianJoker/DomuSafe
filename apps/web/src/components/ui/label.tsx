import * as LabelPrimitive from '@radix-ui/react-label';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.js';

/**
 * Caption of a form control.
 *
 * Preconditions: `htmlFor` matches the control id when the control is not nested.
 * Postconditions: clicking the caption focuses the associated control.
 * Data contract: children are the visible caption.
 *
 * @param props - Label attributes.
 * @returns The caption.
 */
export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('text-[12px] font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}
