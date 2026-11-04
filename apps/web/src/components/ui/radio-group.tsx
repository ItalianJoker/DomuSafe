import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.js';

/**
 * Exclusive choice, drawn as a compact segmented control.
 *
 * Preconditions: child items use distinct `value`s.
 * Postconditions: one item is selected; arrow keys move the selection.
 * Data contract: `value` and `onValueChange` are controlled by the caller.
 *
 * @param props - Group attributes.
 * @returns The group.
 */
export function RadioGroup({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      className={cn('inline-flex rounded-md border border-border p-0.5', className)}
      {...props}
    />
  );
}

/**
 * One option inside {@link RadioGroup}.
 *
 * Preconditions: `value` is unique in the group.
 * Postconditions: the selected item uses the accent surface.
 * Data contract: children are the visible label.
 *
 * @param props - Item attributes.
 * @returns The option.
 */
export function RadioGroupItem({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        'h-7 rounded-[4px] px-2.5 text-[13px] text-muted-foreground',
        'data-[state=checked]:bg-accent data-[state=checked]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}
