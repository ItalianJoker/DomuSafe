import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.js';

/**
 * Visual variants of the shared button.
 *
 * Preconditions: none.
 * Postconditions: the class string includes one variant and one size.
 * Data contract: `size="emergency"` is at least 48px and is reserved for safety actions
 * (soccorso, conferma, chiamata). Every other size stays dense.
 */
export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-border bg-transparent hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-8 px-3 text-[13px]',
        sm: 'h-7 px-2.5 text-[12px]',
        emergency: 'min-h-12 min-w-12 px-4 text-base',
        icon: 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/** Props of {@link Button}. */
export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element instead of a `button`, keeping the same classes. */
  readonly asChild?: boolean;
}

/**
 * Compact action used by every screen.
 *
 * Preconditions: when `asChild` is set, there is exactly one child element.
 * Postconditions: a native button defaults to `type="button"` so it does not submit a form by accident.
 * Data contract: see {@link buttonVariants}.
 *
 * @param props - Variant, size and button attributes.
 * @returns The control.
 */
export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  if (asChild) {
    return <Slot className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  }
  return (
    <button type={type ?? 'button'} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
