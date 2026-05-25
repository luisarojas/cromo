'use client';

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Tailwind colour name used for the focus ring — 'blue' on the offer side, 'emerald' on the want side. */
  accent: 'blue' | 'emerald';
}

/**
 * CashInput — currency input used on both sides of a trade. Extracted so the
 * pair stays in sync; previously the markup was duplicated inline in
 * TradeStickerPicker with subtle drift between the offer and want copies.
 */
export default function CashInput({ value, onChange, accent }: Props) {
  const ring = accent === 'blue' ? 'focus:ring-[var(--cromo-accent)]' : 'focus:ring-[var(--cromo-success)]';
  return (
    <>
      <span className="text-xs text-[var(--cromo-fg-subtle)]">+ CA$</span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className={`w-20 rounded border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-2 py-1 text-xs focus:outline-none focus:ring-1 ${ring}`}
      />
    </>
  );
}
