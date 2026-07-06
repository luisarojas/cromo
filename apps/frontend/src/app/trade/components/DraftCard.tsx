'use client';

import { type ThirdPartyDraft } from '@/lib/api';

interface Props {
  draft: ThirdPartyDraft;
  onResume: () => void;
  onDelete: () => void;
}

function fmtDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * DraftCard — one row of the "Saved drafts" section in My Trades.
 *
 * Mirrors the card density of TradesList's request cards, plus a "Draft"
 * badge to distinguish parked plans from real trade history (drafts have no
 * counterparty user and never enter the trade_requests feed).
 */
export default function DraftCard({ draft, onResume, onDelete }: Props) {
  const partner = draft.partnerName?.trim() || 'Unnamed partner';
  // Copy counts. quantity null (drafts saved before per-row counts existed)
  // counts as one copy — the exact number isn't known until resume re-matches.
  const copies = (rows: { quantity: number | null }[]): number =>
    rows.reduce((s, r) => s + (r.quantity ?? 1), 0);
  const receiveCount = copies(draft.selectionIReceive);
  const giveCount = copies(draft.selectionIGive);
  const updated = new Date(draft.updatedAt).toLocaleDateString();
  const hasCash = draft.iReceiveCashCents > 0 || draft.iGiveCashCents > 0;

  return (
    <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-[var(--cromo-fg)] truncate">{partner}</span>
            <span
              title="In-progress third-party trade plan — not yet recorded"
              className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--cromo-warning-soft)] text-[var(--cromo-warning-text)]"
            >
              Draft
            </span>
          </div>
          <div className="text-xs text-[var(--cromo-fg-muted)] mt-1">
            Receive {receiveCount} · Give {giveCount}
            {hasCash && (
              <>
                {' · '}
                {draft.iReceiveCashCents > 0 && <span>+${fmtDollars(draft.iReceiveCashCents)} in</span>}
                {draft.iReceiveCashCents > 0 && draft.iGiveCashCents > 0 && <span>, </span>}
                {draft.iGiveCashCents > 0 && <span>${fmtDollars(draft.iGiveCashCents)} out</span>}
              </>
            )}
          </div>
          <div className="text-xs text-[var(--cromo-fg-subtle)] mt-0.5">Last updated {updated}</div>
        </div>
        <div className="flex flex-col gap-1.5 items-end shrink-0">
          <button
            onClick={onResume}
            className="rounded-md bg-[var(--cromo-accent)] px-3 py-1.5 text-xs font-medium text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] transition-colors"
          >
            Resume
          </button>
          <button
            onClick={onDelete}
            className="text-[11px] text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-danger-text)] transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
