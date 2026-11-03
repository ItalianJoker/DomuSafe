'use client';

/**
 * Empty state guidato: un messaggio + una sola CTA.
 */

interface EmptyStateCtaProps {
  title: string;
  body: string;
  cta: string;
  onAction: () => void;
  tone?: 'default' | 'danger';
}

export function EmptyStateCta({
  title,
  body,
  cta,
  onAction,
  tone = 'default',
}: EmptyStateCtaProps) {
  return (
    <div
      className={`rounded-lg border-2 border-dashed p-5 text-center ${
        tone === 'danger'
          ? 'border-red-800 bg-rose-50'
          : 'border-zinc-500 bg-white'
      }`}
    >
      <h3 className="text-lg font-black text-zinc-950">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-700">{body}</p>
      <button
        type="button"
        className={`mt-4 inline-flex min-h-14 items-center justify-center rounded-md border-2 px-6 text-base font-bold text-white ${
          tone === 'danger'
            ? 'border-red-900 bg-red-700'
            : 'border-zinc-900 bg-[var(--brand-ink)]'
        }`}
        onClick={onAction}
      >
        {cta}
      </button>
    </div>
  );
}
