import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

const fieldClass =
  'w-full min-h-12 rounded-md border-2 border-zinc-900 bg-white px-3 py-3 text-base text-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:ring-4 focus:ring-amber-400';

/**
 * Campo testo touch-friendly (≥48px) ad alto contrasto.
 * Usato in Livello 1 e 2 — evita input nativi troppo piccoli in emergenza.
 */
export function TouchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ''}`} />;
}

export function TouchTextarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  return (
    <textarea
      {...props}
      className={`${fieldClass} min-h-24 ${props.className ?? ''}`}
    />
  );
}

export function TouchSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`${fieldClass} ${props.className ?? ''}`}
    />
  );
}

export function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-sm font-bold uppercase tracking-wide text-zinc-900"
    >
      {children}
    </label>
  );
}
