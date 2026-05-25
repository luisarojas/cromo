'use client';

import { useTheme } from '@/components/ThemeProvider';

interface ThemeToggleProps {
  /** Compact icon-only variant for the NavBar. */
  compact?: boolean;
  className?: string;
}

export default function ThemeToggle({ compact, className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  if (compact) {
    return (
      <button
        onClick={toggleTheme}
        aria-label={label}
        title={label}
        className={`flex h-8 w-8 items-center justify-center rounded-btn text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors ${className ?? ''}`}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-btn border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] p-1 ${className ?? ''}`}
      role="group"
      aria-label="Theme"
    >
      <ToggleOption active={isDark} onClick={() => isDark || toggleTheme()} icon={<MoonIcon />}>
        Dark
      </ToggleOption>
      <ToggleOption active={!isDark} onClick={() => !isDark || toggleTheme()} icon={<SunIcon />}>
        Light
      </ToggleOption>
    </div>
  );
}

function ToggleOption({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-chip text-xs font-medium transition-colors ${
        active
          ? 'bg-[var(--cromo-surface)] text-[var(--cromo-fg)]'
          : 'text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
      }`}
      aria-pressed={active}
    >
      {icon}
      {children}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
