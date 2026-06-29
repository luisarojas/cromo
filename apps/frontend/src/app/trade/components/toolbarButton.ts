// Shared style for the secondary "fill in their list" actions (import from
// another app, take photo, upload photo). Keeping them on one class string is
// what makes the toolbar read as a single, consistent group rather than the
// earlier mix of outlined chips and bare text links.
export const TOOLBAR_BTN_CLASS =
  'inline-flex items-center gap-1.5 rounded-md border border-[var(--cromo-border-strong)] ' +
  'bg-[var(--cromo-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--cromo-fg-muted)] ' +
  'hover:text-[var(--cromo-fg)] hover:border-[var(--cromo-accent)] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
