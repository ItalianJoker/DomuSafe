import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

/** Campi Material: token tema chiaro/scuro, touch ≥48px. */
const fieldClass = 'md-field';

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
  className = '',
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`mb-1 block text-sm font-bold uppercase tracking-wide text-[var(--md-on-surface)] ${className}`}
    >
      {children}
    </label>
  );
}

/** Campo etichettato controllato — auth / famiglia / licenze. */
export function TouchField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
  id,
  labelClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  id?: string;
  labelClassName?: string;
}) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      <FieldLabel htmlFor={fieldId} className={labelClassName}>
        {label}
      </FieldLabel>
      <TouchInput
        id={fieldId}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
