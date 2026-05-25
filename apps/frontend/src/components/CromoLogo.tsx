import type { CSSProperties } from 'react';

type LogoVariant = 'accent' | 'chrome' | 'mono';

interface MarkProps {
  size?: number;
  variant?: LogoVariant;
  className?: string;
  title?: string;
}

const CHROME_GRADIENT_ID = 'cromo-chrome-gradient';

/**
 * Cromo brand mark — rounded sticker with a carved lowercase "c".
 * See BRAND.md §6 for usage rules.
 */
export function CromoMark({ size = 32, variant = 'accent', className, title = 'Cromo' }: MarkProps) {
  const gradientId = `${CHROME_GRADIENT_ID}-${variant}`;

  let fill: string;
  if (variant === 'chrome') fill = `url(#${gradientId})`;
  else if (variant === 'mono') fill = 'currentColor';
  else fill = 'var(--cromo-accent, #6EE7F9)';

  const cutout = variant === 'mono' ? 'var(--cromo-bg, #0A0B0F)' : 'var(--cromo-bg, #0A0B0F)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      {variant === 'chrome' && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="35%" stopColor="#A78BFA" />
            <stop offset="65%" stopColor="#F472B6" />
            <stop offset="100%" stopColor="#FBBF24" />
          </linearGradient>
        </defs>
      )}
      <rect x="1" y="1" width="22" height="22" rx="5" fill={fill} />
      <path
        d="M16 8.2a5.5 5.5 0 1 0 0 7.6"
        stroke={cutout}
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="16.5" cy="12" r="1.4" fill={cutout} />
    </svg>
  );
}

interface WordmarkProps {
  className?: string;
  style?: CSSProperties;
}

/** Wordmark only — pairs with CromoMark in CromoLogo, or stands alone. */
export function CromoWordmark({ className, style }: WordmarkProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--font-display, "Space Grotesk"), system-ui, sans-serif',
        fontWeight: 700,
        letterSpacing: '-0.04em',
        lineHeight: 1,
        ...style,
      }}
    >
      cromo
    </span>
  );
}

interface LockupProps {
  size?: number;
  variant?: LogoVariant;
  showWordmark?: boolean;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}

/** Horizontal lockup: mark + wordmark. The default for navbars and headers. */
export function CromoLogo({
  size = 28,
  variant = 'accent',
  showWordmark = true,
  className,
  markClassName,
  wordmarkClassName,
}: LockupProps) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <CromoMark size={size} variant={variant} className={markClassName} />
      {showWordmark && (
        <CromoWordmark
          className={wordmarkClassName}
          style={{ fontSize: Math.round(size * 0.72) }}
        />
      )}
    </span>
  );
}
