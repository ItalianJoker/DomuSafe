import * as SeparatorPrimitive from '@radix-ui/react-separator';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.js';

/**
 * Hairline divider between regions.
 *
 * Preconditions: none.
 * Postconditions: renders a non-interactive separator.
 * Data contract: `orientation` is `horizontal` or `vertical`.
 *
 * @param props - Separator attributes.
 * @returns The divider.
 */
export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      decorative={decorative}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}
