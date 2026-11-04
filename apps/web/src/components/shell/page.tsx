import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label.js';
import { m } from '@/paraglide/messages.js';

/**
 * Quiet page title used by every section.
 *
 * @param props - Title and optional lead.
 * @returns The heading block.
 */
export function PageHeader(props: { readonly title: string; readonly lead?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-[15px] font-medium tracking-tight text-foreground">{props.title}</h1>
      {props.lead === undefined ? null : (
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">{props.lead}</p>
      )}
    </header>
  );
}

/**
 * Section that exists in the menu and does not yet hold its own records.
 *
 * Preconditions: `title` and `body` are already translated.
 * Postconditions: renders a heading and one paragraph, with no fake actions.
 *
 * @param props - Translated title and explanation.
 * @returns The empty section.
 */
export function EmptySection(props: { readonly title: string; readonly body: string }) {
  return (
    <section>
      <PageHeader title={props.title} />
      <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">{props.body}</p>
    </section>
  );
}

/**
 * Wordmark shared by the shell and the access screens.
 *
 * @returns The name and mark.
 */
export function Brand() {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] font-medium tracking-tight">
      <img src="/domusafe-logo.svg" alt="" className="size-5" />
      {m.appName()}
    </span>
  );
}

/**
 * Inline note under a control.
 *
 * @param props - Hint or error. An error replaces the hint.
 * @returns The note.
 */
export function FieldNote(props: { readonly hint?: string; readonly error?: string }) {
  if (props.error !== undefined) {
    return (
      <p role="alert" className="text-[12px] text-destructive">
        {props.error}
      </p>
    );
  }
  if (props.hint !== undefined) {
    return <p className="text-[12px] text-muted-foreground">{props.hint}</p>;
  }
  return null;
}

/**
 * Vertical stack of a caption, a control and a note.
 *
 * @param props - Label, control and optional note.
 * @returns The field.
 */
export function Field(props: {
  readonly label: string;
  readonly htmlFor: string;
  readonly hint?: string;
  readonly error?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={props.htmlFor}>{props.label}</Label>
      {props.children}
      <FieldNote
        {...(props.hint === undefined ? {} : { hint: props.hint })}
        {...(props.error === undefined ? {} : { error: props.error })}
      />
    </div>
  );
}
