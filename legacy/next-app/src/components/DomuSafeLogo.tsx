/**
 * Logo DomuSafe — scudo casa + check emergenza.
 * Usare su landing/auth, shell e watermark stampa.
 */

interface DomuSafeLogoProps {
  className?: string;
  /** Dimensione in px (default 40). Touch-friendly ≥48 nel CTA. */
  size?: number;
  title?: string;
}

export function DomuSafeLogo({
  className = '',
  size = 40,
  title = 'DomuSafe',
}: DomuSafeLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      <rect width="128" height="128" rx="20" fill="#0B1F17" />
      <path
        d="M64 18 L108 42 V78 C108 98 88 112 64 118 C40 112 20 98 20 78 V42 Z"
        fill="#E8F2EC"
        stroke="#F0B429"
        strokeWidth="4"
      />
      <path
        d="M64 36 L92 52 V74 C92 88 80 98 64 102 C48 98 36 88 36 74 V52 Z"
        fill="#0B1F17"
      />
      <path
        d="M52 70 L60 78 L78 56"
        fill="none"
        stroke="#F0B429"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
