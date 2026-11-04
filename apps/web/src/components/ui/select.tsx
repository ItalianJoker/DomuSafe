import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.js';

/**
 * Closed list of choices.
 *
 * Preconditions: items have stable values.
 * Postconditions: the selected value is available to the trigger.
 * Data contract: controlled through `value` and `onValueChange`.
 *
 * @param props - Root attributes.
 * @returns The select root.
 */
export function Select(props: ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root {...props} />;
}

/**
 * Button that opens {@link Select}.
 *
 * Preconditions: rendered inside `Select`.
 * Postconditions: shows the current value and a chevron.
 * Data contract: children are usually `SelectValue`.
 *
 * @param props - Trigger attributes.
 * @returns The trigger.
 */
export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-2.5 text-left text-[13px]',
        'disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

/**
 * Text of the current selection.
 *
 * Preconditions: rendered inside `SelectTrigger`.
 * Postconditions: shows the selected item's text, or `placeholder`.
 * Data contract: `placeholder` is the empty-state caption.
 *
 * @param props - Value attributes.
 * @returns The value.
 */
export function SelectValue(props: ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value {...props} />;
}

/**
 * Popover listing the options.
 *
 * Preconditions: rendered inside `Select`.
 * Postconditions: the list scrolls when it is taller than the viewport.
 * Data contract: children are `SelectItem` elements.
 *
 * @param props - Content attributes.
 * @returns The popover.
 */
export function SelectContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cn(
          'z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-none',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

/**
 * One option of {@link Select}.
 *
 * Preconditions: `value` is unique and not empty.
 * Postconditions: the selected row shows a check.
 * Data contract: children are the visible label.
 *
 * @param props - Item attributes.
 * @returns The option.
 */
export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex h-8 cursor-default items-center rounded-[4px] pr-8 pl-2 text-[13px] outline-none',
        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2">
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
