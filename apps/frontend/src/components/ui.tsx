'use client';

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import { forwardRef } from 'react';

/* ============================================================
   Class-name helper — tiny, no dep.
   ============================================================ */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ============================================================
   Button
   ============================================================ */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'chrome';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const buttonBase =
  'inline-flex items-center justify-center gap-2 font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] focus-visible:ring-[var(--cromo-accent)] focus-visible:ring-offset-[var(--cromo-bg)]',
  secondary:
    'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg)] border border-[var(--cromo-border)] hover:bg-[var(--cromo-surface)] hover:border-[var(--cromo-border-strong)] focus-visible:ring-[var(--cromo-border-strong)] focus-visible:ring-offset-[var(--cromo-bg)]',
  ghost:
    'bg-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] focus-visible:ring-[var(--cromo-border-strong)] focus-visible:ring-offset-[var(--cromo-bg)]',
  danger:
    'bg-[var(--cromo-danger)] text-white hover:opacity-90 focus-visible:ring-[var(--cromo-danger)] focus-visible:ring-offset-[var(--cromo-bg)]',
  chrome:
    'cromo-chrome-fill text-[#0A0B0F] hover:brightness-110 focus-visible:ring-[var(--cromo-accent)] focus-visible:ring-offset-[var(--cromo-bg)]',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'rounded-btn px-3 py-1.5 text-xs',
  md: 'rounded-btn px-4 py-2 text-sm',
  lg: 'rounded-btn px-6 py-3 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, iconLeft, iconRight, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === 'lg' ? 16 : 14} />
      ) : (
        iconLeft
      )}
      {children}
      {iconRight}
    </button>
  );
});

/* ============================================================
   Card
   ============================================================ */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  interactive?: boolean;
}

export function Card({ padded = true, interactive, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        'rounded-card bg-[var(--cromo-surface)] border border-[var(--cromo-border)]',
        padded && 'p-6',
        interactive && 'transition-colors hover:border-[var(--cromo-border-strong)] cursor-pointer',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx('px-6 py-4 border-b border-[var(--cromo-border)]', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('p-6', className)} {...rest}>
      {children}
    </div>
  );
}

/* ============================================================
   Input / Textarea / Label
   ============================================================ */
type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={cx(
        'w-full rounded-btn border bg-[var(--cromo-surface)] text-[var(--cromo-fg)] border-[var(--cromo-border)] px-3 py-2 text-sm transition-colors',
        'placeholder:text-[var(--cromo-fg-subtle)]',
        'focus:outline-none focus:border-[var(--cromo-accent)] focus:ring-2 focus:ring-[var(--cromo-accent-soft)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...rest}
    />
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cx(
        'w-full rounded-btn border bg-[var(--cromo-surface)] text-[var(--cromo-fg)] border-[var(--cromo-border)] px-3 py-2 text-sm transition-colors',
        'placeholder:text-[var(--cromo-fg-subtle)]',
        'focus:outline-none focus:border-[var(--cromo-accent)] focus:ring-2 focus:ring-[var(--cromo-accent-soft)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...rest}
    />
  );
});

export function Label({ children, className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cx('text-sm font-medium text-[var(--cromo-fg-muted)]', className)}
      {...rest}
    >
      {children}
    </label>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-[var(--cromo-danger)]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[var(--cromo-fg-subtle)]">{hint}</p>
      ) : null}
    </div>
  );
}

/* ============================================================
   Badge — for variants, statuses, rarity tiers.
   ============================================================ */
type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'very-rare'
  | 'ultra-rare'
  | 'masterpiece';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: 'sm' | 'md';
}

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)] border-[var(--cromo-border)]',
  accent: 'bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)] border-[var(--cromo-accent)]/30',
  success: 'bg-[var(--cromo-success-soft)] text-[var(--cromo-success)] border-[var(--cromo-success)]/30',
  warning: 'bg-[var(--cromo-warning-soft)] text-[var(--cromo-warning)] border-[var(--cromo-warning)]/30',
  danger: 'bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger)] border-[var(--cromo-danger)]/30',
  common: 'bg-[var(--cromo-surface-2)] text-[var(--cromo-tier-common)] border-[var(--cromo-tier-common)]/30',
  uncommon: 'bg-[var(--cromo-tier-uncommon)]/10 text-[var(--cromo-tier-uncommon)] border-[var(--cromo-tier-uncommon)]/30',
  rare: 'bg-[var(--cromo-tier-rare)]/10 text-[var(--cromo-tier-rare)] border-[var(--cromo-tier-rare)]/30',
  'very-rare': 'bg-[var(--cromo-tier-very-rare)]/10 text-[var(--cromo-tier-very-rare)] border-[var(--cromo-tier-very-rare)]/30',
  'ultra-rare': 'bg-[var(--cromo-tier-ultra-rare)]/10 text-[var(--cromo-tier-ultra-rare)] border-[var(--cromo-tier-ultra-rare)]/30',
  masterpiece: 'cromo-chrome-fill text-[#0A0B0F] border-transparent',
};

export function Badge({ tone = 'neutral', size = 'sm', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-chip border font-medium',
        badgeTones[tone],
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/* ============================================================
   PageHeader — consistent title block for interior pages.
   ============================================================ */
interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-xs uppercase tracking-wider text-[var(--cromo-fg-subtle)] font-semibold mb-1.5">
            {eyebrow}
          </div>
        )}
        <h1
          className="font-display font-bold text-2xl sm:text-3xl text-[var(--cromo-fg)] tracking-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-[var(--cromo-fg-muted)]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/* ============================================================
   EmptyState
   ============================================================ */
interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-4">
      {icon && (
        <div className="w-12 h-12 rounded-card bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)] flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <h3 className="font-display font-semibold text-base text-[var(--cromo-fg)] mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--cromo-fg-muted)] max-w-md mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}

/* ============================================================
   Spinner
   ============================================================ */
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ============================================================
   Alert — for inline error/success/info messages.
   ============================================================ */
interface AlertProps {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: ReactNode;
  children: ReactNode;
}

const alertTones = {
  info: 'bg-[var(--cromo-accent-soft)] border-[var(--cromo-accent)]/30 text-[var(--cromo-accent)]',
  success: 'bg-[var(--cromo-success-soft)] border-[var(--cromo-success)]/30 text-[var(--cromo-success)]',
  warning: 'bg-[var(--cromo-warning-soft)] border-[var(--cromo-warning)]/30 text-[var(--cromo-warning)]',
  danger: 'bg-[var(--cromo-danger-soft)] border-[var(--cromo-danger)]/30 text-[var(--cromo-danger)]',
};

export function Alert({ tone = 'info', title, children }: AlertProps) {
  return (
    <div className={cx('rounded-btn border px-3 py-2 text-sm', alertTones[tone])}>
      {title && <div className="font-semibold mb-0.5">{title}</div>}
      <div className="text-[var(--cromo-fg)]/90">{children}</div>
    </div>
  );
}

/* ============================================================
   Divider
   ============================================================ */
export function Divider({ className }: { className?: string }) {
  return <hr className={cx('border-0 border-t border-[var(--cromo-border)]', className)} />;
}

/* ============================================================
   Stat — for dashboard tiles.
   ============================================================ */
interface StatProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'accent' | 'success';
}

export function Stat({ label, value, hint, tone = 'default' }: StatProps) {
  const valueColor =
    tone === 'accent'
      ? 'text-[var(--cromo-accent)]'
      : tone === 'success'
        ? 'text-[var(--cromo-success)]'
        : 'text-[var(--cromo-fg)]';
  return (
    <Card>
      <div className="text-xs uppercase tracking-wider text-[var(--cromo-fg-subtle)] font-semibold mb-2">
        {label}
      </div>
      <div className={cx('font-display font-bold text-3xl tracking-tight', valueColor)}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-[var(--cromo-fg-muted)]">{hint}</div>}
    </Card>
  );
}
